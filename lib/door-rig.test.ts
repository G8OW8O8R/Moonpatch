import { describe, expect, it } from "vitest";
import {
  blurOf,
  cameraSlope,
  cameraField,
  cutProgress,
  cutTime,
  defaultDoor,
  doorShift,
  exposureMix,
  journeyWindow,
  leafWindow,
  legAt,
  moveAt,
  paceOf,
  roomWindow,
  roomZoom,
  squareZoom,
  turnAround,
  unitField,
} from "./door-rig";
import { DOORS, ROOM_REST_ZOOM, roomBox } from "./plate-box";
import { onScreen, squareFrame, windowAt } from "./square-rig";

const desktop = { width: 1536, height: 864 };
const base = windowAt(squareFrame(desktop, { dusk: 1, wander: 1 }));
const ms = (n: number) => n / 1000;

describe("the camera's speed", () => {
  it("is fastest where the cut falls: 382 ms of 900", () => {
    expect(cutTime() * defaultDoor.duration * 1000).toBeCloseTo(382, 0);
    let best = 0;
    let at = 0;
    for (let t = 0; t <= 1; t += 0.001) if (cameraSlope(t) > best) [best, at] = [cameraSlope(t), t];
    expect(at).toBeCloseTo(cutTime(), 2);
  });

  it("starts and ends at rest, and the progress it adds up to ends on 1", () => {
    expect(cameraSlope(0)).toBe(0);
    expect(cameraSlope(1)).toBe(0);
    expect(legAt(1, 0.9).j).toBe(1);
    expect(cutProgress()).toBeGreaterThan(0.4);
    expect(cutProgress()).toBeLessThan(0.6);
  });
});

describe("into a building", () => {
  it("is already moving 90 ms after the click, and pushes in to 2.6 at the cut", () => {
    const at = (t: number) => legAt(1, ms(t)).j;
    expect(squareZoom(at(0))).toBe(1);
    expect(squareZoom(at(90))).toBeGreaterThan(1.03);
    expect(squareZoom(at(381.9))).toBeCloseTo(2.6, 1);
  });

  it("lets the room settle from 1.00 to 1.04 over the rest of the move, not in a frame or two", () => {
    const at = (t: number) => legAt(1, ms(t)).j;
    expect(roomZoom(at(382))).toBeCloseTo(1, 3);
    expect(roomZoom(at(450))).toBeLessThan(1.02);
    expect(roomZoom(at(550))).toBeLessThan(1.035);
    expect(roomZoom(at(900))).toBe(ROOM_REST_ZOOM);
  });

  it("never turns the zoom back, before or after the cut", () => {
    let last = 0;
    for (let t = 0; t <= 900; t += 5) {
      const { j } = legAt(1, ms(t));
      expect(j).toBeGreaterThanOrEqual(last);
      last = j;
    }
  });

  it("blurs most at the cut, and lets the blur go over about 250 ms after it", () => {
    const blurAt = (t: number) => blurOf(paceOf(legAt(1, ms(t)), 1));
    expect(blurAt(0)).toBeCloseTo(0, 3);
    expect(blurAt(382)).toBeCloseTo(defaultDoor.blur, 0);
    // A frame either side of the cut is still smeared hard.
    expect(blurAt(366)).toBeGreaterThan(0.8 * defaultDoor.blur);
    expect(blurAt(398)).toBeGreaterThan(0.8 * defaultDoor.blur);
    expect(blurAt(500)).toBeGreaterThan(0.25 * defaultDoor.blur);
    expect(blurAt(632)).toBeLessThan(0.1 * defaultDoor.blur);
    expect(blurAt(900)).toBe(0);
  });

  it("brings the door to the middle of the screen as it magnifies", () => {
    const door = DOORS.cafe;
    const start = journeyWindow(desktop, base, "cafe", 0);
    expect(onScreen(start, door.x, door.y).x).toBeCloseTo(onScreen(base, door.x, door.y).x, 6);
    const cut = journeyWindow(desktop, base, "cafe", 0.4999);
    const p = onScreen(cut, door.x, door.y);
    expect(p.x).toBeCloseTo(768, 0);
    expect(p.y).toBeCloseTo(432, 0);
    expect(cut.scale / base.scale).toBeCloseTo(2.6, 2);
  });

  it.each(["cafe", "barn", "haunt"] as const)("keeps the %s push-in covering the screen", (room) => {
    for (let j = 0; j < 0.5; j += 0.01) {
      const w = journeyWindow(desktop, base, room, j);
      expect(w.origin.x).toBeLessThanOrEqual(1e-6);
      expect(w.origin.y).toBeLessThanOrEqual(1e-6);
      expect(w.origin.x + w.scale * 2576).toBeGreaterThanOrEqual(desktop.width - 1e-6);
      expect(w.origin.y + w.scale * 1438).toBeGreaterThanOrEqual(desktop.height - 1e-6);
    }
  });
});

describe("out of a building", () => {
  it("is the way in turned around, with the cut again at 382 ms", () => {
    const at = (t: number) => legAt(-1, ms(t)).j;
    expect(roomZoom(at(0))).toBe(ROOM_REST_ZOOM);
    expect(roomZoom(at(90))).toBeLessThan(1.039);
    expect(at(381)).toBeGreaterThan(0.5);
    expect(at(383)).toBeLessThan(0.5);
    expect(squareZoom(at(383))).toBeCloseTo(2.6, 1);
    expect(squareZoom(at(632))).toBeLessThan(1.2);
    expect(at(900)).toBe(0);
  });
});

