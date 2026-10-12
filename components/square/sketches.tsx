/**
 * Pen drawings on the notice board's cards. Coordinates are the card's own
 * pixels on noticeboard.png, so the drawings scale with the board. Lines
 * carry pathLength=1, which lets CSS draw them in when the board opens.
 */
import type { CSSProperties } from "react";

type Point = readonly [number, number];

/** A wobbly hand line through points: each segment a gentle curve rather than a ruler stroke. */
function hand(points: readonly Point[], closed = false): string {
  const [first, ...rest] = points;
  if (!first) return "";
  let d = `M${first[0].toFixed(1)} ${first[1].toFixed(1)}`;
  let prev = first;
  rest.forEach((p, i) => {
    const wobble = ((i * 37) % 7) / 7 - 0.5;
    const mx = (prev[0] + p[0]) / 2 + (p[1] - prev[1]) * 0.08 * wobble;
    const my = (prev[1] + p[1]) / 2 - (p[0] - prev[0]) * 0.08 * wobble;
    d += ` Q${mx.toFixed(1)} ${my.toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    prev = p;
  });
  return closed ? `${d} Z` : d;
}

/** A shape given on a unit grid, scaled, turned and moved. */
function placed(points: readonly Point[], at: Point, size: number, degrees: number): Point[] {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return points.map(([x, y]) => [at[0] + size * (x * cos - y * sin), at[1] + size * (x * sin + y * cos)] as const);
}

const MAPLE: Point[] = [
  [0, -1], [0.16, -0.62], [0.46, -0.78], [0.38, -0.36], [0.86, -0.42], [0.62, -0.06], [0.76, 0.16],
  [0.36, 0.2], [0.42, 0.46], [0.08, 0.36], [0, 0.6], [-0.08, 0.36], [-0.42, 0.46], [-0.36, 0.2],
  [-0.76, 0.16], [-0.62, -0.06], [-0.86, -0.42], [-0.38, -0.36], [-0.46, -0.78], [-0.16, -0.62], [0, -1],
];

function Leaf({ at, size, turn, delay }: { at: Point; size: number; turn: number; delay: number }) {
  const style = { "--delay": `${delay}s` } as CSSProperties;
  return (
    <g style={style}>
      <path pathLength={1} className="sketch-line" d={hand(placed(MAPLE, at, size, turn))} />
      <path pathLength={1} className="sketch-line" d={hand(placed([[0, 1.05], [0, 0.6], [0, -0.78]], at, size, turn))} />
      <path pathLength={1} className="sketch-line" d={hand(placed([[0, 0.25], [0.62, -0.3]], at, size, turn))} />
      <path pathLength={1} className="sketch-line" d={hand(placed([[0, 0.25], [-0.62, -0.3]], at, size, turn))} />
    </g>
  );
}

/** An outline with a dent at top and bottom, ribs bowing out from the stem, a crooked stem and a curl of vine. */
function Pumpkin({ at, w, h, delay }: { at: Point; w: number; h: number; delay: number }) {
  const [x, y] = at;
  const top = y - h / 2;
  const bottom = y + h / 2;
  const dent = h * 0.08;
  const n = (v: number) => v.toFixed(1);
  const outline =
    `M${n(x)} ${n(top + dent)} C${n(x + w * 0.58)} ${n(top - h * 0.1)} ${n(x + w * 0.62)} ${n(bottom + h * 0.08)} ${n(x)} ${n(bottom - dent)} ` +
    `C${n(x - w * 0.62)} ${n(bottom + h * 0.08)} ${n(x - w * 0.58)} ${n(top - h * 0.1)} ${n(x)} ${n(top + dent)}`;
  const rib = (k: number) =>
    `M${n(x)} ${n(top + dent)} C${n(x + k * w)} ${n(top + h * 0.02)} ${n(x + k * w)} ${n(bottom - h * 0.02)} ${n(x)} ${n(bottom - dent)}`;
  const style = { "--delay": `${delay}s` } as CSSProperties;
  return (
    <g style={style}>
      <path pathLength={1} className="sketch-line" d={outline} />
      {[-0.4, -0.16, 0.16, 0.4].map((k) => (
        <path key={k} pathLength={1} className="sketch-line" d={rib(k)} />
      ))}
      <path pathLength={1} className="sketch-line" d={hand([[x - 3, top + dent], [x - 2, top - 10], [x + 5, top - 16]])} />
      <path pathLength={1} className="sketch-line" d={hand([[x + 4, top + dent - 1], [x + 6, top - 8], [x + 11, top - 13]])} />
      <path pathLength={1} className="sketch-line" d={`M${n(x + 4)} ${n(top - 6)} c 10 -10 22 -4 18 4 c -3 6 -12 4 -10 -2 c 2 -5 9 -4 9 0`} />
    </g>
  );
}

function Tree({ at, delay }: { at: Point; delay: number }) {
  const [x, y] = at;
  return (
    <g style={{ "--delay": `${delay}s` } as CSSProperties}>
      <path
        pathLength={1}
        className="sketch-line"
        d={`M${x} ${y - 15} c 8 0 13 6 12 12 c 4 3 3 11 -3 12 c -3 4 -14 4 -18 0 c -6 -1 -7 -9 -3 -12 c -1 -6 4 -12 12 -12 z`}
      />
      <path pathLength={1} className="sketch-line" d={`M${x} ${y + 9} v 13 M${x} ${y + 14} l 5 -5`} />
    </g>
  );
}

/** Hollow Road from the gate to the farm, with a moon over it. */
export function NoticeMap({ labels, title }: { labels: { gate: string; road: string; farm: string }; title: string }) {
  return (
    <div role="img" aria-label={title} className="relative size-full">
      <svg viewBox="0 0 272 366" className="notice-sketch" aria-hidden="true">
        <g style={{ "--delay": "0s" } as CSSProperties}>
          <path pathLength={1} className="sketch-line" d="M36 22 A17 17 0 1 0 47 51 A13 13 0 1 1 36 22 Z" />
        </g>
        <g style={{ "--delay": "0.15s" } as CSSProperties}>
          <path pathLength={1} className="sketch-line" d={hand([[140, 92], [140, 52]])} />
          <path pathLength={1} className="sketch-line" d={hand([[176, 92], [176, 52]])} />
          <path pathLength={1} className="sketch-line" d="M138 54 Q158 36 178 54" />
          <path pathLength={1} className="sketch-line" d={hand([[142, 66], [174, 66], [174, 84], [142, 84], [142, 66], [174, 84]])} />
        </g>
        <g style={{ "--delay": "0.35s" } as CSSProperties}>
          <path pathLength={1} className="sketch-line" d="M150 94 C 132 122, 50 150, 66 190 S 196 226, 150 262 S 50 300, 34 340" />
          <path pathLength={1} className="sketch-line" d="M166 94 C 152 126, 74 156, 90 190 S 220 222, 176 266 S 80 306, 72 342" />
        </g>
        <Tree at={[40, 128]} delay={0.6} />
        <Tree at={[214, 176]} delay={0.7} />
        <Tree at={[228, 222]} delay={0.75} />
        <Tree at={[28, 236]} delay={0.85} />
        <g style={{ "--delay": "0.9s" } as CSSProperties}>
          <path pathLength={1} className="sketch-line" d={hand([[24, 352], [46, 336], [68, 352]])} />
          <path pathLength={1} className="sketch-line" d={hand([[28, 350], [28, 366], [64, 366], [64, 350]])} />
        </g>
      </svg>
      <span className="map-label" style={{ right: "53%", top: "21%", "--delay": "0.5s" } as CSSProperties}>
        {labels.gate}
      </span>
      <span className="map-label" style={{ left: "30%", bottom: "8%", "--delay": "1s" } as CSSProperties}>
        {labels.road}
        <br />
        {labels.farm}
      </span>
    </div>
  );
}

/** Three pumpkins and a few maple leaves. */
export function PumpkinSketch({ title }: { title: string }) {
  return (
    <svg viewBox="0 0 314 386" className="notice-sketch" role="img" aria-label={title}>
      <Pumpkin at={[206, 196]} w={124} h={92} delay={0.1} />
      <Pumpkin at={[96, 286]} w={96} h={72} delay={0.3} />
      <Pumpkin at={[230, 306]} w={92} h={70} delay={0.45} />
      <Leaf at={[262, 52]} size={30} turn={18} delay={0.55} />
      <Leaf at={[158, 70]} size={24} turn={-12} delay={0.6} />
      <Leaf at={[52, 196]} size={26} turn={-38} delay={0.7} />
      <Leaf at={[150, 352]} size={20} turn={8} delay={0.8} />
      <Leaf at={[46, 356]} size={18} turn={-20} delay={0.85} />
    </svg>
  );
}
