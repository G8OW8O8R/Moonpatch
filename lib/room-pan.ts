/**
 * Looking around a room on a narrow screen: the finger drags the room across
 * (the plate under the finger stays under it), and a flick carries on and
 * slows to a stop on its own. The door leaves are nearer than the room, so
 * they slide a little further than it, never more than a few pixels.
 */
import { ROOM_REST_ZOOM, type Size, lookRange, roomBox } from "./plate-box";

/** Furthest the leaves may slide past the room, CSS px. */
export const LEAF_PAN_LIMIT = 14;

/** A flick slows down with this time constant, seconds. */
const FRICTION = 0.325;

/** Below this speed (looks per second) a flick has stopped. */
const STILL = 0.002;

/** Fastest a flick may start, looks per second (a room's width in a fifth of a second is plenty). */
const MAX_SPEED = 5;

export interface Pan {
  /** Share of the plate's width at the middle of the screen. */
  look: number;
  /** Looks per second. */
  velocity: number;
}

export const clampLook = (viewport: Size, look: number) => {
  const { min, max } = lookRange(viewport);
  return Math.min(max, Math.max(min, look));
};

/**
 * Is this screen narrow enough to look around? The room has to run well past
 * its sides; the few per cent a wide screen has spare are for the leaves.
 */
export function pans(viewport: Size): boolean {
  return roomBox(viewport, 1).width > viewport.width * 1.15;
}

/** The look after the finger has moved `dx` CSS px (the room follows the finger). */
export function dragLook(viewport: Size, look: number, dx: number): number {
  return clampLook(viewport, look - dx / roomBox(viewport, ROOM_REST_ZOOM, look).width);
}

/** Speed of a flick from the finger's last speed (CSS px per second). */
export function flickVelocity(viewport: Size, pxPerSecond: number): number {
  const v = -pxPerSecond / roomBox(viewport).width;
  return Math.max(-MAX_SPEED, Math.min(MAX_SPEED, v));
}

/** One step of a flick carrying on by itself; it stops at the room's sides. */
export function glide(viewport: Size, pan: Pan, dt: number): Pan {
  if (pan.velocity === 0) return pan;
  const decay = Math.exp(-dt / FRICTION);
  // The distance the decaying speed covers over the step, exactly.
  const look = pan.look + pan.velocity * FRICTION * (1 - decay);
  const clamped = clampLook(viewport, look);
  const velocity = clamped !== look || Math.abs(pan.velocity * decay) < STILL ? 0 : pan.velocity * decay;
  return { look: clamped, velocity };
}

/**
 * How much further than the room a leaf slides when the camera looks away
 * from where it started, CSS px: its nearness ahead, easing into the limit.
 */
export function leafPanShift(viewport: Size, look: number, start: number, nearness: number): number {
  const at = (l: number) => roomBox(viewport, ROOM_REST_ZOOM, l).x;
  const moved = at(look) - at(clampLook(viewport, start));
  return LEAF_PAN_LIMIT * Math.tanh(((nearness - 1) * moved) / LEAF_PAN_LIMIT);
}
