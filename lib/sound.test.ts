import { describe, expect, it } from "vitest";
import { BED_LEVEL, CUES, audioUrl, bedTargets, moveCue, readSoundChoice, sceneAt, timeConstant } from "./sound";

describe("sound", () => {
  it("hears the gate until the ride crosses onto the square, and each building inside it", () => {
    expect(sceneAt("square", false)).toBe("gate");
    expect(sceneAt("square", true)).toBe("square");
    expect(sceneAt("barn", false)).toBe("barn");
  });

  it("raises one bed and lowers every other", () => {
    expect(bedTargets("cafe")).toEqual({ cafe: BED_LEVEL.cafe, barn: 0, haunt: 0 });
    expect(Object.values(bedTargets(null)).every((level) => level === 0)).toBe(true);
  });

  it("leaves the gate and the square without a bed", () => {
    for (const scene of ["gate", "square"] as const) expect(Object.values(bedTargets(scene)).every((level) => level === 0)).toBe(true);
  });

  it("lets the haunt shop be the loudest place on the farm", () => {
    const others = Object.entries(BED_LEVEL).filter(([scene]) => scene !== "haunt");
    for (const [, level] of others) expect(BED_LEVEL.haunt).toBeGreaterThan(level);
  });

  it("creaks a door open on the way into a building and keeps the way out quiet", () => {
    expect(moveCue("haunt")).toBe("gate-open");
    expect(moveCue("square")).toBeNull();
    expect(CUES).toContain(moveCue("cafe"));
  });

  it("reaches a fade's level within its time", () => {
    const tau = timeConstant(1.2);
    expect(Math.exp(-1.2 / tau)).toBeLessThan(0.051);
  });

  it("stays silent unless the saved choice says otherwise", () => {
    expect(readSoundChoice({ on: true })).toBe(true);
    expect(readSoundChoice({ on: false })).toBe(false);
    expect(readSoundChoice(undefined)).toBe(false);
    expect(readSoundChoice({ on: "yes" })).toBe(false);
  });

  it("points at the files in public/audio", () => {
    expect(audioUrl("cafe", "webm")).toBe("/audio/cafe.webm");
    expect(audioUrl("gate-open", "mp3")).toBe("/audio/gate-open.mp3");
  });
});
