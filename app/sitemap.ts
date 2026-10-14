import type { MetadataRoute } from "next";
import { defaultLocale, locales } from "@/lib/i18n";
import { type Place, placeAlternates, placePath } from "@/lib/routes";
import { siteUrl } from "@/lib/site";

const places: readonly { place: Place; priority: number; image: string }[] = [
  { place: "square", priority: 1, image: "gate" },
  { place: "cafe", priority: 0.8, image: "cafe" },
  { place: "barn", priority: 0.8, image: "barn" },
  { place: "haunt", priority: 0.8, image: "haunt" },
  { place: "visit", priority: 0.5, image: "square-dusk" },
];

/** Every place in both languages, each listing its other-language twin. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const absolute = (path: string) => new URL(path, base).href;

  return places.flatMap(({ place, priority, image }) =>
    locales.map((lang) => ({
      url: absolute(placePath(lang, place)),
      changeFrequency: "monthly" as const,
      priority,
      images: [absolute(`/img/og/${image}.jpg`)],
      alternates: {
        languages: Object.fromEntries(
          Object.entries(placeAlternates(place, locales, defaultLocale)).map(([key, path]) => [key, absolute(path)]),
        ),
      },
    })),
  );
}
