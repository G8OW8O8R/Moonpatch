import { describe, expect, it } from "vitest";
import { spring } from "./motion-tokens";
import { type SpringState, followLimited, isSettled, stepSpring } from "./spring";

const run = (fps: number, seconds: number, target: number) => {
  let state: SpringState = { value: 0, velocity: 0 };
  const trace: number[] = [];
  for (let i = 0; i < fps * seconds; i++) {
    state = stepSpring(state, target, 1 / fps, spring.nail);
    trace.push(state.value);
  }
  return { state, trace };
};

describe("stepSpring", () => {
  it("swings past the target on a nail and settles exactly on it", () => {
    const { state, trace } = run(60, 3, 1);
    expect(Math.max(...trace)).toBeGreaterThan(1.01);
    expect(state).toEqual({ value: 1, velocity: 0 });
  });

  it("moves the same at 30, 60 and 144 frames per second", () => {
    const at = (fps: number) => run(fps, 0.3, 1).state.value;
    expect(at(30)).toBeCloseTo(at(144), 2);
    expect(at(60)).toBeCloseTo(at(144), 2);
  });

  it("ignores empty or broken time steps", () => {
    const state = { value: 0.3, velocity: 2 };
    expect(stepSpring(state, 1, 0, spring.nail)).toBe(state);
    expect(stepSpring(state, 1, Number.NaN, spring.nail)).toBe(state);
  });

  it("knows when it is at rest", () => {
    expect(isSettled({ value: 1, velocity: 0 }, 1)).toBe(true);
    expect(isSettled({ value: 1, velocity: 0.5 }, 1)).toBe(false);
  });
});

describe("followLimited", () => {
  it("never passes its target, in either direction", () => {
    for (const target of [1, -1]) {
      let state: SpringState = { value: 0, velocity: 0 };
      for (let i = 0; i < 400; i++) {
        state = followLimited(state, target, 1 / 60, 0.9);
        expect(Math.abs(state.value)).toBeLessThanOrEqual(1);
        expect(Math.sign(state.value) === Math.sign(target) || state.value === 0).toBe(true);
      }
      expect(state).toEqual({ value: target, velocity: 0 });
    }
  });

  it("keeps to its speed limit, so a flick plays out instead of jumping", () => {
    let state: SpringState = { value: 0, velocity: 0 };
    let previous = 0;
    for (let i = 0; i < 30; i++) {
      state = followLimited(state, 1, 1 / 60, 0.6);
      expect(state.value - previous).toBeLessThanOrEqual(0.6 / 60 + 1e-9);
      previous = state.value;
    }
    expect(state.value).toBeLessThan(0.35);
  });

  it("is on the target within 0.3 s of it stopping, at any frame rate and pace up to the limit", () => {
    for (const fps of [30, 60, 120]) {
      for (const limit of [0.6, 0.9, 2.25]) {
        for (const pace of [0.2, 0.5, 1]) {
          const dt = 1 / fps;
          let state: SpringState = { value: 0, velocity: 0 };
          let target = 0;
          for (let t = 0; t < 0.5; t += dt) {
            target += limit * pace * dt;
            state = followLimited(state, target, dt, limit);
          }
          let waited = 0;
          while (state.value !== target && waited < 1) {
            state = followLimited(state, target, dt, limit);
            waited += dt;
          }
          expect(state).toEqual({ value: target, velocity: 0 });
          expect(waited).toBeLessThanOrEqual(0.3);
        }
      }
    }
  });

  it("lands softly, even from a flick held back by its speed limit", () => {
    const dt = 1 / 60;
    let state: SpringState = { value: 0, velocity: 0 };
    let last = state;
    while (state.value !== 0.6) {
      last = state;
      state = followLimited(state, 0.6, dt, 2.25);
    }
    // The frame before it comes to rest it is already creeping, not braking hard against the target.
    expect(Math.abs(last.velocity)).toBeLessThan(2.25 * 0.1);
  });
});
