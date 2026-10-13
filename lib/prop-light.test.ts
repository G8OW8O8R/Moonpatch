import { describe, expect, it } from "vitest";
import { type BurningLight, FLICKER_GAIN, lanternFalloff, lanternGlass, LANTERN, warmLight } from "./prop-light";

const bulb = (x: number, y: number, level = 1, flicker = 1): BurningLight => ({ kind: "bulb", x, y, level, flicker });

describe("warmLight", () => {
  it("is dark while every light is off", () => {
    expect(warmLight({ x: 0, y: 0 }, [bulb(100, 0, 0), bulb(-50, 20, 0)]).strength).toBe(0);
  });

  it("comes from where the lights are", () => {
    const { dir } = warmLight({ x: 0, y: 0 }, [bulb(-200, 0), bulb(-180, -40)]);
    expect(dir.x).toBeLessThan(-0.9);
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 6);
  });

  it("grows as lights come on and as they come closer, never past 1", () => {
    const at = { x: 0, y: 0 };
    const far = warmLight(at, [bulb(900, 0)]).strength;
    const near = warmLight(at, [bulb(120, 0)]).strength;
    const many = warmLight(at, Array.from({ length: 40 }, (_, i) => bulb(50 + i, 0))).strength;
    expect(near).toBeGreaterThan(far);
    expect(warmLight(at, [bulb(120, 0, 0.5)]).strength).toBeLessThan(near);
    expect(many).toBeLessThanOrEqual(1);
  });

  it("breathes with the nearest light, deeper than the light itself", () => {
    const at = { x: 0, y: 0 };
    const steady = warmLight(at, [bulb(100, 0), bulb(900, 0)]).strength;
    const up = warmLight(at, [bulb(100, 0, 1, 1.015), bulb(900, 0)]).strength;
    const farUp = warmLight(at, [bulb(100, 0), bulb(900, 0, 1, 1.015)]).strength;
    expect(up).toBeGreaterThan(steady);
    // The near bulb sets the beat; the far one barely moves it.
    expect(up - steady).toBeGreaterThan(10 * (farUp - steady));
    expect((up - steady) / steady).toBeCloseTo(0.015 * FLICKER_GAIN, 2);
    expect(FLICKER_GAIN).toBeGreaterThan(1);
  });

  it("stays clear of saturation where many lights burn, so the beat still shows", () => {
    const crowd = Array.from({ length: 60 }, (_, i) => bulb(80 + (i % 10) * 30, -60 + Math.floor(i / 10) * 30));
    const steady = warmLight({ x: 0, y: 0 }, crowd).strength;
    expect(steady).toBeLessThan(0.9);
  });
});

describe("the lantern", () => {
  it("lights the wood less the further it is", () => {
    expect(lanternFalloff(0)).toBe(1);
    expect(lanternFalloff(LANTERN.reach)).toBeCloseTo(0.5, 6);
    expect(lanternFalloff(600)).toBeLessThan(lanternFalloff(200));
  });

  it("glows only inside its glass", () => {
    expect(lanternGlass(0)).toBe(1);
    expect(lanternGlass(LANTERN.glass)).toBe(0);
    expect(lanternGlass(LANTERN.glass + 30)).toBe(0);
  });
});
