/**
 * The film the scene is shot on: its grain, shared by the WebGL scene and the
 * page's own layers (the notice board's cards), so both are one piece of film.
 */

/** New grain this many times a second. */
export const GRAIN_FPS = 18;

/** How far a grain moves the frame's colour, either way. */
export const GRAIN_DEPTH = 0.022;

/** Size of a grain, CSS px. */
export const GRAIN_SIZE = 1;

/**
 * Grain about a mean of 0.5, `size`² texels in four channels (four grains).
 */
export function grainTile(size: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(127.5 + grain() * 127.5);
  return data;
}

/** One grain, −1 … 1: the sum of three throws is near enough to the bell of real film. */
export function grain(): number {
  const n = (Math.random() + Math.random() + Math.random()) / 3 - 0.5;
  return Math.max(-1, Math.min(1, n * 2.6));
}
