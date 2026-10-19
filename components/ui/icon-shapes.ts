/**
 * The drawings of public/icons, inline, so a mark is on screen with the HTML.
 * Outlined icons are 1.6 strokes on a 24 grid; "filled" ones are solid.
 */
export const ICON_SHAPES = {
  moon: { body: "<path d=\"M15.6 3.6a8.6 8.6 0 1 0 4.9 13.1A7.1 7.1 0 0 1 15.6 3.6z\"/>", filled: true },
  wheelbarrow: { body: "<path d=\"M2.8 7.6h12.6l-2.6 5.2H5.6z\"/><circle cx=\"6.8\" cy=\"17.4\" r=\"2.5\"/><path d=\"M8.6 15.7l12.6-5.1\"/><path d=\"M14.6 13.3l1.6 5\"/>" },
  "sound-on": { body: "<path d=\"M4 9.6h3.1L11.4 6v12l-4.3-3.6H4z\"/><path d=\"M14.6 9.4c.8.7 1.2 1.6 1.2 2.6s-.4 1.9-1.2 2.6\"/><path d=\"M17.2 7c1.4 1.3 2.2 3.1 2.2 5s-.8 3.7-2.2 5\"/>" },
  "sound-off": { body: "<path d=\"M4 9.6h3.1L11.4 6v12l-4.3-3.6H4z\"/><path d=\"M15.2 9.8l4.3 4.4M19.5 9.8l-4.3 4.4\"/>" },
  close: { body: "<path d=\"M6 6.2l11.8 11.6M17.9 6.1L6.1 17.9\"/>" },
  "arrow-left": { body: "<path d=\"M19.6 12.1H4.6\"/><path d=\"M10.2 6.4L4.5 12.1l5.7 5.6\"/>" },
  plus: { body: "<path d=\"M12 5v14M5 12.1h14\"/>" },
  minus: { body: "<path d=\"M5 12.1h14\"/>" },
  pin: { body: "<path d=\"M12 21.2s6.4-6.2 6.4-11.1A6.4 6.4 0 0 0 5.6 10.1c0 4.9 6.4 11.1 6.4 11.1z\"/><circle cx=\"12\" cy=\"10\" r=\"2.3\"/>" },
  calendar: { body: "<rect x=\"3.8\" y=\"5.4\" width=\"16.4\" height=\"15\" rx=\"2\"/><path d=\"M3.8 9.8h16.4M8.2 3.4v3.6M15.8 3.4v3.6\"/><path d=\"M8 13.4h.01M12 13.4h.01M16 13.4h.01M8 16.8h.01M12 16.8h.01\"/>" },
  ticket: { body: "<path d=\"M3.6 7.4c0-.8.6-1.4 1.4-1.4h14c.8 0 1.4.6 1.4 1.4v2.2a2.4 2.4 0 0 0 0 4.8v2.2c0 .8-.6 1.4-1.4 1.4H5c-.8 0-1.4-.6-1.4-1.4v-2.2a2.4 2.4 0 0 0 0-4.8z\"/><path d=\"M14.6 6.6v1.6M14.6 11.2v1.6M14.6 15.8v1.6\"/>" },
  recipe: { body: "<path d=\"M6 2.8h8.4l5 5v12.2c0 .7-.5 1.2-1.2 1.2H6c-.7 0-1.2-.5-1.2-1.2V4c0-.7.5-1.2 1.2-1.2z\"/><path d=\"M14.4 2.8v4c0 .6.4 1 1 1h4\"/><path d=\"M8.2 12.6h7.6M8.2 16.4h5\"/>" },
  tag: { body: "<g transform=\"rotate(-30 13 14)\"><path d=\"M8.4 9.4 13 5.4l4.6 4v10c0 .8-.6 1.4-1.4 1.4H9.8c-.8 0-1.4-.6-1.4-1.4z\"/><circle cx=\"13\" cy=\"9.6\" r=\"1.4\"/></g><path d=\"M9.6 9.4C7.4 8.6 4.6 6.6 3.4 3\"/>" },
} as const satisfies Record<string, { body: string; filled?: true }>;

export type IconName = keyof typeof ICON_SHAPES;
