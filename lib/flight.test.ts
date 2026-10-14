import { describe, expect, it } from "vitest";
import { flightPath } from "./flight";

describe("the flight into the wheelbarrow", () => {
  const photo = { x: 1000, y: 300, width: 300, height: 375 };
  const barrow = { x: 1400, y: 40, width: 24, height: 24 };

  it("starts on the photo and lands on the wheelbarrow, its size", () => {
    const path = flightPath(photo, barrow);
    expect(path[0]).toMatchObject({ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 });
    const last = path.at(-1)!;
    expect(last.x).toBeCloseTo(1412 - 1150);
    expect(last.y).toBeCloseTo(52 - 487.5);
    expect(last.scale).toBeCloseTo(24 / 300);
    expect(last.opacity).toBe(0);
  });

  it("rises above both ends on the way", () => {
    const path = flightPath(photo, barrow, 32, 120);
    const top = Math.min(...path.map((s) => s.y + 487.5));
    expect(top).toBeLessThan(52);
    expect(top).toBeCloseTo(52 - 120, -1);
  });
});
