"use client";

import { Icon } from "@/components/ui/Icon";
import { type CSSProperties, type Ref, useLayoutEffect, useRef, useState } from "react";
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
  /** The product whose card is open (its seed stays pointed at). */
  open: string | null;
  onOpen(open: SeedOpen): void;
  ref?: Ref<HTMLDivElement>;
}

/** Seeds this far across the screen name their product on their left, so the name stays on it. */
const LABEL_FLIP = 0.72;

/**
 * Over each product in the room, a paper disc with the mark of its card (a
 * recipe or a tag) inside a wide breathing ring, named after the product
 * beside it when pointed at or focused. Laid out as the room rests on this screen
 * (looking where it first looks); a pan moves the whole layer with the picture.
 */
export function RoomSeeds({ room, lang, t, roomTitle, open, onOpen, ref }: RoomSeedsProps) {
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
              style={{ left: at.x, top: at.y, "--i": index } as CSSProperties}
              aria-haspopup="dialog"
              aria-expanded={open === hotspot.product.id}
              data-product={hotspot.product.id}
              data-open={open === hotspot.product.id ? "" : undefined}
              data-side={size && at.x > size.width * LABEL_FLIP ? "left" : undefined}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                onOpen({ hotspot, at: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } });
              }}
            >
              <span aria-hidden="true" className="seed-mark">
                <span className="seed-ring">
                  <span className="seed-ring-line" />
                </span>
                <span className="seed-disc">
                  <Icon name={hotspot.product.card} className="seed-icon" />
                </span>
              </span>
              <span className="seed-label font-display">
                <span className="seed-label-line">{name}</span>
              </span>
            </button>
          );
        })}
    </div>
  );
}
