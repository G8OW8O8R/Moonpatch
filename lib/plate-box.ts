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

export const CENTER: Readonly<Anchor> = { x: 0.5, y: 0.5 };

/** Keeps the moon sign and the latch of the gate in frame on tall screens. */
export const GATE_ANCHOR: Readonly<Anchor> = { x: 0.5, y: 0.55 };

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
