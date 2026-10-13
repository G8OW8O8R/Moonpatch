import { describe, expect, it } from "vitest";
import { ROOMS, ROOM_IDS, edgeAt, isRoomId, leafSpan, roomSchema } from "./rooms";

describe("room files", () => {
  it.each(ROOM_IDS)("%s parses, with leaves on their own sides", (id) => {
    const room = ROOMS[id];
    for (const layer of room.layers) {
      const x = edgeAt(layer, 700);
      if (layer.side === "left") expect(x).toBeLessThan(2576 / 2);
      else expect(x).toBeGreaterThan(2576 / 2);
    }
    expect(new Set(room.layers.map((l) => l.side)).size).toBe(room.layers.length);
  });

  it("rejects a leaf without an edge", () => {
    expect(() => roomSchema.parse({ look: 0.5, layers: [{ id: "door-left", side: "left", nearness: 1.15 }] })).toThrow();
  });

  it("knows its rooms", () => {
    expect(isRoomId("cafe")).toBe(true);
    expect(isRoomId("visit")).toBe(false);
  });
});

describe("leafSpan", () => {
  it("crops a left leaf from the plate's side to just past its edge", () => {
    const layer = ROOMS.cafe.layers.find((l) => l.side === "left")!;
    const span = leafSpan(layer);
    expect(span.left).toBe(0);
    expect(span.width).toBe(Math.ceil(Math.max(edgeAt(layer, 0), edgeAt(layer, 1437)) + 2.5));
  });

  it("starts a right leaf two and a half pixels before its nearest point", () => {
    const layer = ROOMS.cafe.layers.find((l) => l.side === "right")!;
    const span = leafSpan(layer);
    expect(span.left).toBe(Math.floor(Math.min(edgeAt(layer, 0), edgeAt(layer, 1437)) - 2.5));
    expect(span.left + span.width).toBe(2576);
  });
});
