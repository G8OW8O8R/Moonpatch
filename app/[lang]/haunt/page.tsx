import { notFound } from "next/navigation";
import { FarmFront } from "@/components/gate/FarmFront";
import { roomMetadata } from "@/components/room/metadata";
import { isLocale } from "@/lib/i18n";

export const generateMetadata = ({ params }: PageProps<"/[lang]/haunt">) => roomMetadata("haunt", params);

export default async function Page({ params }: PageProps<"/[lang]/haunt">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <FarmFront lang={lang} initialView="haunt" />;
}
