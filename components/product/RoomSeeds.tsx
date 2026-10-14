"use client";

import { type Ref, useLayoutEffect, useRef, useState } from "react";
import { type Hotspot, hotspotsIn, onScreen } from "@/lib/hotspots";
import type { Locale } from "@/lib/i18n";
import { type Messages, format } from "@/lib/messages";
import { ROOM_REST_ZOOM, type Size, roomBox } from "@/lib/plate-box";
import { ROOMS, type RoomId } from "@/lib/rooms";

export interface SeedOpen {
  hotspot: Hotspot;
  /** The seed on the screen, CSS px. */
  at: { x: number; y: number };
}

export interface RoomSeedsProps {
  room: RoomId;
  lang: Locale;
  t: Messages["product"];
  roomTitle: string;
  /** The scene draws the seeds' light; without it the page marks each one itself. */
  lit: boolean;
  /** The product whose card is open (its seed stays pointed at). */
  open: string | null;
  onOpen(open: SeedOpen): void;
  /** The seed pointed at or focused, by its place in the room, or none. */
  onSpot(index: number | null): void;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Over each product in the room, a button the size of a fingertip around the
 * seed of light the scene draws there, named after the product. It laid out
 * as the room rests on this screen (looking where it first looks); a pan
 * moves the whole layer with the picture.
 */
export function RoomSeeds({ room, lang, t, roomTitle, lit, open, onOpen, onSpot, ref }: RoomSeedsProps) {
  const layer = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);

  useLayoutEffect(() => {
    const el = layer.current?.parentElement;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const box = size && roomBox(size, ROOM_REST_ZOOM, ROOMS[room].look);
  const spots = hotspotsIn(room);

  return (
    <div
      ref={(el) => {
        layer.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      role="group"
      aria-label={format(t.seeds, { room: roomTitle })}
      className="room-seeds absolute inset-0"
      data-lit={lit ? "" : undefined}
    >
      {box &&
        spots.map((hotspot, index) => {
          const at = onScreen(box, hotspot.u, hotspot.v);
          const name = hotspot.product.name[lang];
          return (
            <button
              key={hotspot.product.id}
              type="button"
              className="seed pointer-events-auto"
              style={{ left: at.x, top: at.y }}
              aria-haspopup="dialog"
              aria-expanded={open === hotspot.product.id}
              data-product={hotspot.product.id}
              data-open={open === hotspot.product.id ? "" : undefined}
              onPointerEnter={(event) => event.pointerType === "mouse" && onSpot(index)}
              onPointerLeave={(event) => event.pointerType === "mouse" && open !== hotspot.product.id && onSpot(null)}
              onFocus={() => onSpot(index)}
              onBlur={() => open !== hotspot.product.id && onSpot(null)}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onSpot(index);
                onOpen({ hotspot, at: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } });
              }}
            >
              <span aria-hidden="true" className="seed-dot" />
              <span className="seed-label">{name}</span>
            </button>
          );
        })}
    </div>
  );
}