describe("turning a move around", () => {
  const sample = (move: Parameters<typeof moveAt>[0], from: number, to: number) => {
    const out = [];
    for (let t = from; t <= to + 1e-9; t += 0.002) out.push(moveAt(move, t));
    return out;
  };

  it("keeps place and speed continuous, swings round, and lands at rest on the square", () => {
    const into = { kind: "leg" as const, leg: 1 as const, start: 0 };
    const back = turnAround(into, 0.3);
    const before = moveAt(into, 0.3);
    const after = moveAt(back, 0.3);
    expect(after.head.j).toBeCloseTo(before.head.j, 9);
    expect(after.head.v).toBeCloseTo(before.head.v, 9);
    const frames = sample(back, 0.3, 3);
    for (let i = 1; i < frames.length; i++) {
      expect(Math.abs(frames[i]!.head.j - frames[i - 1]!.head.j)).toBeLessThan(0.02);
    }
    const end = frames.findIndex((f) => f.done);
    expect(end).toBeGreaterThan(0);
    expect(frames[end]!.head).toEqual({ j: 0, v: 0 });
  });

  it("turns back through the cut: from the room onto the square", () => {
    const into = { kind: "leg" as const, leg: 1 as const, start: 0 };
    const back = turnAround(into, 0.5);
    expect(moveAt(back, 0.5).head.j).toBeGreaterThan(0.5);
    const frames = sample(back, 0.5, 3);
    expect(frames.some((f) => f.head.j < 0.5)).toBe(true);
    expect(frames.at(-1)!.head.j).toBe(0);
  });

  it("does not jump in blur where it turns", () => {
    const into = { kind: "leg" as const, leg: 1 as const, start: 0 };
    const back = turnAround(into, 0.36);
    const a = moveAt(into, 0.36);
    const b = moveAt(back, 0.36);
    expect(blurOf(paceOf(b.head, b.leg))).toBeCloseTo(blurOf(paceOf(a.head, a.leg)), 6);
  });

  it("can be turned again, and heads back into the room", () => {
    const into = { kind: "leg" as const, leg: 1 as const, start: 0 };
    const again = turnAround(turnAround(into, 0.3), 0.4);
    const frames = sample(again, 0.4, 3);
    expect(frames.at(-1)!.head.j).toBe(1);
    expect(frames.at(-1)!.done).toBe(true);
  });
});

describe("the room and its door leaves", () => {
  it("rests the room 4 % past its cover fit", () => {
    const rest = roomWindow(desktop, 1);
    expect(rest.scale).toBeCloseTo(roomBox(desktop).scale, 9);
    expect(rest.scale / roomBox(desktop, 1).scale).toBeCloseTo(1.04, 9);
  });

  it("lies a leaf exactly on the room at rest", () => {
    const rest = roomWindow(desktop, 1);
    const leaf = leafWindow(desktop, rest, rest, 260, "left");
    expect(leaf.scale).toBeCloseTo(rest.scale, 9);
    expect(leaf.origin.x).toBeCloseTo(rest.origin.x, 9);
    expect(leaf.origin.y).toBeCloseTo(rest.origin.y, 9);
  });

  it.each([
    ["left", 260],
    ["right", 2350],
  ] as const)("slides the %s leaf 1.6× as far as the room, its outer edges never in view", (side, edgeX) => {
    const rest = roomWindow(desktop, 1);
    const cut = roomWindow(desktop, 0.5);
    const leaf = leafWindow(desktop, cut, rest, edgeX, side);
    const roomMove = cut.origin.x + cut.scale * edgeX - (rest.origin.x + rest.scale * edgeX);
    const leafMove = leaf.origin.x + leaf.scale * edgeX - (rest.origin.x + rest.scale * edgeX);
    expect(leafMove / roomMove).toBeCloseTo(1.6, 6);
    expect(leaf.origin.y).toBeLessThanOrEqual(0);
    expect(leaf.origin.y + leaf.scale * 1438).toBeGreaterThanOrEqual(desktop.height);
    if (side === "left") expect(leaf.origin.x).toBeLessThanOrEqual(0);
    else expect(leaf.origin.x + leaf.scale * 2576).toBeGreaterThanOrEqual(desktop.width);
  });
});

describe("the blur's field", () => {
  it("is radial about the room's centre after the cut", () => {
    const field = unitField(desktop, cameraField(desktop, base, "cafe", 0.7));
    const centre = { x: field.k * 768 + field.b.x, y: field.k * 432 + field.b.y };
    expect(Math.hypot(centre.x, centre.y)).toBeLessThan(1e-3);
    expect(Math.hypot(field.k * 0 + field.b.x, field.k * 0 + field.b.y)).toBeCloseTo(1, 6);
  });

  it("follows the door as it glides to the middle on the square", () => {
    const field = cameraField(desktop, base, "barn", 0.3);
    // The barn sits left of the middle: the screen slides right while it magnifies.
    const shift = doorShift(desktop, base, "barn", 0.3);
    expect(shift.by.x).toBeGreaterThan(0);
    expect(field.k).toBeGreaterThan(0);
  });
});

describe("exposure at the cut", () => {
  it("is the square's own until the last 80 ms before the cut, the room's at the cut", () => {
    expect(exposureMix(legAt(1, ms(290)).j)).toBe(0);
    expect(exposureMix(legAt(1, ms(340)).j)).toBeGreaterThan(0);
    expect(exposureMix(0.4999999)).toBeCloseTo(1, 3);
    expect(exposureMix(0.6)).toBe(0);
  });
});
