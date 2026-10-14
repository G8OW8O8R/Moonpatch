import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FarmFront } from "@/components/gate/FarmFront";
import { defaultLocale, isLocale, locales } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { placeAlternates, placePath } from "@/lib/routes";

export async function generateMetadata({ params }: PageProps<"/[lang]/visit">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const { visit } = getMessages(lang);

  return {
    title: visit.title,
    description: visit.description,
    alternates: {
      canonical: placePath(lang, "visit"),
      languages: placeAlternates("visit", locales, defaultLocale),
    },
    openGraph: { url: placePath(lang, "visit"), images: [{ url: "/img/og/square-dusk.jpg", width: 1200, height: 630 }] },
  };
}

/** The square at dusk, opened on its notice board. */
export default async function VisitPage({ params }: PageProps<"/[lang]/visit">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <FarmFront lang={lang} initialView="visit" />;
}
