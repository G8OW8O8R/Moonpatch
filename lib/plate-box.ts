/**
 * Shared geometry for full-bleed plates.
 *
 * Every plate and layer is authored on the same 2576×1438 canvas. `plateBox`
 * fits that canvas to a viewport like `object-fit: cover`, and the anchor has
 * the exact meaning of `object-position` percentages — so an <img> styled with
 * `objectPosition(anchor)` and a canvas or overlay placed with `plateBox(...)`
 * land on the same pixels.
 */

export interface Size {
  width: number;
  height: number;
}

/** Fractions 0–1, same meaning as `object-position: x% y%`. */
export interface Anchor {
  x: number;
  y: number;
}

/** A point on the plate in normalised coordinates (0–1 on each axis). */
export interface PlatePoint {
  u: number;
  v: number;
}

export interface ViewportPoint {
  x: number;
  y: number;
}

export interface PlateBox {
  /** CSS pixels per plate pixel. */
  scale: number;
  /** Rendered plate size in CSS pixels, never smaller than the viewport. */
  width: number;
  height: number;
  /** Offset of the plate's top-left corner, always ≤ 0. */
  x: number;
  y: number;
}

export const PLATE: Readonly<Size> = { width: 2576, height: 1438 };

/** Portrait gate plate: the same scene and scale, with more sky and road. */
export const PLATE_TALL: Readonly<Size> = { width: 2552, height: 4577 };

/** gate.jpg pixel (x, y) is gate-tall.jpg pixel (x + offset.x, y + offset.y). */
export const TALL_OFFSET: Readonly<{ x: number; y: number }> = { x: -10, y: 1671 };

export const CENTER: Readonly<Anchor> = { x: 0.5, y: 0.5 };

/** Keeps the moon sign and the latch of the gate in frame on tall screens. */
export const GATE_ANCHOR: Readonly<Anchor> = { x: 0.5, y: 0.55 };

/**
 * Centred between the two gate posts (gate.jpg x 271–2354) so both stay in
 * frame on a 390×844 phone; vertically biased towards the gate over the sky.
 */
export const GATE_TALL_ANCHOR: Readonly<Anchor> = { x: 0.561, y: 0.6 };

/** A cover fit pushed in further around a point of the plate. */
export interface Framing extends Anchor {
  /** Extra magnification over the cover fit (1 = plain cover). */
  zoom: number;
  /** The point the push-in closes on; it keeps its place on screen. */
  focus: PlatePoint;
}

/**
 * Framing of the square plates. The ride through the gate pushes in on the
 * café, a little towards the road, and lands here; the square scene starts
 * from the same frame, so the hand-off between them is invisible. Portrait
 * screens already travel a long way in from the tall gate, so they keep the
 * plain cover fit.
 */
export const SQUARE_ANCHOR: Readonly<Framing> = {
  x: 0.5,
  y: 0.5,
  zoom: 1.12,
  focus: { u: 1280 / 2576, v: 960 / 1438 },
};

/** Screens narrower than 4:5 get the portrait plate. */
export const TALL_ASPECT_BELOW = 4 / 5;

/** Media queries that split screens exactly as `posterPlate` does. */
export const TALL_MEDIA = "(aspect-ratio < 4/5)";
export const WIDE_MEDIA = "(aspect-ratio >= 4/5)";

export type PosterPlate = "gate" | "gate-tall";

