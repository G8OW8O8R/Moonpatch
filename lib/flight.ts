/**
 * The path a product's photo takes into the wheelbarrow: thrown in a high arc
 * from where it was to where the wheelbarrow stands, shrinking on the way.
 */

/** A product went in: its photo flies from `from` (CSS px on the screen) into the wheelbarrow. */
export const FLIGHT_EVENT = "moonpatch:basket-flight";

export interface FlightDetail {
  id: string;
  from: Box;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlightStep {
  /** Offset of the photo's centre from where it started, CSS px. */
  x: number;
  y: number;
  scale: number;
  rotate: number;
  opacity: number;
}

/**
 * `steps` + 1 points along a quadratic arc from the centre of `from` to the
 * centre of `to`, peaking `lift` px above the higher of the two. The photo
 * ends as large as `to`, tips forward as it falls, and fades only at the end.
 */
export function flightPath(from: Box, to: Box, steps = 16, lift = 120): FlightStep[] {
  const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const b = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const peak = Math.min(a.y, b.y) - lift;
  // The control point whose curve tops out exactly on `peak` (the higher root of the vertex equation).
  const c = { x: (a.x + b.x) / 2, y: peak - Math.sqrt((a.y - peak) * (b.y - peak)) };
  const end = Math.max(0.05, Math.min(1, to.width / Math.max(1, from.width)));
  const out: FlightStep[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
    const y = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
    out.push({
      x: x - a.x,
      y: y - a.y,
      scale: 1 + (end - 1) * t,
      rotate: (b.x >= a.x ? 1 : -1) * 18 * t,
      opacity: t < 0.85 ? 1 : Math.max(0, (1 - t) / 0.15),
    });
  }
  return out;
}
