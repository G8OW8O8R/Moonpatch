import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
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
    icons: { icon: [{ url: "/brand/mark.svg", type: "image/svg+xml" }] },
    openGraph: {
      type: "website",
      siteName: meta.siteName,
      locale: lang === "pl" ? "pl_PL" : "en_US",
      images: [{ url: "/img/plates/gate-1600.webp", width: 1600, height: 893 }],
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

  return (
    <html lang={lang} className={fontVariables} style={motionCssVars() as CSSProperties}>
      <body>
        <SiteHeader lang={lang} t={t.header} />
        {children}
      </body>
    </html>
  );
}
