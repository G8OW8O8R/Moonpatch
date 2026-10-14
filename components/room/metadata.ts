import type { Metadata } from "next";
import { defaultLocale, isLocale, locales } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import type { RoomId } from "@/lib/rooms";
import { placeAlternates, placePath } from "@/lib/routes";

/** Title, description, alternates and the room's own plate as its picture when shared. */
export async function roomMetadata(room: RoomId, params: Promise<{ lang: string }>): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const copy = getMessages(lang).rooms[room];
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: placePath(lang, room), languages: placeAlternates(room, locales, defaultLocale) },
    openGraph: { url: placePath(lang, room), images: [{ url: `/img/og/${room}.jpg`, width: 1200, height: 630, alt: copy.alt }] },
  };
}
