import { describe, expect, it } from "vitest";
import { randomFrom, tornPolygon } from "./torn-edge";

describe("tornPolygon", () => {
  it("tears the same way for the same seed, differently for another", () => {
    expect(tornPolygon("01-latte")).toBe(tornPolygon("01-latte"));
    expect(tornPolygon("01-latte")).not.toBe(tornPolygon("02-donuts"));
  });

  it("bites no deeper than asked", () => {
    const px = [...tornPolygon("x", { depth: 4 }).matchAll(/([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(px.length).toBeGreaterThan(0);
    expect(Math.max(...px)).toBeLessThanOrEqual(4);
  });

  it("keeps untorn edges straight", () => {
    const polygon = tornPolygon("x", { torn: ["top"], points: 4 });
    expect(polygon).toBe(polygon.replace(/calc\(100% - [1-9][\d.]*px\)/g, "!"));
    expect((polygon.match(/,/g) ?? []).length + 1).toBe(4 + 3);
  });
});

describe("randomFrom", () => {
  it("stays within 0–1", () => {
    const random = randomFrom("seed");
    for (let i = 0; i < 1000; i++) {
      const n = random();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});
