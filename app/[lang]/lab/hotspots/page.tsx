import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HotspotEditor } from "@/components/product/HotspotEditor";
import { isLocale } from "@/lib/i18n";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Placing each product's seed on its room's plate; development builds only. */
export default async function HotspotLabPage({ params }: { params: Promise<{ lang: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <HotspotEditor lang={lang} />;
}
