import { PLATE, coverSizes } from "@/lib/plate-box";
import { DUSK_POSTER } from "@/lib/square-poster";
import { ARMS, type ArmId, BOARD_WRITING, DUSK_PROP } from "@/lib/square-props";
import { armLabelSizes } from "./labels";

/** Square-plate variants for a <picture>, as the plain-HTML square lists them. */
export const plateSrcSet = (base: string, widths: readonly number[], format: "avif" | "webp") =>
  widths.map((width) => `${base}-${width}.${format} ${width}w`).join(", ");

export const GOLDEN_PLATE = { base: "/img/plates/square-golden", widths: [1600, 2576] } as const;
export { DUSK_POSTER };

/** Images kept decoded for the way back; held here so the browser has no reason to let them go. */
const kept: HTMLImageElement[] = [];
let warmed = false;

const keep = (img: HTMLImageElement) => {
  img.decoding = "async";
  img.fetchPriority = "low";
  kept.push(img);
  void img.decode().catch(() => undefined);
};

/** A plate through a <picture> like the page's, so the browser picks the very file it will show. */
const warmPlate = (plate: { base: string; widths: readonly number[] }) => {
  const picture = document.createElement("picture");
  const source = document.createElement("source");
  source.type = "image/avif";
  source.srcset = plateSrcSet(plate.base, plate.widths, "avif");
  source.sizes = coverSizes(PLATE);
  const img = document.createElement("img");
  img.sizes = coverSizes(PLATE);
  img.srcset = plateSrcSet(plate.base, plate.widths, "webp");
  picture.append(source, img);
  // Only once the sources are in place, or the browser would start on the fallback.
  img.src = `${plate.base}-1600.webp`;
  keep(img);
};

const warmFile = (src: string) => {
  const img = new Image();
  img.src = src;
  keep(img);
};

/**
 * Fetches and decodes the plain-HTML square ahead of time: the square at
 * dusk, the golden plate, the props standing on it and the size of their
 * lettering. A way back onto the
 * square (from a building, to the other language) then shows it in its very
 * first frame, while the scene loads beneath it. Once per page life, when the
 * browser has nothing better to do.
 */
export function warmSquare(arms: { labels: Record<ArmId, string>; lang: string }) {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  const run = () => {
    // The arms' lettering is measured too, so the plain-HTML signpost is lettered in its first frame.
    void armLabelSizes(arms.labels, arms.lang).catch(() => undefined);
    warmPlate(DUSK_POSTER);
    warmPlate(GOLDEN_PLATE);
    for (const id of ["post", ...ARMS.map((arm) => `arm-${arm.id}` as const), "board"] as const) {
      warmFile(`/img/square/${id}.webp`);
      warmFile(DUSK_PROP(id));
    }
    warmFile(BOARD_WRITING);
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 2500 });
  else setTimeout(run, 300);
}
