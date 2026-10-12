import { describe, expect, it } from "vitest";
import {
  EYE_HEIGHT,
  HINGE_X,
  PRINCIPAL,
  bezierEasing,
  cameraAt,
  defaultRig,
  endWindow,
  groundDepth,
  hingeCurve,
  leafNormal,
  leafPoint,
  leafShade,
  project,
  projectSquare,
  shadowOnGround,
  unproject,
} from "./gate-rig";
import { ease } from "./motion-tokens";
import { PLATE, SQUARE_ANCHOR, gateToViewport, plateBox } from "./plate-box";

const viewports = [
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
  { width: 3440, height: 1440 },
];

const samples = [
  { x: 120, y: 80 },
  { x: 1288, y: 900 },
  { x: 2400, y: 1400 },
];

describe("rest camera", () => {
  it.each(viewports)("puts every layer on its poster pixels at $width×$height, whatever its depth", (viewport) => {
    const camera = cameraAt(0, viewport);
    for (const pixel of samples) {
      const expected = gateToViewport(viewport, { u: pixel.x / PLATE.width, v: pixel.y / PLATE.height });
      for (const depth of [0.4, 1, 3].map((k) => k * camera.focal0)) {
        const seen = project(camera, unproject(pixel, depth, camera.focal0));
        expect(seen?.x).toBeCloseTo(expected.x, 6);
        expect(seen?.y).toBeCloseTo(expected.y, 6);
      }
      const square = projectSquare(camera, pixel);
      expect(square.x).toBeCloseTo(expected.x, 6);
      expect(square.y).toBeCloseTo(expected.y, 6);
    }
  });

  it("stands the gate on the road at the gate's own distance", () => {
    const { focal0 } = cameraAt(0, viewports[0]!);
    expect(groundDepth(1362, focal0)).toBeCloseTo(focal0, 6);
    expect(groundDepth(1430, focal0)).toBeLessThan(focal0);
    expect(() => groundDepth(PRINCIPAL.y - 1, focal0)).toThrow(RangeError);
  });
});

describe("ride into the square", () => {
  it.each(viewports)("ends exactly on square-golden in the square framing at $width×$height", (viewport) => {
    const camera = cameraAt(1, viewport);
    const box = plateBox(viewport, PLATE, SQUARE_ANCHOR);
    expect(camera.squareZoom).toBe(1);
    expect(camera.window.scale).toBeCloseTo(endWindow(viewport).scale, 10);
    for (const pixel of samples) {
      const seen = projectSquare(camera, pixel);
      expect(seen.x).toBeCloseTo(box.x + box.scale * pixel.x, 6);
      expect(seen.y).toBeCloseTo(box.y + box.scale * pixel.y, 6);
    }
  });

  it("drives past the open leaves, so they slip by on both sides", () => {
    const camera = cameraAt(1, viewports[0]!);
    for (const side of ["left", "right"] as const) {
      const latch = leafPoint(side, { x: 1288, y: 1100 }, camera.angle, camera.focal0);
      expect(project(camera, latch)).toBeNull();
    }
  });

  it("keeps the gate still while it opens and the leaves still while the camera rides", () => {
    const viewport = viewports[0]!;
    expect(cameraAt(defaultRig.openEnd, viewport).z).toBe(0);
    expect(cameraAt(0.7, viewport).angle).toBeCloseTo((defaultRig.angle * Math.PI) / 180, 10);
  });

  it("pushes into the square mid-ride and settles back", () => {
    const viewport = viewports[0]!;
    const mid = cameraAt(0.7, viewport).squareZoom;
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThanOrEqual(1 + defaultRig.push + 1e-9);
  });
});

describe("hinge spring", () => {
  it("starts closed and still, overshoots a little and lands exactly on its stop", () => {
    const curve = (u: number) => hingeCurve(u, defaultRig);
    expect(curve(0)).toBe(0);
    expect(curve(1)).toBeCloseTo(1, 12);
    expect(curve(0.01)).toBeLessThan(0.005);
    const peak = Math.max(...Array.from({ length: 200 }, (_, i) => curve(i / 199)));
    expect(peak).toBeGreaterThan(1.02);
    expect(peak).toBeLessThan(1.1);
    // Settles with no speed left: the last steps barely move.
    expect(Math.abs(curve(1) - curve(0.99))).toBeLessThan(1e-3);
  });

  it("still lands on its stop when damped past critical", () => {
    const curve = (u: number) => hingeCurve(u, { stiffness: 100, damping: 40, mass: 1 });
    expect(curve(1)).toBeCloseTo(1, 12);
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => curve(i / 49)))).toBeLessThanOrEqual(1 + 1e-12);
  });
});

describe("leaves", () => {
  const focal0 = 2500;

  it("lie in the gate plane when closed and turn on their hinges", () => {
    for (const side of ["left", "right"] as const) {
      const closed = leafPoint(side, { x: 1288, y: 1000 }, 0, focal0);
      expect(closed.z).toBe(focal0);
      expect(closed.x).toBeCloseTo(1288 - PRINCIPAL.x, 10);

      const hinge = leafPoint(side, { x: HINGE_X[side], y: 1000 }, Math.PI / 2, focal0);
      expect(hinge.x).toBeCloseTo(HINGE_X[side] - PRINCIPAL.x, 10);
      expect(hinge.z).toBeCloseTo(focal0, 10);

      const open = leafPoint(side, { x: 1288, y: 1000 }, Math.PI / 2, focal0);
      expect(open.x).toBeCloseTo(HINGE_X[side] - PRINCIPAL.x, 10);
      expect(open.z).toBeGreaterThan(focal0);
    }
    expect(leafNormal("left", 0)).toEqual({ x: 0, y: 0, z: -1 });
  });

  it("darken the leaf turning away from a sun on the left and keep the rest light at rest", () => {
    expect(leafShade("left", 0, defaultRig)).toBeCloseTo(1, 12);
    expect(leafShade("right", 0, defaultRig)).toBeCloseTo(1, 12);
    expect(leafShade("left", Math.PI / 3, defaultRig)).toBeLessThan(0.75);
    expect(leafShade("right", Math.PI / 3, defaultRig)).toBeGreaterThanOrEqual(1);
    expect(leafShade("right", Math.PI / 3, defaultRig)).toBeLessThanOrEqual(1.06);
  });

  it("cast shadows onto the road, away from the sun", () => {
    const top = leafPoint("left", { x: 900, y: 870 }, Math.PI / 4, focal0);
    const shadow = shadowOnGround(top, defaultRig);
    expect(shadow.y).toBe(EYE_HEIGHT);
    expect(shadow.x).toBeGreaterThan(top.x);
    expect(shadow.z).toBeGreaterThan(top.z);
  });
});

describe("bezierEasing", () => {
  it("matches the curve's ends and stays monotonic", () => {
    const f = bezierEasing(ease.camera);
    expect(f(0)).toBe(0);
    expect(f(1)).toBe(1);
    let last = 0;
    for (let i = 1; i <= 100; i++) {
      const v = f(i / 100);
      expect(v).toBeGreaterThanOrEqual(last - 1e-9);
      last = v;
    }
    expect(bezierEasing([0, 0, 1, 1])(0.3)).toBeCloseTo(0.3, 6);
  });
});
