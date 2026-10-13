/**
 * Light on the things that stand on the square (the signpost, the notice
 * board), so they belong to the photograph: the same fall of dusk as the
 * plate behind them, a warm reflection from the strings and windows nearby
 * that breathes with those very lights, and the board's own lantern. Shared
 * by the WebGL scene and by the build that bakes the end of dusk for the
 * plain-HTML square. Self-contained, so the build can import it as is.
 */

export interface Point {
  x: number;
  y: number;
}

export type LightKind = "bulb" | "window" | "lamp";

/** A light on the plate (square plate px) and how it burns at this moment. */
export interface BurningLight extends Point {
  kind: LightKind;
  /** 0 off … 1 fully on. */
  level: number;
  /** The light's own flicker around 1, as the plate draws it. */
  flicker: number;
}

/** Colour of lamplight on wood. */
export const WARM: readonly [number, number, number] = [1.0, 0.66, 0.36];

/** How far each kind of light carries (plate px) and how bright it is. */
const REACH: Record<LightKind, number> = { bulb: 240, window: 360, lamp: 300 };
const WEIGHT: Record<LightKind, number> = { bulb: 0.45, window: 1, lamp: 0.9 };

/**
 * A reflection takes the flicker of its light, deeper: the same generator and
 * the same beat, `FLICKER_GAIN` times the swing, so it can be seen on wood.
 */
export const FLICKER_GAIN = 5;

/** How quickly the reflection saturates as more light gathers. */
const GATHER = 0.11;

export interface WarmLight {
  /** 0 – 1. */
  strength: number;
  /** Unit vector on the plate from the prop towards where the light comes from. */
  dir: Point;
}

/**
 * The warm light reaching a point from every light around it. Its strength
 * gathers from all of them; its beat is theirs, weighed so the nearest and
 * brightest set it.
 */
export function warmLight(at: Point, lights: ReadonlyArray<BurningLight>): WarmLight {
  let sx = 0;
  let sy = 0;
  let total = 0;
  let beat = 0;
  let beatWeight = 0;
  for (const light of lights) {
    if (light.level <= 0) continue;
    const dx = light.x - at.x;
    const dy = light.y - at.y;
    const d = Math.hypot(dx, dy) || 1;
    const fall = 1 / (1 + (d / REACH[light.kind]) ** 2);
    const w = WEIGHT[light.kind] * light.level * fall;
    total += w;
    sx += (w * dx) / d;
    sy += (w * dy) / d;
    beat += w * w * (1 + (light.flicker - 1) * FLICKER_GAIN);
    beatWeight += w * w;
  }
  const length = Math.hypot(sx, sy);
  const steady = 1 - Math.exp(-total * GATHER);
  return {
    strength: Math.min(1, steady * (beatWeight > 0 ? Math.max(0, beat / beatWeight) : 1)),
    dir: length > 1e-6 ? { x: sx / length, y: sy / length } : { x: 0, y: -1 },
  };
}

/** How the scene's light is laid onto a prop (the same numbers in the shader and the bake). */
export const PROP_LIGHT = {
  /**
   * The light the photograph was taken in, on the props' own colours: its
   * whites (the café's siding, the white pumpkins) are this warm and this low.
   */
  golden: [0.8, 0.67, 0.54] as const,
  /**
   * What dusk does to that light, read from the same neutral surfaces in
   * square-golden and square-dusk: lower and bluer. It follows the plate's own
   * grade curve.
   */
  dusk: [0.7, 0.7, 0.84] as const,
  /** Mip level the plate is read at for the air around a prop: its colour, not its detail. */
  airLod: 7,
  /** Share of the surrounding plate's colour laid over a prop: the air between it and the camera. */
  haze: 0.05,
  /** Warm reflection: across the whole face, and on the edges facing the light. */
  warm: 0.6,
  ramp: 0.6,
  rim: 0.9,
  /** Distance from an edge counted as its rim, CSS px on screen. */
  rimPx: 2.5,
  /** Pointed at: a touch brighter, and catching a little more warm light. */
  hoverLift: 0.07,
  hoverWarm: 0.14,
} as const;

/** The lantern on the notice board, in pixels of noticeboard.png. */
export const LANTERN = {
  /** Its light on the wood: reach (board px) and strength. */
  reach: 260,
  amount: 0.6,
  /** The glass itself, glowing: radius (board px) and strength. */
  glass: 58,
  glow: 0.55,
  /** Flame colour behind the glass. */
  flame: [1.0, 0.74, 0.42] as const,
  /** It comes on with the lights, at this place in their order, and wavers this much (same generator). */
  order: 0.35,
  flickerId: 997,
  flickerDepth: 0.07,
} as const;

/** Share of the lantern's light reaching a point this far from it (board px). */
export function lanternFalloff(distance: number): number {
  return 1 / (1 + (distance / LANTERN.reach) ** 2);
}

/** The glass, lit from within: 1 at its heart, 0 past its rim. */
export function lanternGlass(distance: number): number {
  const t = Math.min(1, Math.max(0, (LANTERN.glass - distance) / (LANTERN.glass * 0.45)));
  return t * t * (3 - 2 * t);
}
