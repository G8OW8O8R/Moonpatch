import { notFound } from "next/navigation";
import { FarmFront } from "@/components/gate/FarmFront";
import { roomMetadata } from "@/components/room/metadata";
import { isLocale } from "@/lib/i18n";

export const generateMetadata = ({ params }: PageProps<"/[lang]/cafe">) => roomMetadata("cafe", params);

export default async function Page({ params }: PageProps<"/[lang]/cafe">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <FarmFront lang={lang} initialView="cafe" />;
}
