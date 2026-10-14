"use client";

import { type KeyboardEvent, type MouseEvent, useState } from "react";
import { pick } from "@/lib/hotspots";
import type { Locale } from "@/lib/i18n";
import { PLATE } from "@/lib/plate-box";
import { productsIn } from "@/lib/products";
import { ROOMS, ROOM_IDS, type RoomId } from "@/lib/rooms";

type Spots = Record<RoomId, Record<string, [number, number]>>;

const start = (): Spots => ({
  cafe: { ...ROOMS.cafe.hotspots } as Record<string, [number, number]>,
  barn: { ...ROOMS.barn.hotspots } as Record<string, [number, number]>,
  haunt: { ...ROOMS.haunt.hotspots } as Record<string, [number, number]>,
});

/** A nudge with the arrow keys, in plate px (Shift: ten). */
const NUDGE = 1;

/**
 * Pick a product, click where it lies on the plate; the arrows nudge it a
 * pixel at a time. "Save" writes the room's seeds into its content file.
 */
export function HotspotEditor({ lang }: { lang: Locale }) {
  const [room, setRoom] = useState<RoomId>("cafe");
  const [spots, setSpots] = useState<Spots>(start);
  const products = productsIn(room);
  const [selected, setSelected] = useState<string>(products[0]!.id);
  const [status, setStatus] = useState("");
  const [dirty, setDirty] = useState<Set<RoomId>>(new Set());

  const place = (id: string, at: [number, number]) => {
    setSpots((all) => ({ ...all, [room]: { ...all[room], [id]: at } }));
    setDirty((d) => new Set(d).add(room));
    setStatus("");
  };

  const onPlate = (event: MouseEvent<HTMLDivElement>) => {
    place(selected, pick(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY));
    // On to the next product, so a room is placed in one round of clicks.
    const next = products[products.findIndex((p) => p.id === selected) + 1];
    if (next) setSelected(next.id);
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    const at = spots[room][selected];
    if (!step || !at) return;
    event.preventDefault();
    const px = NUDGE * (event.shiftKey ? 10 : 1);
    const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
    place(selected, [round(at[0] + (step[0]! * px) / PLATE.width), round(at[1] + (step[1]! * px) / PLATE.height)]);
  };

  const save = async () => {
    setStatus("Saving…");
    const response = await fetch(`/${lang}/lab/hotspots/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room, hotspots: spots[room] }),
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setStatus(result.error ?? `Failed (${response.status})`);
      return;
    }
    setDirty((d) => {
      const next = new Set(d);
      next.delete(room);
      return next;
    });
    setStatus(`Saved content/rooms/${room}.json`);
  };

  const json = JSON.stringify(spots[room], null, 2);

  return (
    <main className="grid min-h-svh grid-cols-[1fr_320px] bg-bark text-paper max-lg:grid-cols-1">
      <div className="relative flex items-center justify-center p-4">
        <div
          role="application"
          aria-label={`${room} plate: click to place the selected product, arrow keys to nudge it`}
          tabIndex={0}
          onClick={onPlate}
          onKeyDown={onKey}
          className="relative w-full cursor-crosshair select-none"
          style={{ aspectRatio: `${PLATE.width} / ${PLATE.height}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a dev tool showing the plate as it is */}
          <img src={`/img/plates/${room}-2576.webp`} alt="" className="absolute inset-0 size-full" draggable={false} />
          {products.map((product) => {
            const at = spots[room][product.id];
            if (!at) return null;
            const on = product.id === selected;
            return (
              <span
                key={product.id}
                className="pointer-events-none absolute"
                style={{ left: `${at[0] * 100}%`, top: `${at[1] * 100}%` }}
              >
                <span className={`absolute -left-1.5 -top-1.5 size-3 rounded-pill border-2 ${on ? "border-paper bg-pumpkin" : "border-ink bg-cream"}`} />
                <span className={`absolute left-3 -top-3 whitespace-nowrap rounded-sm px-1.5 text-[13px] ${on ? "bg-pumpkin text-paper" : "bg-ink/80 text-paper"}`}>
                  {product.id.slice(0, 2)}
                </span>
              </span>
            );
          })}
        </div>
      </div>
      <aside className="flex flex-col gap-4 overflow-y-auto border-l border-paper/15 p-4 text-[15px]">
        <div className="flex gap-2">
          {ROOM_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setRoom(id);
                setSelected(productsIn(id)[0]!.id);
                setStatus("");
              }}
              className={`rounded-sm px-3 py-1 ${id === room ? "bg-paper text-ink" : "bg-paper/10"}`}
            >
              {id}
              {dirty.has(id) ? " •" : ""}
            </button>
          ))}
        </div>
        <ol className="flex flex-col gap-1">
          {products.map((product) => {
            const at = spots[room][product.id];
            return (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => setSelected(product.id)}
                  className={`flex w-full justify-between gap-2 rounded-sm px-2 py-1 text-left ${product.id === selected ? "bg-pumpkin text-paper" : "hover:bg-paper/10"}`}
                >
                  <span>{product.name[lang]}</span>
                  <span className="tabular-nums opacity-70">{at ? `${at[0].toFixed(3)}, ${at[1].toFixed(3)}` : "–"}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="opacity-70">Click the plate to place the highlighted product (then the next one is picked). Arrow keys on the plate nudge it by 1 px, Shift by 10.</p>
        <button type="button" onClick={save} className="rounded-pill bg-paper px-4 py-2 font-medium text-ink">
          Save {room}
        </button>
        <p role="status" className="min-h-6">
          {status}
        </p>
        <pre className="overflow-x-auto rounded-sm bg-ink/60 p-2 text-[13px]">{json}</pre>
      </aside>
    </main>
  );
}
