import { describe, expect, it } from "vitest";
import {
  blurOf,
  cameraSlope,
  cameraField,
  crossAt,
  crossExposure,
  crossField,
  crossPoint,
  crossSquareWindow,
  crossZoom,
  cutProgress,
  cutTime,
  defaultDoor,
  doorShift,
  exposureMix,
  journeyWindow,
  leafBalanceAt,
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
import { propPlacement, propWindow, quadOnScreen, signQuads } from "./square-props";
import { onScreen, shiftWindow, squareFrame, windowAt } from "./square-rig";

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

describe("into the haunt shop", () => {
  it("has the signpost's lettering out of the frame for the last 40 ms before the cut", () => {
    const frame = squareFrame(desktop, { dusk: 1, wander: 1 });
    const arms = signQuads(propPlacement(desktop).sign).filter((q) => q.id.startsWith("arm-"));
    for (let t = 342; t < 382; t += 5) {
      const camera = doorShift(desktop, base, "haunt", legAt(1, ms(t)).j);
      for (const arm of arms) expect(quadOnScreen(shiftWindow(propWindow(frame, arm.nearness, arm.foot), camera), arm.rect).y).toBeGreaterThan(desktop.height);
    }
  });
});

describe("the leaves' balance", () => {
  it("is whole at the cut and gone once the room has settled", () => {
    expect(leafBalanceAt(0.3)).toBe(0);
    expect(leafBalanceAt(0.5)).toBe(1);
    expect(leafBalanceAt(legAt(1, ms(500)).j)).toBeLessThan(0.5);
    expect(leafBalanceAt(1)).toBe(0);
  });
});

describe("from one building to another", () => {
  const sec = (t: number) => crossAt(ms(t));

  it("cuts out of the first room at 300 ms and into the second at 900 ms of 1200", () => {
    expect(sec(299).shot.at).toBe("from");
    expect(sec(301).shot.at).toBe("square");
    expect(sec(899).shot.at).toBe("square");
    expect(sec(901).shot.at).toBe("to");
    expect(sec(1200).done).toBe(true);
  });

  it("is fastest at both cuts, slower over the square, at rest at both ends", () => {
    expect(sec(0).pace).toBe(0);
    expect(sec(300).pace).toBeCloseTo(1, 2);
    expect(sec(600).pace).toBeCloseTo(defaultDoor.midPace, 6);
    expect(sec(900).pace).toBeCloseTo(1, 2);
    expect(sec(1200).pace).toBe(0);
  });

  it("leaves the first room the way out does, and lands in the second the way in does", () => {
    const first = sec(0).shot;
    const last = sec(1200).shot;
    expect(first).toEqual({ at: "from", j: 1 });
    expect(last).toEqual({ at: "to", j: 1 });
    const out = sec(299.9).shot;
    const into = sec(900.1).shot;
    expect(out.at === "from" && roomZoom(out.j)).toBeCloseTo(1, 2);
    expect(into.at === "to" && roomZoom(into.j)).toBeCloseTo(1, 2);
  });

  it("pulls back to zMid halfway, from the cut's magnification at both doors", () => {
    expect(crossZoom(0)).toBeCloseTo(defaultDoor.zCut, 6);
    expect(crossZoom(0.5)).toBeCloseTo(defaultDoor.zMid, 6);
    expect(crossZoom(1)).toBeCloseTo(defaultDoor.zCut, 6);
  });

  it("matches the push-in on each door at the cuts, so neither cut moves the square", () => {
    const start = crossSquareWindow(desktop, base, "barn", "haunt", 0);
    const intoBarn = shiftWindow(base, doorShift(desktop, base, "barn", 0.5));
    expect(start.scale).toBeCloseTo(intoBarn.scale, 6);
    expect(start.origin.x).toBeCloseTo(intoBarn.origin.x, 4);
    const end = crossSquareWindow(desktop, base, "barn", "haunt", 1);
    const intoShop = shiftWindow(base, doorShift(desktop, base, "haunt", 0.5));
    expect(end.origin.x).toBeCloseTo(intoShop.origin.x, 4);
    expect(end.origin.y).toBeCloseTo(intoShop.origin.y, 4);
  });

  it("goes the way the doors lie: barn to haunt shop passes the café halfway", () => {
    expect(crossPoint("barn", "haunt", 0.5).x).toBeCloseTo((DOORS.barn.x + DOORS.haunt.x) / 2, 6);
    const field = crossField(desktop, base, "barn", "haunt", 0.5);
    // The square slides left on screen as the camera travels right.
    expect(field.b.x + field.k * desktop.width / 2).toBeLessThan(0);
  });

  it("matches the square's light to the room it is cutting from or to", () => {
    expect(crossExposure(0)).toEqual({ mix: 1, room: "from" });
    expect(crossExposure(0.5).mix).toBe(0);
    expect(crossExposure(1)).toEqual({ mix: 1, room: "to" });
  });
});
