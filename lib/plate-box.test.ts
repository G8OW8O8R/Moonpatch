import { describe, expect, it } from "vitest";
import {
  CENTER,
  GATE_ANCHOR,
  SQUARE_ANCHOR,
  PLATE,
  PLATE_TALL,
  coverSizes,
  framedBox,
  gateToTall,
  gateToViewport,
  objectPosition,
  plateBox,
  plateToViewport,
  posterBox,
  posterPlate,
  squareBox,
  tallToGate,
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

describe("portrait gate plate", () => {
  const px = (x: number, y: number) => ({ u: x / PLATE.width, v: y / PLATE.height });
  const toTallPx = (x: number, y: number) => {
    const p = gateToTall(px(x, y));
    return { x: p.u * PLATE_TALL.width, y: p.v * PLATE_TALL.height };
  };

  it("shifts gate.jpg pixels by the measured offset", () => {
    for (const [x, y] of [
      [10, 0],
      [1288, 719],
      [2561, 1437],
    ] as const) {
      const tall = toTallPx(x, y);
      expect(tall.x).toBeCloseTo(x - 10, 9);
      expect(tall.y).toBeCloseTo(y + 1671, 9);
    }
  });

  it("round-trips between the two plates", () => {
    for (const point of [px(271, 900), px(2354, 1369), { u: 0.5, v: 0.5 }]) {
      const back = tallToGate(gateToTall(point));
      expect(back.u).toBeCloseTo(point.u, 12);
      expect(back.v).toBeCloseTo(point.v, 12);
    }
  });

  it.each([
    [{ width: 390, height: 844 }, "gate-tall"],
    [{ width: 799, height: 1000 }, "gate-tall"],
    [{ width: 800, height: 1000 }, "gate"],
    [{ width: 1024, height: 1366 }, "gate-tall"],
    [{ width: 1536, height: 864 }, "gate"],
    [{ width: 1920, height: 1080 }, "gate"],
  ] as const)("picks the plate for %o", (viewport, expected) => {
    expect(posterPlate(viewport)).toBe(expected);
  });

  it("places a gate point on the same spot through either plate", () => {
    const viewport = { width: 390, height: 844 };
    const { box } = posterBox(viewport);
    const latch = px(1288, 1100);
    const viaTall = plateToViewport(box, gateToTall(latch));
    expect(gateToViewport(viewport, latch)).toEqual(viaTall);

    const wide = { width: 1536, height: 864 };
    expect(gateToViewport(wide, latch)).toEqual(plateToViewport(plateBox(wide, PLATE, GATE_ANCHOR), latch));
  });

  it("keeps both gate posts in frame on a 390×844 phone", () => {
    const viewport = { width: 390, height: 844 };
    const leftPost = gateToViewport(viewport, px(271, 900));
    const rightPost = gateToViewport(viewport, px(2355, 900));
    expect(leftPost.x).toBeGreaterThanOrEqual(0);
    expect(rightPost.x).toBeLessThanOrEqual(viewport.width);
  });

  it("covers portrait screens without stretching", () => {
    const { box } = posterBox({ width: 390, height: 844 });
    expect(box.width / box.height).toBeCloseTo(PLATE_TALL.width / PLATE_TALL.height, 10);
    expect(box.height).toBeCloseTo(844, 10);
    expect(coverSizes(PLATE_TALL)).toBe("(max-aspect-ratio: 2552/4577) 55.76vh, 100vw");
  });
});

describe("framedBox", () => {
  it.each(viewports)("pushes in around the focus and still covers $width×$height", (viewport) => {
    const framing = { ...SQUARE_ANCHOR, zoom: 1.12 };
    const base = plateBox(viewport, PLATE, framing);
    const box = framedBox(viewport, PLATE, framing);
    expect(box.scale).toBeCloseTo(base.scale * 1.12, 10);
    expect(box.x).toBeLessThanOrEqual(0);
    expect(box.y).toBeLessThanOrEqual(0);
    expect(box.x + box.width).toBeGreaterThanOrEqual(viewport.width - 1e-9);
    expect(box.y + box.height).toBeGreaterThanOrEqual(viewport.height - 1e-9);
  });

  it("keeps the focus where the cover fit put it when there is room", () => {
    const viewport = { width: 1536, height: 864 };
    const base = plateBox(viewport, PLATE, SQUARE_ANCHOR);
    const box = framedBox(viewport, PLATE, SQUARE_ANCHOR);
    const { u, v } = SQUARE_ANCHOR.focus;
    expect(box.x + u * box.width).toBeCloseTo(base.x + u * base.width, 6);
    expect(box.y + v * box.height).toBeCloseTo(base.y + v * base.height, 6);
  });

  it("is the plain cover fit at zoom 1, as square framing is on portrait screens", () => {
    const phone = { width: 390, height: 844 };
    expect(squareBox(phone)).toEqual(plateBox(phone, PLATE, SQUARE_ANCHOR));
    expect(framedBox(phone, PLATE, { ...SQUARE_ANCHOR, zoom: 1 })).toEqual(plateBox(phone, PLATE, SQUARE_ANCHOR));
  });
});
