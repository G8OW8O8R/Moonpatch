/**
 * A damped spring for physical things that hang or swing: a signpost arm on
 * its nail, a tag on its string. Integrated in small fixed steps, so the
 * motion is the same at 30, 60 or 120 frames per second.
 */

export interface SpringParams {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface SpringState {
  value: number;
  velocity: number;
}

/** Below these the spring counts as settled and snaps onto its target. */
const REST_DISTANCE = 1e-3;
const REST_SPEED = 1e-2;

/** Longest step the integrator takes, in seconds. */
const MAX_STEP = 1 / 240;

export function stepSpring(state: SpringState, target: number, dt: number, params: SpringParams): SpringState {
  if (!(dt > 0)) return state;
  const steps = Math.max(1, Math.ceil(dt / MAX_STEP));
  const h = dt / steps;
  let { value, velocity } = state;
  for (let i = 0; i < steps; i++) {
    const force = -params.stiffness * (value - target) - params.damping * velocity;
    // Semi-implicit Euler: speed first, then position, which keeps the energy honest.
    velocity += (force / params.mass) * h;
    value += velocity * h;
  }
  if (isSettled({ value, velocity }, target)) return { value: target, velocity: 0 };
  return { value, velocity };
}

export function isSettled(state: SpringState, target: number): boolean {
  return Math.abs(state.value - target) < REST_DISTANCE && Math.abs(state.velocity) < REST_SPEED;
}

/**
 * Follows a target on a critically damped spring with a speed limit, never
 * passing it in either direction: a flick of the wheel plays a move out
 * instead of skipping it, and nothing overshoots. `limit` is in units per
 * second, `omega` sets how tightly it trails.
 */
export function followLimited(state: SpringState, target: number, dt: number, limit: number, omega = 14): SpringState {
  if (!(dt > 0)) return state;
  let { value, velocity } = state;
  const steps = Math.max(1, Math.ceil(dt / MAX_STEP));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const before = target - value;
    velocity += (omega * omega * before - 2 * omega * velocity) * h;
    velocity = Math.max(-limit, Math.min(limit, velocity));
    value += velocity * h;
    if (before === 0 || Math.sign(target - value) !== Math.sign(before)) {
      value = target;
      velocity = 0;
    }
  }
  if (Math.abs(target - value) < 1e-4 && Math.abs(velocity) < 1e-3) return { value: target, velocity: 0 };
  return { value, velocity };
}
