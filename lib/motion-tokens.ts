/**
 * One vocabulary of timing for the whole farm. Values are in seconds (Motion,
 * GSAP); `motionCssVars` exposes the same numbers to CSS.
 */

export type CubicBezier = readonly [number, number, number, number];

export const duration = {
  /** Hover tints, pressed states. */
  tap: 0.15,
  /** Labels, tooltips, small reveals. */
  ui: 0.24,
  /** Cards, dialogs, the wheelbarrow tilt. */
  panel: 0.4,
  /** Short scene moves, e.g. up to the notice board. */
  sceneShort: 0.6,
  /** Door fly-through into a building. */
  scene: 0.9,
  /** Slowest scene change, dusk falling over the square. */
  sceneLong: 1.2,
  /** Everything collapses to this crossfade under reduced motion. */
  reduced: 0.15,
} as const;

export const ease = {
  /** Default for things arriving: quick start, long soft landing. */
  out: [0.22, 1, 0.36, 1],
  /** Things leaving or swapping in place. */
  inOut: [0.65, 0, 0.35, 1],
  /** Camera dolly: builds speed, then brakes hard on the new frame. */
  camera: [0.7, 0, 0.12, 1],
  /** Settle after a cut: scale and blur easing back to rest. */
  settle: [0.16, 1, 0.3, 1],
} as const satisfies Record<string, CubicBezier>;

/** Springs for physical objects only, never for plain UI. */
export const spring = {
  /** Gate leaves easing into their stop. */
  hinge: { stiffness: 120, damping: 18, mass: 1.4 },
  /** Signpost arm swinging on its nail. */
  nail: { stiffness: 260, damping: 14, mass: 0.6 },
  /** Paper tag swaying on its string. */
  string: { stiffness: 90, damping: 9, mass: 0.8 },
} as const;

export function cubicBezier(curve: CubicBezier): string {
  return `cubic-bezier(${curve.join(", ")})`;
}

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Custom properties for CSS transitions: `--duration-ui`, `--ease-out`, … */
export function motionCssVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, seconds] of Object.entries(duration)) {
    vars[`--duration-${kebab(key)}`] = `${Math.round(seconds * 1000)}ms`;
  }
  for (const [key, curve] of Object.entries(ease)) {
    vars[`--ease-${kebab(key)}`] = cubicBezier(curve);
  }
  return vars;
}
