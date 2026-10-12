/**
 * The square after the ride: one long scroll that lets dusk fall, lights the
 * strings and windows, and ends on a slow push-in. On portrait screens the
 * camera also pans across the square while dusk falls (barn, café, shop) and
 * comes back to the café, which is where the ride left it.
 *
 * Everything here is measured in square plate pixels and screen pixels, like
 * plate-box. A camera move is a 2D window per depth: nearer things (the
 * signpost, the notice board) are pushed further than the plate, which gives
 * them their parallax.
 */
import { type PlateWindow, bezierEasing } from "./gate-rig";
import { ease } from "./motion-tokens";
import { PLATE, SQUARE_ANCHOR, type Size, posterPlate, squareBox } from "./plate-box";

/** Lengths of the scroll, in viewport heights. */
export interface Track {
  /** Scroll that drives the gate (its progress runs 0–1 over this). */
  gate: number;
  /** Share of the gate's progress after which the square takes over (past the ride's threshold). */
  start: number;
  /** Scroll over which dusk falls. */
  dusk: number;
  /** The closing push-in. */
  wander: number;
}

export const defaultTrack: Readonly<Track> = { gate: 1.5, start: 0.5, dusk: 1.5, wander: 0.5 };

/** Scroll from the top of the section to where the square comes to rest, in viewport heights. */
export function trackEnd(track: Track = defaultTrack): number {
  return track.gate * track.start + track.dusk + track.wander;
}

/** Height of the whole section in viewport heights: all the scroll plus the pinned screen itself. */
export function trackLength(track: Track = defaultTrack): number {
  return trackEnd(track) + 1;
}

