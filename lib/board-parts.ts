/**
 * The notice board's image and its landmarks, in pixels of
 * public/layers/noticeboard.png. Self-contained, so the build that bakes the
 * board can import it as is.
 */

export const BOARD = { width: 1345, height: 2226 } as const;

/** Notice board landmarks, in pixels of noticeboard.png. */
export const BOARD_PARTS = {
  cork: { x: 320, y: 480, w: 725, h: 935 },
  lantern: { x: 150, y: 668, r: 70 },
  /** Feet of the two legs. */
  feet: [
    { x: 229, y: 2226 },
    { x: 1127, y: 2226 },
  ],
  /** The blank cards pinned to the cork, with their tilt in degrees. */
  cards: {
    hours: { x: 368, y: 532, w: 284, h: 400, rotate: 0 },
    whatsOn: { x: 770, y: 572, w: 233, h: 320, rotate: 1.4 },
    note: { x: 572, y: 806, w: 248, h: 332, rotate: -3.3 },
    map: { x: 368, y: 992, w: 272, h: 366, rotate: -1 },
    drawings: { x: 708, y: 980, w: 314, h: 386, rotate: 3.6 },
  },
} as const;
