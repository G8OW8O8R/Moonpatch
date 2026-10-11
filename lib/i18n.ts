export const locales = ["en", "pl"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(value: string | null | undefined): value is Locale {
  return locales.some((locale) => locale === value);
}

/** Native names, read out after the short EN / PL labels. */
export const localeNames: Record<Locale, string> = { en: "English", pl: "Polski" };

/**
 * Picks the site language from an `Accept-Language` header.
 * Polish speakers land on /pl, everyone else on the English default.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return defaultLocale;

  let best: { locale: Locale; q: number } | null = null;
  for (const part of header.split(",")) {
    const [rawTag = "", ...params] = part.trim().split(";");
    const primary = rawTag.trim().toLowerCase().split("-")[0];
    if (!isLocale(primary)) continue;

    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (!Number.isFinite(q) || q <= 0) continue;

    if (!best || q > best.q) best = { locale: primary, q };
  }
  return best?.locale === "pl" ? "pl" : defaultLocale;
}

/** Splits `/pl/anything` into its locale and the rest of the path. */
export function splitLocale(pathname: string): { locale: Locale | null; rest: string } {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  const head = match?.[1];
  if (isLocale(head)) return { locale: head, rest: match?.[2] ?? "" };
  return { locale: null, rest: pathname === "/" ? "" : pathname };
}

/** The same page in another language. */
export function switchLocalePath(pathname: string, to: Locale): string {
  const { rest } = splitLocale(pathname);
  return `/${to}${rest === "/" ? "" : rest}`;
}
