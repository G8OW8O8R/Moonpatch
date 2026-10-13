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

/**
 * Where each card's words go, board px: clear of its pin or peg, of the
 * curl at its corner and of the kraft note pinned over it. `notch` is the
 * corner the note covers: words keep out of x ≥ notch.x from y ≥ notch.y on.
 */
export const BOARD_TEXT = {
  hours: { x: 392, y: 580, w: 240, h: 330, notch: { x: 552, y: 790 } },
  whatsOn: { x: 788, y: 622, w: 206, h: 176 },
  note: { x: 600, y: 856, w: 196, h: 256 },
} as const;

/** What lies over the cards, board px: the kraft note, the pins and the pegs. Nothing written may run beneath them. */
export const BOARD_COVERS = {
  note: { x: 562, y: 798, w: 272, h: 344, over: ["hours", "whatsOn", "map", "drawings"] },
  hoursPin: { x: 496, y: 540, w: 26, h: 26, over: ["hours"] },
  mapPin: { x: 483, y: 991, w: 26, h: 26, over: ["map"] },
  whatsOnPeg: { x: 876, y: 498, w: 38, h: 116, over: ["whatsOn"] },
  notePeg: { x: 668, y: 732, w: 36, h: 112, over: ["note", "hours"] },
  drawingsPeg: { x: 872, y: 912, w: 40, h: 112, over: ["drawings"] },
} as const;
