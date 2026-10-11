import { describe, expect, it } from "vitest";
import { duration, ease, motionCssVars } from "./motion-tokens";

describe("motion tokens", () => {
  it("keeps interface timing between 150 and 400 ms", () => {
    for (const value of [duration.tap, duration.ui, duration.panel]) {
      expect(value).toBeGreaterThanOrEqual(0.15);
      expect(value).toBeLessThanOrEqual(0.4);
    }
  });

  it("keeps scene changes between 600 and 1200 ms", () => {
    for (const value of [duration.sceneShort, duration.scene, duration.sceneLong]) {
      expect(value).toBeGreaterThanOrEqual(0.6);
      expect(value).toBeLessThanOrEqual(1.2);
    }
  });

  it("caps the reduced-motion crossfade at 150 ms", () => {
    expect(duration.reduced).toBeLessThanOrEqual(0.15);
  });

  it("uses valid cubic-bezier curves", () => {
    for (const [x1, , x2] of Object.values(ease)) {
      expect(x1).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(1);
      expect(x2).toBeGreaterThanOrEqual(0);
      expect(x2).toBeLessThanOrEqual(1);
    }
  });

  it("exposes the same values as CSS custom properties", () => {
    const vars = motionCssVars();
    expect(vars["--duration-scene"]).toBe("900ms");
    expect(vars["--duration-scene-short"]).toBe("600ms");
    expect(vars["--ease-out"]).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
  });
});
