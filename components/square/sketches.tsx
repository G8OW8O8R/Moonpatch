/**
 * Pen drawings on the notice board's cards. Each drawing's coordinates are
 * pixels of noticeboard.png (its viewBox is its card), so it scales with the
 * board and keeps clear of the note, the pins and the pegs where they are.
 * Lines carry pathLength=1, which lets CSS draw them in when the board opens,
 * one after another by their --delay.
 */
import type { CSSProperties, ReactNode } from "react";
import { BOARD_PARTS } from "@/lib/board-parts";

const viewBox = (card: keyof typeof BOARD_PARTS.cards) => {
  const c = BOARD_PARTS.cards[card];
  return `${c.x} ${c.y} ${c.w} ${c.h}`;
};

/** A group of lines drawn in together, after `delay` seconds. */
function Stroke({ delay, children }: { delay: number; children: ReactNode }) {
  return <g style={{ "--delay": `${delay}s` } as CSSProperties}>{children}</g>;
}

function Line({ d }: { d: string }) {
  return <path pathLength={1} className="sketch-line" d={d} />;
}

/** The farm gate: two capped posts, the arched beam with the moon over it, both leaves swung open. */
function Gate({ x, y }: { x: number; y: number }) {
  return (
    <>
      <Line d={`M${x} ${y + 54} V${y + 4} M${x + 50} ${y + 54} V${y + 4} M${x - 3} ${y + 4} h6 M${x + 47} ${y + 4} h6`} />
      <Line d={`M${x - 4} ${y + 12} Q${x + 25} ${y - 8} ${x + 54} ${y + 12}`} />
      <Line d={`M${x + 1} ${y + 22} L${x + 15} ${y + 28} V${y + 52} L${x + 1} ${y + 48} M${x + 1} ${y + 36} L${x + 15} ${y + 40}`} />
      <Line d={`M${x + 49} ${y + 22} L${x + 35} ${y + 28} V${y + 52} L${x + 49} ${y + 48} M${x + 49} ${y + 36} L${x + 35} ${y + 40}`} />
      <Line d={`M${x + 28} ${y - 30} a11 11 0 1 0 9 17 a8.5 8.5 0 1 1 -9 -17 z`} />
    </>
  );
}

/** Red barn: gambrel roof, big doors with a cross. */
function Barn({ x, y }: { x: number; y: number }) {
  return (
    <Line
      d={`M${x} ${y + 40} V${y + 16} L${x + 6} ${y + 5} L${x + 18} ${y - 2} L${x + 30} ${y + 5} L${x + 36} ${y + 16} V${y + 40} Z M${x + 10} ${y + 40} V${y + 22} H${x + 26} V${y + 40} M${x + 10} ${y + 22} L${x + 26} ${y + 40} M${x + 26} ${y + 22} L${x + 10} ${y + 40}`}
    />
  );
}

/** Cream café: a gable, a porch on two posts, a door. */
function Cafe({ x, y }: { x: number; y: number }) {
  return (
    <Line
      d={`M${x} ${y + 40} V${y + 16} L${x + 19} ${y + 2} L${x + 38} ${y + 16} V${y + 40} Z M${x - 3} ${y + 24} H${x + 41} M${x + 4} ${y + 24} V${y + 40} M${x + 34} ${y + 24} V${y + 40} M${x + 16} ${y + 40} V${y + 30} H${x + 22} V${y + 40} M${x + 16} ${y + 11} h6 v5 h-6 z`}
    />
  );
}

/** The haunt shop: tall and steep, a lit window up in the gable. */
function Shop({ x, y }: { x: number; y: number }) {
  return (
    <Line
      d={`M${x} ${y + 40} V${y + 14} L${x + 14} ${y - 8} L${x + 28} ${y + 14} V${y + 40} Z M${x + 11} ${y + 3} h6 v8 h-6 z M${x + 5} ${y + 22} h7 v9 h-7 z M${x + 17} ${y + 22} h6 v18`}
    />
  );
}

function Tree({ x, y }: { x: number; y: number }) {
  return <Line d={`M${x} ${y} c-9 0 -12 -9 -7 -14 c-3 -8 6 -14 12 -10 c6 -5 14 1 11 8 c5 5 1 15 -8 15 z M${x + 3} ${y + 1} v10`} />;
}

/**
 * Hollow Road from the gate down to the farm, drawn as a field track: two
 * edges and a few tufts of grass along it.
 */
