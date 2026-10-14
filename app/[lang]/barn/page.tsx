import { notFound } from "next/navigation";
import { FarmFront } from "@/components/gate/FarmFront";
import { roomMetadata } from "@/components/room/metadata";
import { isLocale } from "@/lib/i18n";

export const generateMetadata = ({ params }: PageProps<"/[lang]/barn">) => roomMetadata("barn", params);

export default async function Page({ params }: PageProps<"/[lang]/barn">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <FarmFront lang={lang} initialView="barn" />;
}
