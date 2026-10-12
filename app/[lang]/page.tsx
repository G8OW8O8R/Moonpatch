import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FarmFront } from "@/components/gate/FarmFront";
import { defaultLocale, isLocale, locales } from "@/lib/i18n";
import { placeAlternates, placePath } from "@/lib/routes";

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};

  return {
    alternates: {
      canonical: placePath(lang, "square"),
      languages: placeAlternates("square", locales, defaultLocale),
    },
    openGraph: { url: placePath(lang, "square") },
  };
}

export default async function GatePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <FarmFront lang={lang} />;
}
