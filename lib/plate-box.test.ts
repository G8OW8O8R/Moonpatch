import { describe, expect, it } from "vitest";
import {
  CENTER,
  GATE_ANCHOR,
  PLATE,
  coverSizes,
  objectPosition,
  plateBox,
  plateToViewport,
  viewportToPlate,
} from "./plate-box";

const viewports = [
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
  { width: 3440, height: 1440 },
];

describe("plateBox", () => {
  it.each(viewports)("covers a $width×$height viewport without stretching", (viewport) => {
    const box = plateBox(viewport, PLATE, GATE_ANCHOR);

    expect(box.width / box.height).toBeCloseTo(PLATE.width / PLATE.height, 10);
    expect(box.x).toBeLessThanOrEqual(0);
    expect(box.y).toBeLessThanOrEqual(0);
    expect(box.x + box.width).toBeGreaterThanOrEqual(viewport.width - 1e-9);
    expect(box.y + box.height).toBeGreaterThanOrEqual(viewport.height - 1e-9);
  });

  it("fits one axis exactly and crops only the other", () => {
    const phone = plateBox({ width: 390, height: 844 });
    expect(phone.height).toBeCloseTo(844, 10);
    expect(phone.width).toBeGreaterThan(390);

    const ultrawide = plateBox({ width: 3440, height: 1440 });
    expect(ultrawide.width).toBeCloseTo(3440, 10);
    expect(ultrawide.height).toBeGreaterThan(1440);
  });

  it("distributes the overflow by the anchor like object-position", () => {
    const viewport = { width: 390, height: 844 };
    expect(plateBox(viewport, PLATE, { x: 0, y: 0 }).x).toBe(0);

    const right = plateBox(viewport, PLATE, { x: 1, y: 0 });
    expect(right.x + right.width).toBeCloseTo(viewport.width, 10);

    const centred = plateBox(viewport, PLATE, CENTER);
    expect(centred.x + centred.width / 2).toBeCloseTo(viewport.width / 2, 10);
  });

  it("clamps anchors outside 0–1 so the plate never leaves a gap", () => {
    const box = plateBox({ width: 390, height: 844 }, PLATE, { x: 1.4, y: -2 });
    expect(box.x + box.width).toBeCloseTo(390, 10);
    expect(box.y).toBe(0);
  });

  it("rejects empty or invalid sizes", () => {
    expect(() => plateBox({ width: 0, height: 844 })).toThrow(RangeError);
    expect(() => plateBox({ width: 390, height: Number.NaN })).toThrow(RangeError);
  });
});

describe("plate ↔ viewport mapping", () => {
  it.each(viewports)("round-trips points on a $width×$height viewport", (viewport) => {
    const box = plateBox(viewport, PLATE, GATE_ANCHOR);
    for (const point of [
      { u: 0, v: 0 },
      { u: 0.5, v: 0.5 },
      { u: 1288 / 2576, v: 861 / 1438 },
      { u: 1, v: 1 },
    ]) {
      const back = viewportToPlate(box, plateToViewport(box, point));
      expect(back.u).toBeCloseTo(point.u, 10);
      expect(back.v).toBeCloseTo(point.v, 10);
    }
  });

  it("maps the plate corners onto the box edges", () => {
    const box = plateBox({ width: 1536, height: 864 });
    expect(plateToViewport(box, { u: 0, v: 0 })).toEqual({ x: box.x, y: box.y });
    const corner = plateToViewport(box, { u: 1, v: 1 });
    expect(corner.x).toBeCloseTo(box.x + box.width, 10);
    expect(corner.y).toBeCloseTo(box.y + box.height, 10);
  });
});

describe("CSS helpers", () => {
  it("formats the anchor as object-position percentages", () => {
    expect(objectPosition(CENTER)).toBe("50% 50%");
    expect(objectPosition(GATE_ANCHOR)).toBe("50% 55%");
    expect(objectPosition({ x: 1 / 3, y: 2 })).toBe("33.3333% 100%");
  });

  it("describes the rendered width for responsive image selection", () => {
    expect(coverSizes()).toBe("(max-aspect-ratio: 2576/1438) 179.14vh, 100vw");
  });
});
