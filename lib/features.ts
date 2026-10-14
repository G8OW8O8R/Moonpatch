/**
 * Parts of the farm that are built but not yet open to visitors. While one is
 * off, everything that points at it (the header's counter or switch) stays out
 * of the page.
 */
export const features: Readonly<Record<"moons" | "sound", boolean>> = {
  /** The hidden moons and their counter in the header. */
  moons: false,
  /** Sound and its switch in the header. */
  sound: true,
};
