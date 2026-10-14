/**
 * The Farm Pass: the ticket handed over at checkout for what waits at the
 * farm. Its shape and where everything sits on it are worked out here once,
 * in the ticket's own pixels, so the ticket on the page and the picture saved
 * from it are the same ticket. Two ways round: wide (stub on the right) and
 * tall (stub at the foot) for a phone held upright.
 */
import { formatDay } from "./basket";
import type { BasketLine } from "./basket";
import type { Locale } from "./i18n";
import { productById } from "./products";
import { randomFrom } from "./torn-edge";

export type Orientation = "wide" | "tall";

export type Pt = readonly [number, number];

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Inner proportions of the wordmark (its viewBox). */
const WORDMARK_RATIO = 2746.75 / 8789;

/** Concave bite at each outer corner, the half-round notch at each end of the perforation, the holes along it. */
export const CORNER = 18;
export const NOTCH = 11;
export const HOLE = 4.5;
export const HOLE_STEP = 17;
/** Deepest the paper frays in from an outer edge. */
const FRAY = 2.2;

const round = (n: number) => Math.round(n * 100) / 100;

/** Points along an arc around (cx, cy) from angle a0 to a1 (degrees, y down), ends included. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps = 8): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** A straight outer edge from a to b, frayed inwards (towards `inward`, a unit vector) by up to FRAY. */
function frayed(a: Pt, b: Pt, inward: Pt, random: () => number): Pt[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.round(length / 10));
  let wander = random();
  const out: Pt[] = [];
  for (let i = 1; i < steps; i++) {
    wander = Math.min(1, Math.max(0, wander + (random() - 0.5) * 0.5));
    const d = FRAY * (0.55 * wander + 0.45 * random());
    const t = i / steps;
    out.push([a[0] + (b[0] - a[0]) * t + inward[0] * d, a[1] + (b[1] - a[1]) * t + inward[1] * d]);
  }
  return out;
}

/** Centres of the holes along a perforation `breadth` long, between its two end notches. */
export function holeCentres(breadth: number): number[] {
  const span = breadth - 2 * NOTCH;
  const count = Math.max(0, Math.floor((span - HOLE_STEP / 2) / HOLE_STEP));
  const first = NOTCH + (span - (count - 1) * HOLE_STEP) / 2;
  return Array.from({ length: count }, (_, i) => first + i * HOLE_STEP);
}

/**
 * The two pieces of a wide ticket `length` × `breadth` cut at `at`: each
 * runs clockwise, with concave outer corners, frayed outer edges, a half
 * notch at each end of the cut and half of every hole along it, so the two
 * pieces side by side leave round holes between them.
 */
function pieces(length: number, breadth: number, at: number, seed: string): { main: Pt[]; stub: Pt[] } {
  const random = randomFrom(seed);
  const holes = holeCentres(breadth);
  const B = breadth;
  const L = length;

  const main: Pt[] = [[CORNER, 0]];
  main.push(...frayed([CORNER, 0], [at - NOTCH, 0], [0, 1], random));
  main.push(...arc(at, 0, NOTCH, 180, 90));
  for (const y of holes) main.push(...arc(at, y, HOLE, 270, 90, 10));
  main.push(...arc(at, B, NOTCH, 270, 180));
  main.push(...frayed([at - NOTCH, B], [CORNER, B], [0, -1], random));
  main.push(...arc(0, B, CORNER, 0, -90));
  main.push(...frayed([0, B - CORNER], [0, CORNER], [1, 0], random));
  main.push(...arc(0, 0, CORNER, 90, 0));

  const stub: Pt[] = [[at + NOTCH, 0]];
  stub.push(...frayed([at + NOTCH, 0], [L - CORNER, 0], [0, 1], random));
  stub.push(...arc(L, 0, CORNER, 180, 90));
  stub.push(...frayed([L, CORNER], [L, B - CORNER], [-1, 0], random));
  stub.push(...arc(L, B, CORNER, 270, 180));
  stub.push(...frayed([L - CORNER, B], [at + NOTCH, B], [0, -1], random));
  stub.push(...arc(at, B, NOTCH, 0, -90));
  for (const y of [...holes].reverse()) stub.push(...arc(at, y, HOLE, 90, -90, 10));
  stub.push(...arc(at, 0, NOTCH, 90, 0));

  const tidy = (points: Pt[]) => points.map(([x, y]) => [round(x), round(y)] as Pt);
  return { main: tidy(main), stub: tidy(stub) };
}