export function NoticeMap({ labels, title }: { labels: { gate: string; road: string; farm: string }; title: string }) {
  return (
    <svg viewBox={viewBox("map")} className="notice-sketch" role="img" aria-label={title}>
      <Stroke delay={0}>
        <Gate x={396} y={1052} />
      </Stroke>
      <Stroke delay={0.35}>
        <Line d="M414 1112 C 420 1160, 600 1146, 604 1198 S 520 1256, 455 1279" />
        <Line d="M432 1110 C 440 1148, 624 1136, 626 1198 S 540 1266, 473 1279" />
      </Stroke>
      <Stroke delay={0.7}>
        <Line d="M520 1132 l3 -7 m3 8 l2 -6 M612 1166 l3 -7 m3 8 l2 -6 M500 1262 l3 -7 m3 8 l2 -6" />
        <Tree x={404} y={1156} />
        <Tree x={548} y={1250} />
      </Stroke>
      <Stroke delay={0.95}>
        <Barn x={392} y={1286} />
        <Cafe x={440} y={1286} />
        <Shop x={490} y={1286} />
      </Stroke>
      <g className="map-labels" style={{ "--delay": "0.5s" } as CSSProperties}>
        <text x={460} y={1090} className="map-label">
          {labels.gate}
        </text>
        <text x={392} y={1214} className="map-label">
          {labels.road}
        </text>
        <text x={392} y={1348} className="map-label" style={{ "--delay": "1.2s" } as CSSProperties}>
          {labels.farm}
        </text>
      </g>
    </svg>
  );
}

/** A pumpkin: the outline dented at top and bottom, ribs bowing out from the stem, a crooked stem and a curl of vine. */
function Pumpkin({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const top = y - h / 2;
  const bottom = y + h / 2;
  const dent = h * 0.08;
  const n = (v: number) => +v.toFixed(1);
  const outline =
    `M${n(x)} ${n(top + dent)} C${n(x + w * 0.58)} ${n(top - h * 0.1)} ${n(x + w * 0.62)} ${n(bottom + h * 0.08)} ${n(x)} ${n(bottom - dent)} ` +
    `C${n(x - w * 0.62)} ${n(bottom + h * 0.08)} ${n(x - w * 0.58)} ${n(top - h * 0.1)} ${n(x)} ${n(top + dent)}`;
  const rib = (k: number) =>
    `M${n(x)} ${n(top + dent)} C${n(x + k * w)} ${n(top + h * 0.04)} ${n(x + k * w)} ${n(bottom - h * 0.04)} ${n(x)} ${n(bottom - dent)}`;
  const s = h / 90;
  return (
    <>
      <Line d={outline} />
      {[-0.36, -0.13, 0.13, 0.36].map((k) => (
        <Line key={k} d={rib(k)} />
      ))}
      <Line
        d={`M${n(x - 4 * s)} ${n(top + dent)} q${n(1 * s)} ${n(-10 * s)} ${n(9 * s)} ${n(-17 * s)} l${n(5 * s)} ${n(4 * s)} q${n(-6 * s)} ${n(5 * s)} ${n(-5 * s)} ${n(13 * s)}`}
      />
      <Line
        d={`M${n(x + 6 * s)} ${n(top - 2 * s)} c${n(10 * s)} ${n(-12 * s)} ${n(26 * s)} ${n(-6 * s)} ${n(21 * s)} ${n(4 * s)} c${n(-3 * s)} ${n(6 * s)} ${n(-12 * s)} ${n(4 * s)} ${n(-10 * s)} ${n(-2 * s)}`}
      />
    </>
  );
}

/** A maple leaf: seven lobes, a stem and its veins, in one sure line. */
function MapleLeaf({ x, y, size, turn }: { x: number; y: number; size: number; turn: number }) {
  const k = size / 100;
  // The group is scaled; the pen is not.
  const pen = { strokeWidth: `calc(var(--pen) / ${k})` } as CSSProperties;
  return (
    <g transform={`translate(${x} ${y}) rotate(${turn}) scale(${k})`}>
      <path
        pathLength={1}
        className="sketch-line"
        style={pen}
        d="M0 -50 L9 -27 L22 -34 L18 -10 L42 -22 L36 -4 L50 0 L28 12 L33 22 L8 18 L4 40 L-4 40 L-8 18 L-33 22 L-28 12 L-50 0 L-36 -4 L-42 -22 L-18 -10 L-22 -34 L-9 -27 Z"
      />
      <path
        pathLength={1}
        className="sketch-line"
        style={pen}
        d="M0 62 Q2 48 0 40 V-38 M0 6 L30 -14 M0 6 L-30 -14 M0 22 L22 14 M0 22 L-22 14"
      />
    </g>
  );
}

/** Three pumpkins and a maple leaf. */
export function PumpkinSketch({ title }: { title: string }) {
  return (
    <svg viewBox={viewBox("drawings")} className="notice-sketch" role="img" aria-label={title}>
      <Stroke delay={0.05}>
        <Pumpkin x={868} y={1222} w={128} h={92} />
      </Stroke>
      <Stroke delay={0.3}>
        <Pumpkin x={772} y={1300} w={92} h={68} />
      </Stroke>
      <Stroke delay={0.5}>
        <Pumpkin x={956} y={1246} w={74} h={58} />
      </Stroke>
      <Stroke delay={0.7}>
        <MapleLeaf x={962} y={1082} size={86} turn={14} />
      </Stroke>
    </svg>
  );
}
