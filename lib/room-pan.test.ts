import { describe, expect, it } from "vitest";
import { roomBox } from "./plate-box";
import { LEAF_PAN_LIMIT, clampLook, dragLook, flickVelocity, glide, leafPanShift, pans } from "./room-pan";

const phone = { width: 390, height: 844 };
const desktop = { width: 1536, height: 864 };

describe("looking around a room", () => {
  it("only pans where the room runs past the screen's sides", () => {
    expect(pans(phone)).toBe(true);
    expect(pans(desktop)).toBe(false);
  });

  it("keeps the plate under the finger", () => {
    const before = roomBox(phone, undefined, 0.5).x;
    const look = dragLook(phone, 0.5, 40);
    expect(roomBox(phone, undefined, look).x - before).toBeCloseTo(40, 6);
  });

  it("never looks past the room's sides", () => {
    expect(dragLook(phone, 0.5, 5000)).toBe(clampLook(phone, 0));
    expect(roomBox(phone, undefined, dragLook(phone, 0.5, 5000)).x).toBeCloseTo(0, 6);
    expect(dragLook(phone, 0.5, -5000)).toBe(clampLook(phone, 1));
  });

  it("carries a flick on, slowing to a stop", () => {
    let pan = { look: 0.5, velocity: flickVelocity(phone, -800) };
    expect(pan.velocity).toBeGreaterThan(0);
    const looks: number[] = [];
    for (let i = 0; i < 240 && pan.velocity !== 0; i++) {
      pan = glide(phone, pan, 1 / 60);
      looks.push(pan.look);
    }
    expect(pan.velocity).toBe(0);
    for (let i = 1; i < looks.length; i++) expect(looks[i]!).toBeGreaterThanOrEqual(looks[i - 1]!);
    // 800 px/s with a 325 ms time constant carries the room about 260 px.
    const travelled = roomBox(phone, undefined, 0.5).x - roomBox(phone, undefined, pan.look).x;
    expect(travelled).toBeGreaterThan(220);
    expect(travelled).toBeLessThan(270);
  });

  it("stops a flick dead at the side", () => {
    const pan = glide(phone, { look: clampLook(phone, 1) - 0.001, velocity: 3 }, 1 / 60);
    expect(pan.velocity).toBe(0);
    expect(pan.look).toBe(clampLook(phone, 1));
  });
});

describe("the leaves as the room pans", () => {
  it("lie on the room where the look started", () => {
    expect(leafPanShift(phone, 0.62, 0.62, 1.15)).toBe(0);
  });

  it("slide ahead of the room the way it moves, never more than the limit", () => {
    const left = leafPanShift(phone, clampLook(phone, 0), 0.5, 1.15);
    const right = leafPanShift(phone, clampLook(phone, 1), 0.5, 1.15);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeLessThan(0);
    expect(Math.abs(left)).toBeLessThanOrEqual(LEAF_PAN_LIMIT);
    expect(Math.abs(left)).toBeGreaterThan(LEAF_PAN_LIMIT * 0.9);
    // A small look away moves them by their nearness, nothing more.
    const small = dragLook(phone, 0.5, 10);
    expect(leafPanShift(phone, small, 0.5, 1.15)).toBeCloseTo(1.5, 1);
  });
});
