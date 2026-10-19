/**
 * The halo that hugs the header's marks, in the colour opposite the ink: dense
 * at the edge, gone a few pixels out. Drawn as strokes in screen pixels under
 * the mark itself, so it costs no filter pass and paints with the mark.
 * `reach` is how far past the edge each band goes, in CSS pixels.
 */
export const HUG = [
  { reach: 0.75, opacity: 0.6 },
  { reach: 1.75, opacity: 0.3 },
  { reach: 3.5, opacity: 0.12 },
  { reach: 6, opacity: 0.05 },
] as const;
