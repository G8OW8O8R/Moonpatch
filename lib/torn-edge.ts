/**
 * Paper torn by hand: a clip-path polygon whose edges wander in and out by a
 * few pixels, the same for the same seed (a card keeps its own tear).
 */

/** A small, repeatable random sequence (mulberry32) from a string. */
export function randomFrom(seed: string): () => number {
  let state = 0;
  for (let i = 0; i < seed.length; i++) state = (Math.imul(state ^ seed.charCodeAt(i), 2654435761) + i) | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Side = "top" | "right" | "bottom" | "left";

export interface TearOptions {
  /** Which edges are torn; the others stay straight. */
  torn?: readonly Side[];
  /** Deepest a tear bites into the paper, px. */
  depth?: number;
  /** Points along each torn edge. */
  points?: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * A polygon running clockwise from the top-left corner. Positions along an
 * edge are percentages (the card may be any size); the bite inwards is px.
 */
export function tornPolygon(seed: string, { torn = ["top", "right", "bottom", "left"], depth = 3, points = 48 }: TearOptions = {}): string {
  const random = randomFrom(seed);
  // A tear is rough at two scales: a slow wander and a fine fray.
  const bite = (wander: { value: number }) => {
    wander.value = Math.min(1, Math.max(0, wander.value + (random() - 0.5) * 0.5));
    return round(depth * (0.55 * wander.value + 0.45 * random()));
  };
  const out: string[] = [];
  const edge = (side: Side) => {
    const wander = { value: random() };
    const steps = torn.includes(side) ? points : 1;
    for (let i = 0; i < steps; i++) {
      const at = round((i / steps) * 100);
      const d = torn.includes(side) ? bite(wander) : 0;
      if (side === "top") out.push(`${at}% ${d}px`);
      if (side === "right") out.push(`calc(100% - ${d}px) ${at}%`);
      if (side === "bottom") out.push(`${round(100 - at)}% calc(100% - ${d}px)`);
      if (side === "left") out.push(`${d}px ${round(100 - at)}%`);
    }
  };
  (["top", "right", "bottom", "left"] as const).forEach(edge);
  return `polygon(${out.join(", ")})`;
}
