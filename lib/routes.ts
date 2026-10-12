/**
 * Addresses of the places on the farm. Each page lives in the app under its
 * English name; Polish visitors see Polish addresses, which the proxy
 * rewrites onto the same pages.
 */
import { type Locale, splitLocale, switchLocalePath } from "./i18n";

export type Place = "square" | "cafe" | "barn" | "haunt" | "visit";

/** Places with an address of their own (the square is the language root). */
export type Room = Exclude<Place, "square">;

export const rooms: readonly Room[] = ["cafe", "barn", "haunt", "visit"];

const slugs: Record<Locale, Record<Room, string>> = {
  en: { cafe: "cafe", barn: "barn", haunt: "haunt", visit: "visit" },
  pl: { cafe: "kawiarnia", barn: "stodola", haunt: "straszydla", visit: "odwiedz-nas" },
};

/** Public address of a place. */
export function placePath(lang: Locale, place: Place): string {
  return place === "square" ? `/${lang}` : `/${lang}/${slugs[lang][place]}`;
}

/**
 * Which place an address shows, or null when it is not one of them. A page's
 * own segment counts too: that is the path a rewritten page renders under.
 */
export function placeAt(pathname: string): { lang: Locale; place: Place } | null {
  const { locale, rest } = splitLocale(pathname);
  if (!locale) return null;
  const slug = rest.replace(/^\/|\/$/g, "");
  if (!slug) return { lang: locale, place: "square" };
  const room = rooms.find((r) => slugs[locale][r] === slug || r === slug);
  return room ? { lang: locale, place: room } : null;
}

/**
 * What the proxy does with a localised address: Polish slugs are rewritten
 * onto the page's own segment, and a page's English segment under /pl is
 * sent on to its Polish address.
 */
export function routeFor(pathname: string): { rewrite: string } | { redirect: string } | null {
  const { locale, rest } = splitLocale(pathname);
  if (locale !== "pl") return null;
  const slug = rest.replace(/^\/|\/$/g, "");
  const local = rooms.find((r) => slugs.pl[r] === slug);
  if (local && slugs.pl[local] !== local) return { rewrite: `/pl/${local}` };
  const english = rooms.find((r) => r === slug && slugs.pl[r] !== r);
  if (english) return { redirect: placePath("pl", english) };
  return null;
}

/** The same place in another language; any other address keeps its path. */
export function switchLanguage(pathname: string, to: Locale): string {
  const here = placeAt(pathname);
  return here ? placePath(to, here.place) : switchLocalePath(pathname, to);
}

/** hreflang alternates for a place. */
export function placeAlternates(place: Place, locales: readonly Locale[], fallback: Locale) {
  return {
    ...Object.fromEntries(locales.map((locale) => [locale, placePath(locale, place)])),
    "x-default": placePath(fallback, place),
  };
}
