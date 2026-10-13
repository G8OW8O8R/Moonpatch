/**
 * The camera between the square and a building: a quick push
 * in on the door that builds speed, a cut on the room at the very top of
 * that speed, and the room settling as the camera brakes. Going back out is
 * the same move turned around, with the cut again at its fastest moment.
 *
 * The whole journey is one number, j: 0 is the square at rest, 1 the room at
 * rest, and the cut sits at ½. Everything on screen is a function of j, so a
 * move can be stopped and turned back anywhere, through the cut as well, and
 * it retraces the very same frames.
 */
import { type PlateWindow, bezierEasing } from "./gate-rig";
import { type CubicBezier, duration, ease } from "./motion-tokens";
import { DOORS, ROOM_REST_ZOOM, type Size, roomBox } from "./plate-box";
import type { RoomId } from "./rooms";
import { type Shift, type Vec2, onScreen } from "./square-rig";

export interface DoorParams {
  /** Length of the move, seconds. */
  duration: number;
  /** How far the square is magnified when the cut comes. */
  zCut: number;
  /** Blur at the top speed, CSS px, on the screen point that moves fastest. */
  blur: number;
  /** Blur grows with the speed to this power. */
  blurPower: number;
  /** Share of the move at which the cut falls; null puts it on the camera's top speed. */
  cutAt: number | null;
  /** Magnification of the room at the cut (it rests at ROOM_REST_ZOOM). */
  roomFrom: number;
  /** How much faster than the room the door leaves slide past. */
  leafRate: number;
  /** Before the cut, the square's exposure is brought to the room's over this long, seconds. */
  exposure: number;
  /** A move turned back on itself swings round over this long, seconds. */
  turn: number;
}

