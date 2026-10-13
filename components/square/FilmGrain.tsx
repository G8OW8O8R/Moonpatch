"use client";

import { useEffect } from "react";
import { GRAIN_DEPTH, grain } from "@/components/gate/renderer/film";

/** Side of the square of grain, CSS px (one grain per CSS px, as in the scene). */
const TILE = 256;

let made = false;

/** One square of the scene's grain as two images: the darkening half (multiplied) and the brightening half (dodged). */
async function makeGrain() {
  if (made) return;
  made = true;
  const dark = new ImageData(TILE, TILE);
  const light = new ImageData(TILE, TILE);
  // The pixel arrays once, not through the image on every write.
  const dd = dark.data;
  const ld = light.data;
  for (let i = 0, o = 0; i < TILE * TILE; i++, o += 4) {
    // The colour times 1 + n·depth, as the scene's blend has it: below 1 by a multiply, above it by a dodge.
    const k = grain() * GRAIN_DEPTH;
    const d = k < 0 ? Math.round(255 * (1 + k)) : 255;
    const l = k > 0 ? Math.round((255 * k) / (1 + k)) : 0;
    dd[o] = dd[o + 1] = dd[o + 2] = d;
    ld[o] = ld[o + 1] = ld[o + 2] = l;
    dd[o + 3] = ld[o + 3] = 255;
  }
  const url = async (image: ImageData) => {
    const canvas = new OffscreenCanvas(TILE, TILE);
    canvas.getContext("2d")!.putImageData(image, 0, 0);
    return URL.createObjectURL(await canvas.convertToBlob({ type: "image/png" }));
  };
  const root = document.documentElement.style;
  root.setProperty("--grain-dark", `url(${await url(dark)})`);
  root.setProperty("--grain-light", `url(${await url(light)})`);
}

/**
 * The scene's film over what the page itself shows of the scene (the opened
 * board, its cards): the same grain, as fine, as deep and as fast. Over the
 * whole screen while the page alone paints it; over the board only once the
 * scene paints the rest, which then leaves the board to this layer.
 */
export function FilmGrain({ board }: { board: boolean }) {
  useEffect(() => {
    if (typeof OffscreenCanvas === "undefined") return;
    // Off the page's first moments: the film is a finish, never in the way of the board itself.
    const make = () => void makeGrain().catch(() => undefined);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(make, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(make, 200);
    return () => clearTimeout(id);
  }, []);
  // Two fixed layers, one shown at a time: nothing on the page ever changes place.
  return (
    <>
      <div aria-hidden="true" className="film-grain inset-0" data-shown={board ? undefined : ""} />
      <div aria-hidden="true" className="film-grain board-place" data-shown={board ? "" : undefined} />
    </>
  );
}