export const posterPlates: Readonly<Record<PosterPlate, { size: Readonly<Size>; anchor: Readonly<Anchor> }>> = {
  gate: { size: PLATE, anchor: GATE_ANCHOR },
  "gate-tall": { size: PLATE_TALL, anchor: GATE_TALL_ANCHOR },
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function assertSize(size: Size, label: string) {
  const ok =
    Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;
  if (!ok) throw new RangeError(`${label} must have positive, finite dimensions`);
}

export function plateBox(viewport: Size, plate: Size = PLATE, anchor: Anchor = CENTER): PlateBox {
  assertSize(viewport, "viewport");
  assertSize(plate, "plate");

  const scale = Math.max(viewport.width / plate.width, viewport.height / plate.height);
  const width = plate.width * scale;
  const height = plate.height * scale;

  return {
    scale,
    width,
    height,
    // `+ 0` turns -0 into 0 so it never reaches CSS as "-0px".
    x: (viewport.width - width) * clamp01(anchor.x) + 0,
    y: (viewport.height - height) * clamp01(anchor.y) + 0,
  };
}

export function plateToViewport(box: PlateBox, point: PlatePoint): ViewportPoint {
  return { x: box.x + point.u * box.width, y: box.y + point.v * box.height };
}

export function viewportToPlate(box: PlateBox, point: ViewportPoint): PlatePoint {
  return { u: (point.x - box.x) / box.width, v: (point.y - box.y) / box.height };
}

/** Which gate plate the poster shows on this viewport. */
export function posterPlate(viewport: Size): PosterPlate {
  assertSize(viewport, "viewport");
  return viewport.width / viewport.height < TALL_ASPECT_BELOW ? "gate-tall" : "gate";
}

/** A point on gate.jpg expressed on gate-tall.jpg. */
export function gateToTall(point: PlatePoint): PlatePoint {
  return {
    u: (point.u * PLATE.width + TALL_OFFSET.x) / PLATE_TALL.width,
    v: (point.v * PLATE.height + TALL_OFFSET.y) / PLATE_TALL.height,
  };
}

/** A point on gate-tall.jpg expressed on gate.jpg. */
export function tallToGate(point: PlatePoint): PlatePoint {
  return {
    u: (point.u * PLATE_TALL.width - TALL_OFFSET.x) / PLATE.width,
    v: (point.v * PLATE_TALL.height - TALL_OFFSET.y) / PLATE.height,
  };
}

/** Box of the gate poster on this viewport, whichever plate it shows. */
export function posterBox(viewport: Size): { plate: PosterPlate; box: PlateBox } {
  const plate = posterPlate(viewport);
  const { size, anchor } = posterPlates[plate];
  return { plate, box: plateBox(viewport, size, anchor) };
}

/**
 * Where a point given in gate.jpg coordinates lands on screen. Gate layers are
 * authored on gate.jpg, so they line up with either poster plate through this.
 */
export function gateToViewport(viewport: Size, point: PlatePoint): ViewportPoint {
  const { plate, box } = posterBox(viewport);
  return plateToViewport(box, plate === "gate-tall" ? gateToTall(point) : point);
}

/**
 * Box of a plate under a framing: the cover fit, scaled around the focus,
 * then nudged back so the plate still covers the whole viewport.
 */
export function framedBox(viewport: Size, plate: Size, framing: Framing): PlateBox {
  const base = plateBox(viewport, plate, framing);
  const zoom = Math.max(1, framing.zoom);
  const width = base.width * zoom;
  const height = base.height * zoom;
  const fx = base.x + framing.focus.u * base.width;
  const fy = base.y + framing.focus.v * base.height;
  const clampTo = (value: number, min: number) => Math.min(0, Math.max(min, value)) + 0;
  return {
    scale: base.scale * zoom,
    width,
    height,
    x: clampTo(fx - framing.focus.u * width, viewport.width - width),
    y: clampTo(fy - framing.focus.v * height, viewport.height - height),
  };
}

/** Where square-golden sits on this viewport: pushed in on landscape screens, plain cover on portrait ones. */
export function squareBox(viewport: Size): PlateBox {
  const portrait = posterPlate(viewport) === "gate-tall";
  return framedBox(viewport, PLATE, portrait ? { ...SQUARE_ANCHOR, zoom: 1 } : SQUARE_ANCHOR);
}

/** CSS `object-position` that reproduces `plateBox` for the same anchor. */
export function objectPosition(anchor: Anchor): string {
  const pct = (n: number) => `${+(clamp01(n) * 100).toFixed(4)}%`;
  return `${pct(anchor.x)} ${pct(anchor.y)}`;
}

/**
 * `sizes` for a cover-fitted plate: it is as wide as the viewport, or wider
 * when the screen is taller than the plate's aspect ratio.
 */
export function coverSizes(plate: Size = PLATE): string {
  const ratio = plate.width / plate.height;
  return `(max-aspect-ratio: ${plate.width}/${plate.height}) ${+(ratio * 100).toFixed(2)}vh, 100vw`;
}
