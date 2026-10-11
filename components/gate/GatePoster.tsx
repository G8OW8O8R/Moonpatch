import { preload } from "react-dom";
import {
  PLATE,
  TALL_MEDIA,
  WIDE_MEDIA,
  type PosterPlate,
  coverSizes,
  objectPosition,
  posterPlates,
} from "@/lib/plate-box";

const variants = (plate: PosterPlate) => {
  const { size, anchor } = posterPlates[plate];
  const base = `/img/plates/${plate}`;
  const srcSet = (format: "avif" | "webp") => `${base}-1600.${format} 1600w, ${base}-${size.width}.${format} ${size.width}w`;
  return { base, srcSet, sizes: coverSizes(size), position: objectPosition(anchor) };
};

const wide = variants("gate");
const tall = variants("gate-tall");

/**
 * The gate at golden hour: the first frame of the page. Landscape and squarish
 * screens get gate.jpg, portrait phones the tall plate of the same scene. Both
 * are cover-fitted with the shared plate geometry; the variants are
 * pre-encoded by `pnpm images`, so this is a plain <picture>.
 */
export function GatePoster({ alt }: { alt: string }) {
  for (const [variant, media] of [
    [wide, WIDE_MEDIA],
    [tall, TALL_MEDIA],
  ] as const) {
    preload(`${variant.base}-1600.avif`, {
      as: "image",
      type: "image/avif",
      media,
      imageSrcSet: variant.srcSet("avif"),
      imageSizes: variant.sizes,
      fetchPriority: "high",
    });
  }

  return (
    <>
      <style>{`.gate-poster{object-position:${wide.position}}@media ${TALL_MEDIA}{.gate-poster{object-position:${tall.position}}}`}</style>
      <picture>
        <source media={TALL_MEDIA} type="image/avif" srcSet={tall.srcSet("avif")} sizes={tall.sizes} />
        <source media={TALL_MEDIA} type="image/webp" srcSet={tall.srcSet("webp")} sizes={tall.sizes} />
        <source type="image/avif" srcSet={wide.srcSet("avif")} sizes={wide.sizes} />
        <source type="image/webp" srcSet={wide.srcSet("webp")} sizes={wide.sizes} />
        <img
          src={`${wide.base}-1600.webp`}
          alt={alt}
          width={PLATE.width}
          height={PLATE.height}
          fetchPriority="high"
          decoding="sync"
          draggable={false}
          className="gate-poster absolute inset-0 size-full object-cover select-none"
        />
      </picture>
    </>
  );
}
