/**
 * The camera rig of the gate scene.
 *
 * The world is measured in gate.jpg pixels. The camera that took gate.jpg sits
 * at the origin looking down +Z with its principal point on the vanishing
 * point of the road; the gate stands at Z = focal, so on the gate plane one
 * world unit is one plate pixel. Every layer is placed so that, seen from that
 * rest camera, it lands exactly on its own pixels of the plate — whatever its
 * depth. Moving the camera then gives each layer its parallax for free.
 *
 * On screen the plate is cropped like `object-fit: cover` (see plate-box), so
 * the projection ends with a 2D window: screen = origin + scale · image.
 */
import { type CubicBezier, ease, spring } from "./motion-tokens";
import { PLATE, SQUARE_ANCHOR, type Size, TALL_OFFSET, plateBox, posterBox } from "./plate-box";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Vanishing point of the road on gate.jpg: where the rest camera looks. */
export const PRINCIPAL: Readonly<Vec2> = { x: 1270, y: 706 };

/** Row of gate.jpg where the posts and the gate meet the road. */
export const GATE_GROUND_Y = 1362;

/** Height of the camera above the road, in world units. */
export const EYE_HEIGHT = GATE_GROUND_Y - PRINCIPAL.y;

export type LeafSide = "left" | "right";

/** The leaves turn on hinges at the inner faces of the posts. */
export const HINGE_X: Readonly<Record<LeafSide, number>> = { left: 409, right: 2207 };

/** Points from the hinge towards the latch along the closed leaf. */
const LEAF_DIRECTION: Readonly<Record<LeafSide, 1 | -1>> = { left: 1, right: -1 };

export interface RigParams {
  /** Lens of the rest camera, as full-frame equivalent millimetres. */
  focalMm: number;
  /** Distance of the square behind the camera, in gate distances. */
  squareDepth: number;
  /** How far the leaves swing open, in degrees. */
  angle: number;
  /** The hinge spring: shapes the swing and its small overshoot. */
  stiffness: number;
  damping: number;
  mass: number;
  /** Share of the section spent opening the gate; the rest is the ride in. */
  openEnd: number;
  /** Where the camera stops, in gate distances from the start. */
  travel: number;
  /** Extra push into the square at the peak of the ride (0.05 = 5 %). */
  push: number;
  /** Radial blur of the near layers at full speed, in CSS pixels. */
  blur: number;
  /** Opacity of the leaves' contact shadows. */
  shadowOpacity: number;
  /** How strongly a leaf darkens when it turns from the sun (0–1). */
  shade: number;
  /** Sun direction: azimuth from straight behind the camera towards the left, and elevation. */
  sunAzimuth: number;
  sunElevation: number;
}

export const defaultRig: Readonly<RigParams> = {
  focalMm: 35,
  squareDepth: 6,
  angle: 100,
  ...spring.hinge,
  openEnd: 0.4,
  travel: 1.55,
  push: 0.05,
  blur: 26,
  shadowOpacity: 0.5,
  shade: 0.8,
  sunAzimuth: 55,
  sunElevation: 38,
};

/** Focal length in plate pixels: 36 mm of sensor width spans the 2576 px plate. */
export function focalPx(params: Pick<RigParams, "focalMm">): number {
  return (params.focalMm / 36) * PLATE.width;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** CSS cubic-bezier timing function as a plain easing function. */
export function bezierEasing([x1, y1, x2, y2]: CubicBezier): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-7) return sampleY(t);
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    // Newton stalled on a flat stretch: bisect instead.
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

// The ride is scrubbed by the scroll, so it eases in and out evenly; a hard brake would leave the last stretch of scroll idle.
const rideEase = bezierEasing(ease.inOut);

/**
 * Step response of the hinge spring, scaled so it ends exactly on 1 with zero
 * speed: the leaf swings a touch past its stop and eases back onto it. A pure
 * function of scroll position, so scrubbing back retraces the same swing.
 */