export interface TrackProgress {
  /** Gate progress, 0–1 over `track.gate` (it never needs to go past `start`). */
  gate: number;
  dusk: number;
  wander: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Where each part of the scene stands for a scroll offset into the section (viewport heights). */
export function trackAt(scrolled: number, track: Track = defaultTrack): TrackProgress {
  const squareFrom = track.gate * track.start;
  return {
    gate: clamp01(scrolled / track.gate),
    dusk: clamp01((scrolled - squareFrom) / track.dusk),
    wander: clamp01((scrolled - squareFrom - track.dusk) / track.wander),
  };
}

/** Fastest the square may follow the scroll, in track lengths per second (as the gate opening). */
export const SQUARE_FOLLOW = { dusk: 0.6, wander: 0.9 } as const;

// ------------------------------------------------------------------ dusk

const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Moments along the fall of dusk (its progress, 0–1). */
export const DUSK = {
  /** The colour of the plate goes from golden to dusk over this stretch. */
  grade: [0, 0.75],
  /** Lights come on in order across this stretch; each takes `lightRamp` to reach full. */
  lights: [0.2, 0.9],
  lightRamp: 0.05,
  /** The sky is dark enough for paper type from here on. */
  header: 0.68,
  /** Every string is lit: the tagline may come in. */
  tagline: 0.95,
} as const;

/** How far the plate's colour has gone from golden to dusk. */
export function gradeAt(dusk: number): number {
  return smoothstep(DUSK.grade[0], DUSK.grade[1], dusk);
}

/** When a light with this place in the order starts to come on. */
export function lightStart(order: number): number {
  return DUSK.lights[0] + clamp01(order) * (DUSK.lights[1] - DUSK.lights[0]);
}

/** How lit a light is at this point of dusk (0–1), before flicker. */
export function lightLevel(order: number, dusk: number): number {
  const start = lightStart(order);
  return smoothstep(start, start + DUSK.lightRamp, dusk);
}

/**
 * Filament flicker: a slow breath and a faster shimmer, never more than
 * `depth` either way, different for every light. Pure function of time.
 */
export function flicker(id: number, seconds: number, depth = 0.015): number {
  const phase = id * 1.618;
  const slow = Math.sin(seconds * (0.9 + (id % 7) * 0.11) + phase);
  const fast = Math.sin(seconds * (5.3 + (id % 5) * 0.7) + phase * 2.3) * Math.sin(seconds * 1.7 + phase);
  return 1 + depth * (0.6 * slow + 0.4 * fast);
}

// ---------------------------------------------------------------- camera

export interface SquareView {
  /** Followed dusk progress (0–1). */
  dusk: number;
  /** Followed push-in (0–1). */
  wander: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/** The square camera for one frame: the plate's window and how hard nearer layers are pushed. */
export interface SquareFrame {
  /** Window of the plate itself, pan included, before the push-in. */
  base: PlateWindow;
  /** The screen point the push-in closes on. */
  focus: Vec2;
  /** Extra magnification of the plate from the push-in (0 = none). */
  dolly: number;
}

/** How far the closing push-in magnifies the plate. */
export const WANDER_ZOOM = 0.045;

/** Where the portrait pan looks along the way (plate x of the screen's centre), by dusk progress. */
export const PAN_STOPS: ReadonlyArray<{ at: number; x: number }> = [
  { at: 0, x: SQUARE_ANCHOR.focus.u * PLATE.width },
  { at: 0.3, x: 520 },
  { at: 0.74, x: 2130 },
  { at: 1, x: SQUARE_ANCHOR.focus.u * PLATE.width },
];

/** Portrait screens pan; landscape ones see the whole square already. */
export function pans(viewport: Size): boolean {
  return posterPlate(viewport) === "gate-tall";
}

/** Plate x the portrait camera looks at, at this point of dusk. */
export function panTarget(dusk: number): number {
  const d = clamp01(dusk);
  for (let i = 1; i < PAN_STOPS.length; i++) {
    const a = PAN_STOPS[i - 1]!;
    const b = PAN_STOPS[i]!;
    if (d <= b.at) return a.x + (b.x - a.x) * smoothstep(a.at, b.at, d);
  }
  return PAN_STOPS.at(-1)!.x;
}

const wanderEase = bezierEasing(ease.inOut);

/** `pan: false` holds a portrait camera on the café (the plain-HTML square never pans). */
export function squareFrame(viewport: Size, view: SquareView, { pan = true }: { pan?: boolean } = {}): SquareFrame {
  const box = squareBox(viewport);
  let originX = box.x;
  if (pan && pans(viewport)) {
    // Shift by the pan relative to where the ride left the camera; the plate always covers the screen.
    const shift = panTarget(view.dusk) - panTarget(0);
    originX = Math.min(0, Math.max(viewport.width - box.width, box.x - shift * box.scale)) + 0;
  }
  const base: PlateWindow = { scale: box.scale, origin: { x: originX, y: box.y } };
  const focus = {
    x: base.origin.x + base.scale * SQUARE_ANCHOR.focus.u * PLATE.width,
    y: base.origin.y + base.scale * SQUARE_ANCHOR.focus.v * PLATE.height,
  };
  return { base, focus, dolly: WANDER_ZOOM * wanderEase(clamp01(view.wander)) };
}

/**
 * Window of a layer at some nearness (1 = the plate, 2 = twice as close):
 * the push-in magnifies it around the focus by `1 + dolly · nearness`.
 */
export function windowAt(frame: SquareFrame, nearness = 1): PlateWindow {
  const m = 1 + frame.dolly * nearness;
  return {
    scale: frame.base.scale * m,
    origin: {
      x: frame.focus.x + (frame.base.origin.x - frame.focus.x) * m,
      y: frame.focus.y + (frame.base.origin.y - frame.focus.y) * m,
    },
  };
}

/** A further move on top of a window: scale about a point, then slide (the push-in on the notice board). */
export interface Shift {
  scale: number;
  about: Vec2;
  by: Vec2;
}

export function shiftWindow(window: PlateWindow, shift: Shift): PlateWindow {
  return {
    scale: window.scale * shift.scale,
    origin: {
      x: shift.about.x + (window.origin.x - shift.about.x) * shift.scale + shift.by.x,
      y: shift.about.y + (window.origin.y - shift.about.y) * shift.scale + shift.by.y,
    },
  };
}

/** Plate pixel to screen. */
export function onScreen(window: PlateWindow, x: number, y: number): Vec2 {
  return { x: window.origin.x + window.scale * x, y: window.origin.y + window.scale * y };
}
