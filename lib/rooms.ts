/**
 * The three buildings as the scene draws them: where the camera first looks
 * on a narrow screen, and the door leaves lifted off each plate so they can
 * move a little faster than the room behind them.
 */
import { z } from "zod";
import cafe from "@/content/rooms/cafe.json";
import barn from "@/content/rooms/barn.json";
import haunt from "@/content/rooms/haunt.json";
import { PLATE } from "./plate-box";

export const ROOM_IDS = ["cafe", "barn", "haunt"] as const;
export type RoomId = (typeof ROOM_IDS)[number];

const share = z.number().min(0).max(1);
const point = z.tuple([share, share]);

const layerSchema = z.strictObject({
  id: z.string().regex(/^[a-z-]+$/),
  side: z.enum(["left", "right"]),
  /** Two points of the leaf's straight inner edge, shares of the plate (top, then bottom). */
  edge: z.tuple([point, point]),
  /** How much faster than the room the leaf moves (1 = with the room). */
  nearness: z.number().min(1).max(2),
});

export const roomSchema = z.strictObject({
  /** Where a panning camera first looks, as a share of the plate's width. */
  look: share,
  layers: z.array(layerSchema).max(2),
});

export type RoomLayer = z.infer<typeof layerSchema>;
export type RoomContent = z.infer<typeof roomSchema>;

export const ROOMS: Readonly<Record<RoomId, RoomContent>> = {
  cafe: roomSchema.parse(cafe),
  barn: roomSchema.parse(barn),
  haunt: roomSchema.parse(haunt),
};

export const isRoomId = (value: unknown): value is RoomId => typeof value === "string" && (ROOM_IDS as readonly string[]).includes(value);

/** Pixels this close to the edge belong to the ramp across it (half the ramp and a pixel and a half). */
const CLEAR = 2.5;

/** Edge x on the plate (px) at a row (px), measured at the row's centre. */
export function edgeAt(layer: RoomLayer, y: number): number {
  const [[u0, v0], [u1, v1]] = layer.edge;
  const t = ((y + 0.5) / PLATE.height - v0) / (v1 - v0);
  return (u0 + (u1 - u0) * t) * PLATE.width;
}

/** Mean x of the edge on the plate (px). */
export function edgeMid(layer: RoomLayer): number {
  return ((layer.edge[0][0] + layer.edge[1][0]) / 2) * PLATE.width;
}

/** Columns of the plate a leaf's file covers (px): from the plate's side to just past its edge. */
export function leafSpan(layer: RoomLayer): { left: number; width: number } {
  const top = edgeAt(layer, 0);
  const bottom = edgeAt(layer, PLATE.height - 1);
  if (layer.side === "left") return { left: 0, width: Math.min(PLATE.width, Math.ceil(Math.max(top, bottom) + CLEAR)) };
  const left = Math.max(0, Math.floor(Math.min(top, bottom) - CLEAR));
  return { left, width: PLATE.width - left };
}