export interface PassLayout {
  orientation: Orientation;
  width: number;
  height: number;
  /** Where the stub tears off: x on a wide ticket, y on a tall one. */
  cut: number;
  /** Each piece's outline, in the ticket's px. */
  main: Pt[];
  stub: Pt[];
  /** The double frame on each piece (outer line; the inner runs FRAME_GAP inside it). */
  mainFrame: Rect;
  stubFrame: Rect;
  /** The words on the main piece, centred on `centre`: the tops of their lines, top down. */
  centre: number;
  arc: { cx: number; cy: number; r: number };
  wordmark: Rect;
  /** One line wide (day · hours), two tall (day, then hours). */
  date: number[];
  waiting: number;
  list: { top: number; step: number };
  /** "Admit one": its centre and turn (degrees); the moon stamp: centre, size, turn. */
  admit: { x: number; y: number; rotate: number };
  stamp: { x: number; y: number; size: number; rotate: number };
  /** The ticket's number, in the stub's top right corner. */
  serial: Corner;
}

/**
 * The heading round the top keeps this far above the wordmark's highest point,
 * reckoning with the widest it is ever set (`ARC_SPAN`, along its line) and a
 * mark hanging under its last letter (the ogonek of "Ę", `ARC_DESCENT`).
 */
export const ARC_CLEAR = 12;
export const ARC_SPAN = { wide: 360, tall: 320 } as const;
export const ARC_DESCENT = 7;

/** How far the ends of a heading `span` long sit below its middle on a circle of radius `r`. */
export const arcSag = (r: number, span: number) => r - Math.sqrt(r * r - (span / 2) ** 2);

/** A run of tiny type: its right edge and the top of its line. */
export interface Corner {
  right: number;
  top: number;
}

export const FRAME_INSET = 22;
export const FRAME_GAP = 7;
/** How deep the stub is, along the ticket. */
const STUB = { wide: 210, tall: 200 } as const;
const WIDE_LENGTH = 1000;
const TALL_BREADTH = 440;

/** Swaps x and y: a wide ticket turned to stand tall, its stub at the foot. */
const transpose = (points: Pt[]): Pt[] => points.map(([x, y]) => [y, x] as Pt).reverse();

/** Where everything sits on a pass listing `items` things, wide or tall; `seed` keeps its own tear. */
export function passLayout(orientation: Orientation, items: number, seed: string): PassLayout {
  const n = Math.max(1, items);
  if (orientation === "wide") {
    const step = 36;
    const top = 322;
    const height = Math.max(432, top + n * step + 54);
    const cut = WIDE_LENGTH - STUB.wide;
    const { main, stub } = pieces(WIDE_LENGTH, height, cut, seed);
    const wordmarkWidth = 360;
    return {
      orientation,
      width: WIDE_LENGTH,
      height,
      cut,
      main,
      stub,
      mainFrame: { x: FRAME_INSET, y: FRAME_INSET, width: cut - 2 * FRAME_INSET, height: height - 2 * FRAME_INSET },
      stubFrame: { x: cut + FRAME_INSET, y: FRAME_INSET, width: STUB.wide - 2 * FRAME_INSET, height: height - 2 * FRAME_INSET },
      centre: cut / 2,
      arc: { cx: cut / 2, cy: 58 + 620, r: 620 },
      wordmark: { x: cut / 2 - wordmarkWidth / 2, y: 104, width: wordmarkWidth, height: round(wordmarkWidth * WORDMARK_RATIO) },
      date: [228],
      waiting: 278,
      list: { top, step },
      admit: { x: cut + 70, y: height / 2 + 14, rotate: -90 },
      stamp: { x: cut + 145, y: round(height * 0.7), size: 76, rotate: -14 },
      serial: { right: WIDE_LENGTH - FRAME_INSET - FRAME_GAP - 10, top: FRAME_INSET + FRAME_GAP + 10 },
    };
  }
  const step = 34;
  const top = 330;
  const mainLength = Math.max(452, top + n * step + 52);
  const length = mainLength + STUB.tall;
  const { main, stub } = pieces(length, TALL_BREADTH, mainLength, seed);
  const wordmarkWidth = 300;
  return {
    orientation,
    width: TALL_BREADTH,
    height: length,
    cut: mainLength,
    main: transpose(main),
    stub: transpose(stub),
    mainFrame: { x: FRAME_INSET, y: FRAME_INSET, width: TALL_BREADTH - 2 * FRAME_INSET, height: mainLength - 2 * FRAME_INSET },
    stubFrame: { x: FRAME_INSET, y: mainLength + FRAME_INSET, width: TALL_BREADTH - 2 * FRAME_INSET, height: STUB.tall - 2 * FRAME_INSET },
    centre: TALL_BREADTH / 2,
    arc: { cx: TALL_BREADTH / 2, cy: 56 + 600, r: 600 },
    wordmark: { x: TALL_BREADTH / 2 - wordmarkWidth / 2, y: 98, width: wordmarkWidth, height: round(wordmarkWidth * WORDMARK_RATIO) },
    date: [208, 244],
    waiting: 290,
    list: { top, step },
    admit: { x: TALL_BREADTH / 2, y: mainLength + 80, rotate: 0 },
    stamp: { x: TALL_BREADTH / 2 + 110, y: mainLength + 136, size: 76, rotate: -14 },
    serial: { right: TALL_BREADTH - FRAME_INSET - FRAME_GAP - 10, top: mainLength + FRAME_INSET + FRAME_GAP + 10 },
  };
}

