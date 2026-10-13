import { describe, expect, it } from "vitest";
import { readSpot, spotToKeep, squareFrom, startAt, writeSpot } from "./square-spot";
import { defaultTrack, trackEnd } from "./square-rig";

const end = trackEnd(defaultTrack);
const onSquare = squareFrom(defaultTrack) + 1;

describe("the kept spot", () => {
  it("reads back what was written", () => {
    expect(readSpot(writeSpot(1.75))).toBe(1.75);
  });

  it("ignores anything missing, broken or tampered with", () => {
    for (const raw of [null, "", "{", "[]", "null", '{"scrolled":-1}', '{"scrolled":"2"}', '{"scrolled":2,"x":1}']) {
      expect(readSpot(raw)).toBeNull();
    }
  });

  it("is kept only on the square, never on the way in", () => {
    expect(spotToKeep(0)).toBeNull();
    expect(spotToKeep(squareFrom() - 0.01)).toBeNull();
    expect(spotToKeep(onSquare)).toBe(onSquare);
    expect(spotToKeep(end + 3)).toBe(end);
    expect(spotToKeep(Number.NaN)).toBeNull();
  });
});

describe("where the front page starts", () => {
  const fresh = { board: false, square: false, returning: false, spot: null };

  it("starts on the closed gate after a reload or a fresh visit, wherever the visitor was", () => {
    expect(startAt(fresh)).toBe(0);
    expect(startAt({ ...fresh, spot: onSquare })).toBe(0);
  });

  it("comes back to the very spot on the square", () => {
    expect(startAt({ ...fresh, returning: true, spot: onSquare })).toBe(onSquare);
    expect(startAt({ ...fresh, returning: true, square: true, spot: onSquare })).toBe(onSquare);
  });

  it("asked for the square without a spot, starts at dusk where the square comes to rest", () => {
    expect(startAt({ ...fresh, square: true })).toBe(end);
    expect(startAt({ ...fresh, square: true, returning: true })).toBe(end);
  });

  it("coming back without a spot on the square, starts on the gate", () => {
    expect(startAt({ ...fresh, returning: true })).toBe(0);
    expect(startAt({ ...fresh, returning: true, spot: 0.2 })).toBe(0);
  });

  it("opens the notice board's address over the square at dusk", () => {
    expect(startAt({ ...fresh, board: true })).toBe(end);
    expect(startAt({ ...fresh, board: true, returning: true, spot: onSquare })).toBe(end);
  });
});
