import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { ScrollMoon } from "@/components/ui/ScrollMoon";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { isLocale, locales } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { motionCssVars } from "@/lib/motion-tokens";
import { siteUrl } from "@/lib/site";
import { fontVariables } from "../fonts";
import "../globals.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const { meta } = getMessages(lang);

  return {
    metadataBase: siteUrl(),
    title: { default: meta.title, template: `%s · ${meta.siteName}` },
    description: meta.description,
    applicationName: meta.siteName,
    icons: {
      icon: [
        { url: "/brand/mark.svg", type: "image/svg+xml" },
        { url: "/img/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      ],
      apple: [{ url: "/img/icons/icon-180.png", sizes: "180x180" }],
    },
    openGraph: {
      type: "website",
      siteName: meta.siteName,
      locale: lang === "pl" ? "pl_PL" : "en_US",
      images: [{ url: "/img/og/gate.jpg", width: 1200, height: 630, alt: getMessages(lang).gate.posterAlt }],
    },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: "#3a2a1f",
  colorScheme: "light",
};

export default async function LangLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getMessages(lang);

  // Browser extensions write their own attributes onto <html> and <body> before the page hydrates;
  // those two elements only, never what is inside them, are spared the mismatch.
  return (
    <html lang={lang} className={fontVariables} style={motionCssVars() as CSSProperties} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SiteHeader lang={lang} t={t.header} tb={t.basket} />
        {children}
        <ScrollMoon />
      </body>
    </html>
  );
}