/** A frame with concave corners (radius `r`), as an SVG path: one path for the page and the saved picture. */
export function framePath({ x, y, width, height }: Rect, r: number): string {
  const R = x + width;
  const B = y + height;
  const f = (n: number) => round(n);
  return [
    `M${f(x + r)} ${f(y)}`,
    `H${f(R - r)}`,
    `A${r} ${r} 0 0 0 ${f(R)} ${f(y + r)}`,
    `V${f(B - r)}`,
    `A${r} ${r} 0 0 0 ${f(R - r)} ${f(B)}`,
    `H${f(x + r)}`,
    `A${r} ${r} 0 0 0 ${f(x)} ${f(B - r)}`,
    `V${f(y + r)}`,
    `A${r} ${r} 0 0 0 ${f(x + r)} ${f(y)}`,
    "Z",
  ].join(" ");
}

/** An outline as an SVG path. */
export const outlinePath = (points: readonly Pt[]) => `M${points.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;

/** An outline as a CSS polygon, relative to a piece placed at (`dx`, `dy`) on the ticket. */
export const outlinePolygon = (points: readonly Pt[], dx = 0, dy = 0) =>
  `polygon(${points.map(([x, y]) => `${round(x - dx)}px ${round(y - dy)}px`).join(", ")})`;

/** What the pass says: the day of the visit and what waits for it; whether anything was shipped. */
export interface PassOrder {
  day: string;
  visit: BasketLine[];
  shipped: boolean;
}

/** The order as it was at checkout, or null when nothing waits at the farm (no pass, a note instead). */
export function passOrder(lines: readonly BasketLine[], day: string | null): PassOrder | null {
  const visit: BasketLine[] = [];
  let shipped = false;
  for (const line of lines) {
    const product = productById(line.id);
    if (!product) continue;
    if (product.fulfillment === "visit") visit.push({ ...line });
    else shipped = true;
  }
  return visit.length && day ? { day, visit, shipped } : null;
}

/**
 * The ticket's number, six digits: the same for the same day and the same
 * things (in any order), so the page and the saved picture agree.
 */
export function passNumber(order: Pick<PassOrder, "day" | "visit">): string {
  const key = [order.day, ...order.visit.map(({ id, qty }) => `${id}:${qty}`).sort()].join("|");
  // FNV-1a, 32 bit.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
  return String((hash >>> 0) % 1_000_000).padStart(6, "0");
}

/** The visit as the pass prints it: the day ("Saturday, October 18"), then the hours. */
export function passDate(day: string, lang: Locale, hours: string): [string, string] {
  return [formatDay(day, lang, "long"), hours];
}