export function hingeCurve(u: number, params: Pick<RigParams, "stiffness" | "damping" | "mass">): number {
  const t = clamp01(u);
  const w0 = Math.sqrt(params.stiffness / params.mass);
  const zeta = params.damping / (2 * Math.sqrt(params.stiffness * params.mass));

  if (zeta >= 1) {
    // No overshoot to land on: run the critically damped curve until it has settled.
    const end = 7 / w0;
    const x = (tau: number) => 1 - (1 + w0 * tau) * Math.exp(-w0 * tau);
    return x(t * end) / x(end);
  }

  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  // One full damped period: past the overshoot, at the bottom of the tiny undershoot.
  const end = (2 * Math.PI) / wd;
  const x = (tau: number) =>
    1 - Math.exp(-zeta * w0 * tau) * (Math.cos(wd * tau) + ((zeta * w0) / wd) * Math.sin(wd * tau));
  return x(t * end) / x(end);
}

/** A 2D crop of the plate: screen = origin + scale · (gate.jpg pixel). */
export interface PlateWindow {
  scale: number;
  origin: Vec2;
}

/** Window of the gate poster, whichever plate it shows, in gate.jpg pixels. */
export function restWindow(viewport: Size): PlateWindow {
  const { plate, box } = posterBox(viewport);
  const shift = plate === "gate-tall" ? TALL_OFFSET : { x: 0, y: 0 };
  return { scale: box.scale, origin: { x: box.x + box.scale * shift.x, y: box.y + box.scale * shift.y } };
}

/** Window of square-golden.jpg in the square's framing: the last frame of the ride. */
export function endWindow(viewport: Size): PlateWindow {
  const box = plateBox(viewport, PLATE, SQUARE_ANCHOR);
  return { scale: box.scale, origin: { x: box.x, y: box.y } };
}

export interface Camera {
  /** Section progress this camera was built for. */
  progress: number;
  /** Opening angle of the leaves in radians. */
  angle: number;
  /** Rest focal length (plate px) — also the distance of the gate. */
  focal0: number;
  /** Current focal length: shortened as the camera dollies, so the square holds still. */
  focal: number;
  /** Camera position along Z. */
  z: number;
  /** Scale of the square around the principal point (1 at both ends of the ride). */
  squareZoom: number;
  /** The 2D crop that turns image coordinates into screen pixels. */
  window: PlateWindow;
  /** 0 → 1 across the opening, 0 → 1 across the ride. */
  opening: number;
  ride: number;
}

export function cameraAt(progress: number, viewport: Size, params: RigParams = defaultRig): Camera {
  const p = clamp01(progress);
  const opening = clamp01(p / params.openEnd);
  const ride = clamp01((p - params.openEnd) / (1 - params.openEnd));
  const e = rideEase(ride);

  const focal0 = focalPx(params);
  // The arch leaves the frame within the first third of the travel: give that stretch more of the scroll.
  const z = e ** 1.5 * params.travel * focal0;
  const squareZoom = 1 + 4 * params.push * e * (1 - e);
  const depth = params.squareDepth * focal0;
  // Dolly zoom: the lens widens as the camera moves so the far square keeps its size.
  const focal = (squareZoom * focal0 * (depth - z)) / depth;

  const from = restWindow(viewport);
  const to = endWindow(viewport);
  // The principal point glides across the screen while the crop zooms evenly.
  const scale = from.scale * Math.pow(to.scale / from.scale, e);
  const anchor = {
    x: lerp(from.origin.x + from.scale * PRINCIPAL.x, to.origin.x + to.scale * PRINCIPAL.x, e),
    y: lerp(from.origin.y + from.scale * PRINCIPAL.y, to.origin.y + to.scale * PRINCIPAL.y, e),
  };
  const window = { scale, origin: { x: anchor.x - scale * PRINCIPAL.x, y: anchor.y - scale * PRINCIPAL.y } };

  return {
    progress: p,
    angle: ((params.angle * Math.PI) / 180) * hingeCurve(opening, params),
    focal0,
    focal,
    z,
    squareZoom,
    window,
    opening,
    ride,
  };
}

