import { describe, expect, it } from "vitest";
import { BED_LEVEL, CUES, audioUrl, bedTargets, moveCue, readSoundChoice, sceneAt, timeConstant } from "./sound";

describe("sound", () => {
  it("hears the gate until the ride crosses onto the square, and each building inside it", () => {
    expect(sceneAt("square", false)).toBe("gate");
    expect(sceneAt("square", true)).toBe("square");
    expect(sceneAt("barn", false)).toBe("barn");
  });

  it("raises one bed and lowers every other", () => {
    expect(bedTargets("cafe")).toEqual({ gate: 0, square: 0, cafe: BED_LEVEL.cafe, barn: 0, haunt: 0 });
    expect(Object.values(bedTargets(null)).every((level) => level === 0)).toBe(true);
  });

  it("lets the haunt shop be the loudest place on the farm", () => {
    const others = Object.entries(BED_LEVEL).filter(([scene]) => scene !== "haunt");
    for (const [, level] of others) expect(BED_LEVEL.haunt).toBeGreaterThan(level);
  });

  it("opens a building's own door on the way in and rushes out on the way back", () => {
    expect(moveCue("haunt")).toBe("door-haunt");
    expect(moveCue("square")).toBe("whoosh");
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
    expect(audioUrl("gate", "webm")).toBe("/audio/gate.webm");
    expect(audioUrl("ticket-tear", "mp3")).toBe("/audio/ticket-tear.mp3");
  });
});
