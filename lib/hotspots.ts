/**
 * The seeds in each room: where a product lies on the plate, where that is on
 * the screen, and how a card grows out of it.
 */
import type { PlateBox } from "./plate-box";
import { type Product, productsIn } from "./products";
import { ROOMS, type RoomId } from "./rooms";

export interface Hotspot {
  product: Product;
  /** Shares of the plate's width and height. */
  u: number;
  v: number;
}

/** A room's seeds in the order of the catalogue (the order the keyboard walks them in). */
export function hotspotsIn(room: RoomId, spots: Readonly<Record<string, readonly [number, number]>> = ROOMS[room].hotspots): Hotspot[] {
  return productsIn(room).flatMap((product) => {
    const at = spots[product.id];
    return at ? [{ product, u: at[0], v: at[1] }] : [];
  });
}

/** A point of the plate on the screen, CSS px. */
export function onScreen(box: PlateBox, u: number, v: number): { x: number; y: number } {
  return { x: box.x + u * box.width, y: box.y + v * box.height };
}

/** Where a click on a picture of the plate lands on it, rounded to a hundredth of a per cent. */
export function pick(rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number): [number, number] {
  const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
  return [round((clientX - rect.left) / rect.width), round((clientY - rect.top) / rect.height)];
}

/**
 * Where a card starts as it opens out of its seed: shrunk about its own
 * centre and moved so that centre sits on the seed.
 */
export function growFrom(seed: { x: number; y: number }, card: { left: number; top: number; width: number; height: number }, scale = 0.12): { x: number; y: number; scale: number } {
  return { x: seed.x - (card.left + card.width / 2), y: seed.y - (card.top + card.height / 2), scale };
}
