import type { Metadata } from "next";
import { headers } from "next/headers";
import type { CSSProperties } from "react";
import { NotFound } from "@/components/ui/NotFound";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { LANG_HEADER, type Locale, defaultLocale, isLocale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { motionCssVars } from "@/lib/motion-tokens";
import { fontVariables } from "./fonts";
import "./globals.css";

async function language(): Promise<Locale> {
  const lang = (await headers()).get(LANG_HEADER);
  return isLocale(lang) ? lang : defaultLocale;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = getMessages(await language());
  return {
    title: `${t.notFound.title} · ${t.meta.siteName}`,
    icons: { icon: [{ url: "/brand/mark.svg", type: "image/svg+xml" }] },
  };
}

/**
 * Every wrong turn, under either language or neither: the same field at dusk,
 * in the language of the address (English when it has none).
 */
export default async function GlobalNotFound() {
  const lang = await language();
  const t = getMessages(lang);
  return (
    <html lang={lang} className={fontVariables} style={motionCssVars() as CSSProperties}>
      <body>
        <SiteHeader lang={lang} t={t.header} tb={t.basket} />
        <NotFound lang={lang} t={t.notFound} />
      </body>
    </html>
  );
}
