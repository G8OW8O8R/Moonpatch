import { describe, expect, it } from "vitest";
import { ARC_CLEAR, ARC_DESCENT, ARC_SPAN, HOLE, NOTCH, arcSag, framePath, holeCentres, passDate, passLayout, passNumber, passOrder } from "./farm-pass";

const inside = (points: readonly (readonly [number, number])[], width: number, height: number) =>
  points.every(([x, y]) => x >= -1e-6 && y >= -1e-6 && x <= width + 1e-6 && y <= height + 1e-6);

describe("passLayout", () => {
  it("keeps both pieces on the ticket, the stub past the cut", () => {
    for (const orientation of ["wide", "tall"] as const) {
      const pass = passLayout(orientation, 2, "x");
      expect(inside(pass.main, pass.width, pass.height)).toBe(true);
      expect(inside(pass.stub, pass.width, pass.height)).toBe(true);
      const along = orientation === "wide" ? 0 : 1;
      expect(Math.max(...pass.main.map((p) => p[along]))).toBeLessThanOrEqual(pass.cut + 1e-6);
      expect(Math.min(...pass.stub.map((p) => p[along]))).toBeGreaterThanOrEqual(pass.cut - 1e-6);
    }
  });

  it("bites each hole half out of either piece, so together they leave it round", () => {
    const pass = passLayout("wide", 1, "x");
    const deepest = (points: typeof pass.main) =>
      Math.max(...points.filter(([x, y]) => y > NOTCH && y < pass.height - NOTCH && Math.abs(x - pass.cut) < NOTCH).map(([x]) => Math.abs(x - pass.cut)));
    expect(Math.min(...pass.main.map(([x]) => x)).toFixed(0)).toBe("0");
    expect(deepest(pass.main)).toBeCloseTo(HOLE, 1);
    expect(deepest(pass.stub)).toBeCloseTo(HOLE, 1);
  });

  it("grows with the list and tears the same way for the same seed", () => {
    expect(passLayout("wide", 6, "x").height).toBeGreaterThan(passLayout("wide", 1, "x").height);
    expect(passLayout("tall", 6, "x").cut).toBeGreaterThan(passLayout("tall", 1, "x").cut);
    expect(passLayout("wide", 2, "a").main).toEqual(passLayout("wide", 2, "a").main);
    expect(passLayout("wide", 2, "a").main).not.toEqual(passLayout("wide", 2, "b").main);
  });

  it("sets the heading round the top clear of the wordmark and inside the frame", () => {
    for (const orientation of ["wide", "tall"] as const) {
      const pass = passLayout(orientation, 1, "x");
      const { cy, r } = pass.arc;
      const middle = cy - r;
      const ends = middle + arcSag(r, ARC_SPAN[orientation]) + ARC_DESCENT;
      expect(ends + ARC_CLEAR).toBeLessThanOrEqual(pass.wordmark.y);
      // Capitals stand about three quarters of the type size above their line.
      expect(middle - 26 * 0.75).toBeGreaterThan(pass.mainFrame.y + 7);
    }
  });

  it("puts the number in the stub's top corner", () => {
    for (const orientation of ["wide", "tall"] as const) {
      const pass = passLayout(orientation, 2, "x");
      const f = pass.stubFrame;
      expect(pass.serial.right).toBeLessThan(f.x + f.width);
      expect(pass.serial.top).toBeGreaterThan(f.y);
      expect(pass.serial.top).toBeLessThan(f.y + 40);
    }
  });

  it("keeps the last item above the frame", () => {
    for (const orientation of ["wide", "tall"] as const) {
      const pass = passLayout(orientation, 4, "x");
      const last = pass.list.top + 4 * pass.list.step;
      expect(last).toBeLessThan(pass.mainFrame.y + pass.mainFrame.height);
    }
  });
});

describe("holeCentres", () => {
  it("spaces the holes evenly between the end notches", () => {
    const holes = holeCentres(420);
    expect(holes.length).toBeGreaterThan(10);
    expect(holes[0]! - HOLE).toBeGreaterThan(NOTCH);
    expect(420 - holes.at(-1)! - HOLE).toBeGreaterThan(NOTCH);
    expect(holes[0]! - NOTCH).toBeCloseTo(420 - NOTCH - holes.at(-1)!, 6);
  });
});

describe("framePath", () => {
  it("closes a frame with its corners bitten in", () => {
    const d = framePath({ x: 10, y: 10, width: 100, height: 50 }, 8);
    expect(d.startsWith("M18 10")).toBe(true);
    expect(d.match(/A8 8/g)).toHaveLength(4);
    expect(d.endsWith("Z")).toBe(true);
  });
});

describe("passOrder", () => {
  it("lists what waits at the farm and notes what was shipped", () => {
    const order = passOrder(
      [
        { id: "01-pumpkin-spice-latte", qty: 1 },
        { id: "02-cider-donuts", qty: 3 },
        { id: "nope", qty: 2 },
      ],
      "2026-10-17",
    );
    expect(order).toEqual({
      day: "2026-10-17",
      visit: [
        { id: "01-pumpkin-spice-latte", qty: 1 },
        { id: "02-cider-donuts", qty: 3 },
      ],
      shipped: false,
    });
  });

  it("gives no pass without a visit or a day", () => {
    expect(passOrder([{ id: "01-pumpkin-spice-latte", qty: 1 }], null)).toBeNull();
    expect(passOrder([], "2026-10-17")).toBeNull();
  });
});

describe("passNumber", () => {
  it("is six digits, the same for the same day and things in any order", () => {
    const a = { day: "2026-10-17", visit: [{ id: "01-pumpkin-spice-latte", qty: 1 }, { id: "02-cider-donuts", qty: 3 }] };
    const b = { day: "2026-10-17", visit: [{ id: "02-cider-donuts", qty: 3 }, { id: "01-pumpkin-spice-latte", qty: 1 }] };
    expect(passNumber(a)).toMatch(/^\d{6}$/);
    expect(passNumber(a)).toBe(passNumber(b));
    expect(passNumber(a)).not.toBe(passNumber({ ...a, day: "2026-10-18" }));
    expect(passNumber(a)).not.toBe(passNumber({ ...a, visit: [{ id: "01-pumpkin-spice-latte", qty: 2 }] }));
  });
});

describe("passDate", () => {
  it("prints the day in full in either language", () => {
    expect(passDate("2026-10-17", "en", "10 am – 8 pm")).toEqual(["Saturday, October 17", "10 am – 8 pm"]);
    expect(passDate("2026-10-17", "pl", "10:00–20:00")).toEqual(["sobota, 17 października", "10:00–20:00"]);
  });
});
