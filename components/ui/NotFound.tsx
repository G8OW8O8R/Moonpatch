import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/messages";
import { placePath } from "@/lib/routes";
import { PLATE } from "@/lib/plate-box";
import { Icon } from "./Icon";

const srcSet = (format: "avif" | "webp") => `/img/plates/404-1600.${format} 1600w, /img/plates/404-2576.${format} 2576w`;
const sizes = `(max-aspect-ratio: ${PLATE.width}/${PLATE.height}) ${+((PLATE.width / PLATE.height) * 100).toFixed(2)}vh, 100vw`;

/**
 * Where a wrong turn ends: a pumpkin field in the fog at dusk, a scarecrow on
 * the track, and the way back to the gate.
 */
export function NotFound({ lang, t }: { lang: Locale; t: Messages["notFound"] }) {
  return (
    <main className="lost" data-header="paper">
      <picture>
        <source type="image/avif" srcSet={srcSet("avif")} sizes={sizes} />
        <img
          src="/img/plates/404-1600.webp"
          srcSet={srcSet("webp")}
          sizes={sizes}
          alt={t.alt}
          width={PLATE.width}
          height={PLATE.height}
          fetchPriority="high"
          draggable={false}
          className="lost-plate select-none"
        />
      </picture>
      <div className="lost-copy">
        <h1 className="lost-title font-display">{t.title}</h1>
        <p className="lost-line">{t.line}</p>
        <a href={placePath(lang, "square")} className="lost-back">
          <Icon name="arrow-left" className="lost-back-arrow" halo />
          <span>{t.back}</span>
        </a>
      </div>
    </main>
  );
}
