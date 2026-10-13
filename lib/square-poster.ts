/**
 * Still images of the square at the end of dusk, baked by `pnpm square` from
 * the very layers the scene draws, and the opened board in the sizes the page
 * asks for. Self-contained, so the build can import it as is.
 */

/** The square at the end of dusk, every light on: square plate px, full width and 1600 px. */
export const DUSK_POSTER = {
  base: "/img/square/poster-dusk",
  widths: [1600, 2576] as const,
} as const;

/**
 * The part of the square seen behind the opened board, out of focus and
 * dimmed as the scene dims it there. Square plate px: every screen shape's
 * view behind the board falls inside it.
 */
export const SOFT_POSTER = {
  src: "/img/square/poster-dusk-soft.webp",
  rect: { x: 360, y: 400, w: 930, h: 650 },
  /** Image px per plate px. */
  scale: 0.5,
  /** Blur, plate px, and the darkening the scene lays behind an open panel. */
  blur: 2.6,
  dim: [0.7525, 0.725, 0.736] as const,
} as const;

/**
 * Where the plate sits behind the opened board, roughly, before the page has
 * measured itself: the plate region that covers the screen (square plate px).
 * The exact place follows once the scene's geometry runs.
 */
export const SOFT_VIEW = {
  wide: { x: 456, y: 588, w: 734, h: 413 },
  tall: { x: 1005, y: 661, w: 139, h: 304 },
} as const;

/** The board in the lantern's light, as the camera arrives on it, in the widths screens ask for. */
export const OPENED_BOARD_WIDTHS = [960, 1160, 1345] as const;
export const openedBoardFile = (width: number, format: "avif" | "webp") => `/img/square/board-open-${width}.${format}`;

export const openedBoardSrcSet = (format: "avif" | "webp") =>
  OPENED_BOARD_WIDTHS.map((width) => `${openedBoardFile(width, format)} ${width}w`).join(", ");
