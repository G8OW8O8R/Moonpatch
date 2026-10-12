import { describe, expect, it } from "vitest";
import { defaultRig, endWindow } from "./gate-rig";
import { PLATE } from "./plate-box";
import {
  DUSK,
  PAN_STOPS,
  WANDER_ZOOM,
  defaultTrack,
  flicker,
  gradeAt,
  lightLevel,
  lightStart,
  panTarget,
  shiftWindow,
  squareFrame,
  trackAt,
  trackEnd,
  trackLength,
  windowAt,
} from "./square-rig";

const viewports = [
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 1024 },
  { width: 390, height: 844 },
];

describe("track", () => {
  it("starts the square only after the ride has gone", () => {
    const squareFrom = defaultTrack.gate * defaultTrack.start;
    expect(defaultTrack.start).toBeGreaterThan(defaultRig.threshold);
    expect(trackAt(squareFrom - 0.01).dusk).toBe(0);
    expect(trackAt(squareFrom + defaultTrack.dusk / 2).dusk).toBeCloseTo(0.5, 10);
  });

  it("runs dusk, then the push-in, and ends where the section does", () => {
    const end = trackEnd();
    expect(trackAt(end)).toEqual({ gate: 1, dusk: 1, wander: 1 });
    expect(trackAt(end - defaultTrack.wander)).toMatchObject({ dusk: 1, wander: 0 });
    expect(trackLength()).toBeCloseTo(end + 1, 10);
  });

  it("keeps the gate's own progress where it was", () => {
    expect(trackAt(defaultTrack.gate * 0.4).gate).toBeCloseTo(0.4, 10);
  });
});

describe("dusk", () => {
  it("fades the colour fully before the last light is on", () => {
    expect(gradeAt(0)).toBe(0);
    expect(gradeAt(DUSK.grade[1])).toBe(1);
    expect(lightStart(1) + DUSK.lightRamp).toBeLessThanOrEqual(DUSK.tagline);
  });

  it("lights in order: an earlier light is never dimmer than a later one", () => {
    for (let d = 0; d <= 1; d += 0.01) {
      expect(lightLevel(0.2, d)).toBeGreaterThanOrEqual(lightLevel(0.6, d));
    }
    expect(lightLevel(0, 0)).toBe(0);
    expect(lightLevel(1, 1)).toBe(1);
  });

  it("flickers by no more than its depth, differently per light", () => {
    let spread = 0;
    for (let t = 0; t < 20; t += 0.05) {
      const a = flicker(3, t, 0.015);
      expect(Math.abs(a - 1)).toBeLessThanOrEqual(0.015 + 1e-12);
      spread = Math.max(spread, Math.abs(a - flicker(4, t, 0.015)));
    }
    expect(spread).toBeGreaterThan(0.005);
  });
});

describe("squareFrame", () => {
  it.each(viewports)("starts on the last frame of the ride at $width×$height", (viewport) => {
    const { base, dolly } = squareFrame(viewport, { dusk: 0, wander: 0 });
    expect(dolly).toBe(0);
    expect(base).toEqual(endWindow(viewport));
  });

  it.each(viewports)("always covers the $width×$height screen, pan and push-in included", (viewport) => {
    for (let d = 0; d <= 1; d += 0.02) {
      for (const wander of [0, 1]) {
        const w = windowAt(squareFrame(viewport, { dusk: d, wander }));
        expect(w.origin.x).toBeLessThanOrEqual(1e-6);
        expect(w.origin.y).toBeLessThanOrEqual(1e-6);
        expect(w.origin.x + PLATE.width * w.scale).toBeGreaterThanOrEqual(viewport.width - 1e-6);
        expect(w.origin.y + PLATE.height * w.scale).toBeGreaterThanOrEqual(viewport.height - 1e-6);
      }
    }
  });

  it("pans portrait screens to the barn and the shop and back to the café", () => {
    const phone = { width: 390, height: 844 };
    const x = (d: number) => squareFrame(phone, { dusk: d, wander: 0 }).base.origin.x;
    expect(x(PAN_STOPS[1]!.at)).toBeGreaterThan(x(0));
    expect(x(PAN_STOPS[2]!.at)).toBeLessThan(x(0));
    expect(x(1)).toBeCloseTo(x(0), 10);
    expect(panTarget(1)).toBe(panTarget(0));
  });

  it("holds landscape screens and still portrait ones on the café", () => {
    const wide = { width: 1536, height: 864 };
    expect(squareFrame(wide, { dusk: 0.4, wander: 0 }).base).toEqual(squareFrame(wide, { dusk: 0, wander: 0 }).base);
    const phone = { width: 390, height: 844 };
    expect(squareFrame(phone, { dusk: 0.4, wander: 0 }, { pan: false }).base).toEqual(endWindow(phone));
  });

  it("pushes nearer layers in further than the plate, about the focus", () => {
    const frame = squareFrame({ width: 1536, height: 864 }, { dusk: 1, wander: 1 });
    expect(frame.dolly).toBeCloseTo(WANDER_ZOOM, 10);
    const plate = windowAt(frame, 1);
    const near = windowAt(frame, 2);
    expect(near.scale / frame.base.scale - 1).toBeCloseTo(2 * (plate.scale / frame.base.scale - 1), 10);
    // The focus stays put at any nearness.
    const fu = (frame.focus.x - near.origin.x) / near.scale;
    expect(near.origin.x + fu * near.scale).toBeCloseTo(frame.focus.x, 9);
  });
});

describe("shiftWindow", () => {
  it("scales about a point and then slides", () => {
    const w = shiftWindow({ scale: 1, origin: { x: 0, y: 0 } }, { scale: 2, about: { x: 10, y: 10 }, by: { x: 5, y: 0 } });
    expect(w).toEqual({ scale: 2, origin: { x: -5, y: -10 } });
  });
});
