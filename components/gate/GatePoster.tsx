import { preload } from "react-dom";
import { GATE_ANCHOR, PLATE, coverSizes, objectPosition } from "@/lib/plate-box";

const base = "/img/plates/gate";
const srcSet = (format: "avif" | "webp") => `${base}-1600.${format} 1600w, ${base}-2576.${format} 2576w`;
const sizes = coverSizes(PLATE);

/** Average colour of the dirt road along the plate's bottom edge. */
const ROAD = "#7a5c48";

/**
 * The gate at golden hour, cover-fitted with the shared plate geometry: the
 * first frame of the page and its largest paint. Variants are pre-encoded by
 * `pnpm images`, so this is a plain <picture> rather than a runtime optimiser.
 *
 * Chromium never reports an image that covers the entire viewport as the
 * largest contentful paint (it reads as a background), so the poster stops one
 * pixel short of the bottom edge; the road colour underneath hides the seam.
 * Overlays should take their geometry from the image's own rect.
 */
export function GatePoster({ alt }: { alt: string }) {
  preload(`${base}-1600.avif`, {
    as: "image",
    type: "image/avif",
    imageSrcSet: srcSet("avif"),
    imageSizes: sizes,
    fetchPriority: "high",
  });

  return (
    <div className="absolute inset-0" style={{ backgroundColor: ROAD }}>
      <picture>
        <source type="image/avif" srcSet={srcSet("avif")} sizes={sizes} />
        <source type="image/webp" srcSet={srcSet("webp")} sizes={sizes} />
        <img
          src={`${base}-1600.webp`}
          alt={alt}
          width={PLATE.width}
          height={PLATE.height}
          fetchPriority="high"
          decoding="sync"
          draggable={false}
          className="absolute inset-x-0 top-0 h-[calc(100%-1px)] w-full object-cover select-none"
          style={{ objectPosition: objectPosition(GATE_ANCHOR) }}
        />
      </picture>
    </div>
  );
}