export const defaultDoor: Readonly<DoorParams> = {
  duration: duration.scene,
  zCut: 2.6,
  blur: 16,
  blurPower: 2,
  cutAt: null,
  roomFrom: 1,
  leafRate: 1.6,
  exposure: 0.08,
  turn: 0.12,
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

const CURVE: CubicBezier = ease.camera;
const curve = bezierEasing(CURVE);

/** Slope of the camera curve (progress per share of time). */
function slope(t: number): number {
  const h = 1e-4;
  const a = Math.max(0, t - h);
  const b = Math.min(1, t + h);
  return (curve(b) - curve(a)) / (b - a);
}

/** Where the camera curve is fastest: its share of time and its slope there. */
export const PEAK: Readonly<{ t: number; slope: number }> = (() => {
  let t = 0;
  let best = 0;
  // Coarse, then fine: the curve has a single, smooth peak.
  for (let i = 0; i <= 1000; i++) {
    const s = slope(i / 1000);
    if (s > best) [best, t] = [s, i / 1000];
  }
  for (let i = -100; i <= 100; i++) {
    const at = t + i / 1e5;
    const s = slope(at);
    if (s > best) [best, t] = [s, at];
  }
  return { t, slope: best };
})();

/** Share of the move at which the cut falls. */
export const cutTime = (params: DoorParams = defaultDoor) => params.cutAt ?? PEAK.t;

/** Camera progress at the cut. */
export const cutProgress = (params: DoorParams = defaultDoor) => curve(cutTime(params));

/** +1 goes into the building, -1 comes out onto the square. */
export type Leg = 1 | -1;

/** j for a camera progress along a leg. */
function journey(leg: Leg, u: number, params: DoorParams): number {
  const p = cutProgress(params);
  const into = u < p ? (0.5 * u) / p : 0.5 + (0.5 * (u - p)) / (1 - p);
  return leg === 1 ? into : 1 - into;
}

/** How fast j runs per unit of camera progress, at this j on this leg. */
function journeyRate(leg: Leg, j: number, params: DoorParams): number {
  const p = cutProgress(params);
  // Into the building the square comes first; out of it, the room.
  const beforeCut = leg === 1 ? j < 0.5 : j > 0.5;
  return beforeCut ? 0.5 / p : 0.5 / (1 - p);
}

export interface Head {
  /** Where the journey is (0 square … 1 room). */
  j: number;
  /** Its speed, per second. */
  v: number;
}

/** The head a leg played from its start has reached after `seconds`. */
export function legAt(leg: Leg, seconds: number, params: DoorParams = defaultDoor): Head {
  const t = clamp01(seconds / params.duration);
  const j = journey(leg, curve(t), params);
  const v = t >= 1 ? 0 : (leg * slope(t) * journeyRate(leg, j, params)) / params.duration;
  return { j, v };
}

/**
 * How fast the camera moves, 0–1 of its top speed. The leg the head is on
 * (or, while it swings round, the one it came along) sets the scale, so the
 * speed never jumps where a move is turned around.
 */
export function paceOf(head: Head, leg: Leg, params: DoorParams = defaultDoor): number {
  const top = (PEAK.slope * journeyRate(leg, head.j, params)) / params.duration;
  return clamp01(Math.abs(head.v) / top);
}

/** Blur at the fastest screen point, CSS px. */
export function blurOf(pace: number, params: DoorParams = defaultDoor): number {
  return params.blur * clamp01(pace) ** params.blurPower;
}

// ------------------------------------------------------------- the moves

/** A move in flight: played along a leg, or turned around and on its way back. */
export type Move =
  | { kind: "leg"; leg: Leg; start: number }
  | {
      kind: "turn";
      /** The leg it came along, and the one it now heads back on. */
      from: Leg;
      leg: Leg;
      start: number;
      head: Head;
      /** Speed it swings round to, and how long the stop then takes. */
      speed: number;
      stop: number;
    };

export interface MoveFrame {
  head: Head;
  /** The leg that scales the speed right now. */
  leg: Leg;
  /** The head has arrived where the move was going. */
  done: boolean;
}

/** End of a leg: 1 for the room, 0 for the square. */
const endOf = (leg: Leg) => (leg === 1 ? 1 : 0);

export function moveAt(move: Move, now: number, params: DoorParams = defaultDoor): MoveFrame {
  const seconds = Math.max(0, now - move.start);
  if (move.kind === "leg") {
    return { head: legAt(move.leg, seconds, params), leg: move.leg, done: seconds >= params.duration };
  }
  const { head, speed, stop } = move;
  const v1 = move.leg * speed;
  const swing = params.turn;
  if (seconds < swing) {
    // Speed changes evenly from where it was to the way back: no jump in place or in pace.
    const a = (v1 - head.v) / swing;
    const j = clamp01(head.j + head.v * seconds + 0.5 * a * seconds * seconds);
    const v = head.v + a * seconds;
    return { head: { j, v }, leg: Math.sign(v) === move.from || v === 0 ? move.from : move.leg, done: false };
  }
  // Then an even stop onto the end, from that speed.
  const j1 = turnPoint(move, params);
  const s = Math.min(1, (seconds - swing) / stop);
  const end = endOf(move.leg);
  const j = end + (j1 - end) * (1 - s) * (1 - s);
  const v = s >= 1 ? 0 : (-2 * (j1 - end) * (1 - s)) / stop;
  return { head: { j, v }, leg: move.leg, done: s >= 1 };
}

/** Where a turning head is once it has swung round. */
function turnPoint(move: Extract<Move, { kind: "turn" }>, params: DoorParams): number {
  const swing = params.turn;
  const v1 = move.leg * move.speed;
  return clamp01(move.head.j + ((move.head.v + v1) / 2) * swing);
}

/**
 * Turns a move around at `now`, heading for the other end. It swings round
 * over a short moment and comes back the same way, as fast as it was going
 * (never slower than it needs to be home within one move, never faster than
 * the move at its fastest).
 */
export function turnAround(move: Move, now: number, params: DoorParams = defaultDoor): Move {
  const { head, leg } = moveAt(move, now, params);
  const back = -move.leg as Leg;
  const end = endOf(back);
  const top = (PEAK.slope * Math.max(0.5 / cutProgress(params), 0.5 / (1 - cutProgress(params)))) / params.duration;
  const reach = Math.abs(head.j - end);
  const speed = Math.min(top, Math.max(Math.abs(head.v), (2 * reach) / params.duration, 1e-3));
  const draft = { kind: "turn" as const, from: leg, leg: back, start: now, head, speed, stop: 0 };
  // An even stop from that speed over what is left to go.
  const left = Math.abs(turnPoint(draft, params) - end);
  return { ...draft, stop: Math.max(1e-3, (2 * left) / speed) };
}

// ------------------------------------------------------------ the camera

/** Magnification of the square on its way to the cut (1 at rest, zCut at the cut). */
export function squareZoom(j: number, params: DoorParams = defaultDoor): number {
  return params.zCut ** clamp01(j / 0.5);
}

/** Magnification of the room after the cut (roomFrom at the cut, ROOM_REST_ZOOM at rest). */
export function roomZoom(j: number, params: DoorParams = defaultDoor): number {
  return params.roomFrom + (ROOM_REST_ZOOM - params.roomFrom) * clamp01((j - 0.5) / 0.5);
}

/** Is this point of the journey in the room (past the cut)? */
export const inRoom = (j: number) => j >= 0.5;

/**
 * The push-in on a door, on top of the square's own window: magnified about
 * the door, which glides to the middle of the screen on the way.
 */
export function doorShift(viewport: Size, base: PlateWindow, room: RoomId, j: number, params: DoorParams = defaultDoor): Shift {
  const z = squareZoom(j, params);
  const door = onScreen(base, DOORS[room].x, DOORS[room].y);
  const glide = params.zCut > 1 ? (z - 1) / (params.zCut - 1) : 0;
  const centre = { x: viewport.width / 2, y: viewport.height / 2 };
  return { scale: z, about: door, by: { x: (centre.x - door.x) * glide, y: (centre.y - door.y) * glide } };
}

/** The room's window at this point of the journey (before any drift with the pointer). */
export function roomWindow(viewport: Size, j: number, params: DoorParams = defaultDoor): PlateWindow {
  const box = roomBox(viewport, roomZoom(j, params));
  return { scale: box.scale, origin: { x: box.x, y: box.y } };
}

const shifted = (w: PlateWindow, s: Shift): PlateWindow => ({
  scale: w.scale * s.scale,
  origin: { x: s.about.x + (w.origin.x - s.about.x) * s.scale + s.by.x, y: s.about.y + (w.origin.y - s.about.y) * s.scale + s.by.y },
});

/** The plate's window at any point of the journey: the square pushed in, or the room. */
export function journeyWindow(viewport: Size, base: PlateWindow, room: RoomId, j: number, params: DoorParams = defaultDoor): PlateWindow {
  return inRoom(j) ? roomWindow(viewport, j, params) : shifted(base, doorShift(viewport, base, room, j, params));
}

/**
 * A door leaf's window: it slides past `leafRate` times faster than the room
 * where its edge is, scaled about the screen's side so its outer edge never
 * comes into view. At rest it lies exactly on the room.
 */
export function leafWindow(viewport: Size, room: PlateWindow, rest: PlateWindow, edgeX: number, side: "left" | "right", params: DoorParams = defaultDoor): PlateWindow {
  const edge = room.origin.x + room.scale * edgeX;
  const restEdge = rest.origin.x + rest.scale * edgeX;
  const wanted = restEdge + params.leafRate * (edge - restEdge);
  const anchor = side === "left" ? 0 : viewport.width;
  const m = Math.abs(edge - anchor) > 1e-6 ? (wanted - anchor) / (edge - anchor) : 1;
  const mid = viewport.height / 2;
  return {
    scale: room.scale * m,
    origin: { x: anchor + (room.origin.x - anchor) * m, y: mid + (room.origin.y - mid) * m },
  };
}

/**
 * How the screen moves at this point of the journey, as a field: a screen
 * point x travels along k·x + b. Zooms give a radial field, slides a straight
 * one; only its shape matters, the blur's strength comes from the pace.
 */
export function cameraField(viewport: Size, base: PlateWindow, room: RoomId, j: number, params: DoorParams = defaultDoor): { k: number; b: Vec2 } {
  const h = 1e-3;
  // Measured on the side of the cut the point is on: the cut itself is no motion.
  const [j0, j1] = inRoom(j) ? [Math.max(0.5, j - h), Math.max(0.5, j - h) + h] : [Math.min(0.5 - h, j), Math.min(0.5 - h, j) + h];
  const a = journeyWindow(viewport, base, room, j0, params);
  const c = journeyWindow(viewport, base, room, j1, params);
  const k = (c.scale - a.scale) / a.scale / h;
  return { k, b: { x: (c.origin.x - a.origin.x) / h - k * a.origin.x, y: (c.origin.y - a.origin.y) / h - k * a.origin.y } };
}

/** The field scaled so its fastest corner of the screen is 1. */
export function unitField(viewport: Size, field: { k: number; b: Vec2 }): { k: number; b: Vec2 } {
  let most = 0;
  for (const x of [0, viewport.width])
    for (const y of [0, viewport.height]) most = Math.max(most, Math.hypot(field.k * x + field.b.x, field.k * y + field.b.y));
  if (most < 1e-9) return { k: 0, b: { x: 0, y: 0 } };
  return { k: field.k / most, b: { x: field.b.x / most, y: field.b.y / most } };
}

/**
 * How far the square's exposure has gone towards the room's (0–1): over the
 * last moment before the cut on the way in, and the first after it on the way
 * out. A function of j, so a turned move passes through the same light.
 */
export function exposureMix(j: number, params: DoorParams = defaultDoor): number {
  if (inRoom(j)) return 0;
  const from = legAt(1, Math.max(0, cutTime(params) * params.duration - params.exposure), params).j;
  const t = clamp01((j - from) / (0.5 - from));
  return t * t * (3 - 2 * t);
}