/** Where a world point lands on screen, or null when it is behind the camera. */
export function project(camera: Camera, point: Vec3): Vec2 | null {
  const w = point.z - camera.z;
  if (w <= 1e-6) return null;
  const image = {
    x: PRINCIPAL.x + (camera.focal * point.x) / w,
    y: PRINCIPAL.y + (camera.focal * point.y) / w,
  };
  return toScreen(camera.window, image);
}

/** Where a pixel of the square plate lands on screen. */
export function projectSquare(camera: Camera, pixel: Vec2): Vec2 {
  return toScreen(camera.window, {
    x: PRINCIPAL.x + camera.squareZoom * (pixel.x - PRINCIPAL.x),
    y: PRINCIPAL.y + camera.squareZoom * (pixel.y - PRINCIPAL.y),
  });
}

export function toScreen(window: PlateWindow, image: Vec2): Vec2 {
  return { x: window.origin.x + window.scale * image.x, y: window.origin.y + window.scale * image.y };
}

/** Depth at which a plate pixel lies when it rests on the road. */
export function groundDepth(row: number, focal0: number): number {
  const below = row - PRINCIPAL.y;
  if (below <= 0) throw new RangeError("rows above the horizon never touch the road");
  return (focal0 * EYE_HEIGHT) / below;
}

/** The world point that the rest camera sees at a plate pixel, placed at a depth. */
export function unproject(pixel: Vec2, depth: number, focal0: number): Vec3 {
  return {
    x: ((pixel.x - PRINCIPAL.x) * depth) / focal0,
    y: ((pixel.y - PRINCIPAL.y) * depth) / focal0,
    z: depth,
  };
}

/**
 * A point of a leaf, given by its plate pixel on the closed gate, swung open
 * by `angle` around its hinge. The leaves open away from the camera.
 */
export function leafPoint(side: LeafSide, pixel: Vec2, angle: number, focal0: number): Vec3 {
  const hinge = HINGE_X[side];
  const reach = (pixel.x - hinge) * LEAF_DIRECTION[side];
  return {
    x: hinge - PRINCIPAL.x + LEAF_DIRECTION[side] * reach * Math.cos(angle),
    y: pixel.y - PRINCIPAL.y,
    z: focal0 + reach * Math.sin(angle),
  };
}

/** Outward normal of a leaf's front face (the side the camera sees when closed). */
export function leafNormal(side: LeafSide, angle: number): Vec3 {
  return { x: LEAF_DIRECTION[side] * Math.sin(angle), y: 0, z: -Math.cos(angle) };
}

/** Unit vector pointing at the sun. Y grows downwards, so the sun has a negative Y. */
export function sunDirection(params: Pick<RigParams, "sunAzimuth" | "sunElevation">): Vec3 {
  const az = (params.sunAzimuth * Math.PI) / 180;
  const el = (params.sunElevation * Math.PI) / 180;
  return { x: -Math.cos(el) * Math.sin(az), y: -Math.sin(el), z: -Math.cos(el) * Math.cos(az) };
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Light falling on a face, relative to the closed gate as photographed (1 at rest). */
export function leafShade(side: LeafSide, angle: number, params: RigParams): number {
  const sun = sunDirection(params);
  const ambient = 0.35;
  const facing = leafNormal(side, angle);
  // Past 90° the camera sees the back of the leaf, which faces the other way.
  const seen = dot(facing, { x: 0, y: 0, z: -1 }) >= 0 ? facing : { x: -facing.x, y: 0, z: -facing.z };
  const lit = ambient + Math.max(0, dot(seen, sun));
  const rest = ambient + Math.max(0, dot(leafNormal(side, 0), sun));
  return Math.min(1.06, lerp(1, lit / rest, params.shade));
}

/** Where the sun throws a world point onto the road. */
export function shadowOnGround(point: Vec3, params: RigParams): Vec3 {
  const sun = sunDirection(params);
  const t = (point.y - EYE_HEIGHT) / sun.y;
  if (t <= 0) return { ...point, y: EYE_HEIGHT };
  return { x: point.x - t * sun.x, y: EYE_HEIGHT, z: point.z - t * sun.z };
}
