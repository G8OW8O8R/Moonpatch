import { describe, expect, it } from "vitest";
import {
  EYE_HEIGHT,
  HINGE_X,
  PRINCIPAL,
  bezierEasing,
  cameraAt,
  defaultRig,
  endWindow,
  followOpening,
  groundDepth,
  hingeCurve,
  leafNormal,
  leafPoint,
  leafShade,
  peakRideSpeed,
  project,
  projectSquare,
  rideSpeed,
  settledState,
  shadowOnGround,
  unproject,
} from "./gate-rig";
import { ease } from "./motion-tokens";
import { PLATE, SQUARE_ANCHOR, gateToViewport, plateBox, squareBox } from "./plate-box";

const viewports = [
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
  { width: 3440, height: 1440 },
];

const atRest = { opening: 0, ride: 0 };
const open = { opening: 1, ride: 0 };
const landed = { opening: 1, ride: 1 };

const samples = [
  { x: 120, y: 80 },
  { x: 1288, y: 900 },
  { x: 2400, y: 1400 },
];

describe("rest camera", () => {
  it.each(viewports)("puts every layer on its poster pixels at $width×$height, whatever its depth", (viewport) => {
    const camera = cameraAt(atRest, viewport);
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
    const { focal0 } = cameraAt(atRest, viewports[0]!);
    expect(groundDepth(1362, focal0)).toBeCloseTo(focal0, 6);
    expect(groundDepth(1430, focal0)).toBeLessThan(focal0);
    expect(() => groundDepth(PRINCIPAL.y - 1, focal0)).toThrow(RangeError);
  });
});

describe("ride into the square", () => {
  it.each(viewports)("ends exactly on square-golden in the square framing at $width×$height", (viewport) => {
    const camera = cameraAt(landed, viewport);
    const box = squareBox(viewport);
    expect(camera.window.scale).toBeCloseTo(endWindow(viewport).scale, 10);
    for (const pixel of samples) {
      const seen = projectSquare(camera, pixel);
      expect(seen.x).toBeCloseTo(box.x + box.scale * pixel.x, 6);
      expect(seen.y).toBeCloseTo(box.y + box.scale * pixel.y, 6);
    }
  });

  it("pushes in on the square on landscape screens and keeps the cover fit on phones", () => {
    const desktop = { width: 1536, height: 864 };
    const zoom = endWindow(desktop).scale / plateBox(desktop, PLATE, SQUARE_ANCHOR).scale;
    expect(zoom).toBeCloseTo(SQUARE_ANCHOR.zoom, 10);
    const phone = { width: 390, height: 844 };
    expect(endWindow(phone).scale).toBeCloseTo(plateBox(phone, PLATE, SQUARE_ANCHOR).scale, 10);
  });

  it("grows the square steadily through the ride, from the moment the arch starts to grow", () => {
    const viewport = viewports[0]!;
    let last = cameraAt(open, viewport).window.scale;
    for (let i = 1; i <= 20; i++) {
      const scale = cameraAt({ opening: 1, ride: i / 20 }, viewport).window.scale;
      expect(scale).toBeGreaterThanOrEqual(last);
      last = scale;
    }
    expect(cameraAt({ opening: 1, ride: 0.3 }, viewport).window.scale).toBeGreaterThan(cameraAt(open, viewport).window.scale);
  });

  it("drives past the open leaves, so they slip by on both sides", () => {
    const camera = cameraAt(landed, viewports[0]!);
    for (const side of ["left", "right"] as const) {
      const latch = leafPoint(side, { x: 1288, y: 1100 }, camera.angle, camera.focal0);
      expect(project(camera, latch)).toBeNull();
    }
  });

  it("keeps the gate still while it opens", () => {
    expect(cameraAt(open, viewports[0]!).z).toBe(0);
    expect(cameraAt(open, viewports[0]!).angle).toBeCloseTo((defaultRig.angle * Math.PI) / 180, 10);
  });

  it("starts and ends the ride at rest, fastest in between, and no faster than its peak", () => {
    const peak = peakRideSpeed(defaultRig);
    expect(rideSpeed(0, defaultRig)).toBeLessThan(peak * 0.05);
    expect(rideSpeed(1, defaultRig)).toBeLessThan(peak * 0.05);
    for (let i = 0; i <= 50; i++) expect(rideSpeed(i / 50, defaultRig)).toBeLessThanOrEqual(peak + 1e-9);
  });
});

describe("scroll control", () => {
  it("settles a page opened mid-way without animating", () => {
    expect(settledState(0.2, defaultRig)).toEqual({ opening: 0.5, ride: 0 });
    expect(settledState(defaultRig.threshold, defaultRig)).toEqual({ opening: 1, ride: 1 });
  });

  it("follows a flick of the scroll at a limited pace and never overshoots, either way", () => {
    const dt = 1 / 60;
    let follower = { value: 0, velocity: 0 };
    let frames = 0;
    let peak = 0;
    while (follower.value < 1 && frames < 600) {
      const before = follower.value;
      follower = followOpening(follower, 1, dt, defaultRig);
      peak = Math.max(peak, (follower.value - before) / dt);
      frames++;
    }
    expect(follower.value).toBe(1);
    // At most the speed limit (sections per second over the opening's share of the section).
    expect(peak).toBeLessThanOrEqual(defaultRig.followSpeed / defaultRig.openEnd + 1e-9);
    // A flick from closed to open takes at least as long as the limit allows.
    expect(frames * dt).toBeGreaterThanOrEqual(defaultRig.openEnd / defaultRig.followSpeed - dt);

    let back = { value: 1, velocity: 0 };
    for (let i = 0; i < 600 && back.value > 0; i++) {
      back = followOpening(back, 0, dt, defaultRig);
      expect(back.value).toBeGreaterThanOrEqual(0);
      expect(back.value).toBeLessThanOrEqual(1);
    }
    expect(back.value).toBe(0);
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
