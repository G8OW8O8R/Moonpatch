import { describe, expect, it } from "vitest";
import { growFrom, hotspotsIn, onScreen, pick } from "./hotspots";
import { productsIn } from "./products";
import { ROOMS, ROOM_IDS } from "./rooms";

describe("hotspots", () => {
  it.each(ROOM_IDS)("%s has a seed for every product it sells, and nothing else", (room) => {
    const sold = productsIn(room).map((p) => p.id).sort();
    expect(Object.keys(ROOMS[room].hotspots).sort()).toEqual(sold);
    expect(hotspotsIn(room).map((h) => h.product.id)).toEqual(productsIn(room).map((p) => p.id));
  });

  it("leaves out a product without a seed", () => {
    const [first] = productsIn("cafe");
    expect(hotspotsIn("cafe", { [first!.id]: [0.2, 0.3] })).toEqual([{ product: first, u: 0.2, v: 0.3 }]);
  });

  it("puts a plate point on the screen", () => {
    expect(onScreen({ x: -20, y: -10, width: 2000, height: 1000, scale: 1 }, 0.25, 0.5)).toEqual({ x: 480, y: 490 });
  });

  it("picks a point of the plate, clamped and rounded", () => {
    const rect = { left: 100, top: 50, width: 1000, height: 500 };
    expect(pick(rect, 600, 300)).toEqual([0.5, 0.5]);
    expect(pick(rect, 123.456, 50)).toEqual([0.0235, 0]);
    expect(pick(rect, 2000, -10)).toEqual([1, 0]);
  });

  it("grows a card out of its seed", () => {
    expect(growFrom({ x: 300, y: 400 }, { left: 1000, top: 100, width: 400, height: 600 })).toEqual({ x: -900, y: 0, scale: 0.12 });
  });
});
