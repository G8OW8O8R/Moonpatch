import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { defaultLocale, isLocale, locales } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { PLATE, coverSizes } from "@/lib/plate-box";
import { placeAlternates, placePath } from "@/lib/routes";

export type RoomId = "cafe" | "barn" | "haunt";

export async function roomMetadata(room: RoomId, params: Promise<{ lang: string }>): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const copy = getMessages(lang).rooms[room];
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: placePath(lang, room), languages: placeAlternates(room, locales, defaultLocale) },
    openGraph: { url: placePath(lang, room), images: [{ url: `/img/plates/${room}-1600.webp`, width: 1600, height: 893 }] },
  };
}

const srcSet = (room: RoomId, format: "avif" | "webp") =>
  `/img/plates/${room}-1600.${format} 1600w, /img/plates/${room}-2576.${format} 2576w`;

/** One of the three buildings, seen from just inside the door. */
export async function RoomPage({ room, params }: { room: RoomId; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const { rooms } = getMessages(lang);
  const copy = rooms[room];

  return (
    <main data-header="paper" className="relative h-svh overflow-hidden bg-bark">
      <picture>
        <source type="image/avif" srcSet={srcSet(room, "avif")} sizes={coverSizes(PLATE)} />
        <img
          src={`/img/plates/${room}-1600.webp`}
          srcSet={srcSet(room, "webp")}
          sizes={coverSizes(PLATE)}
          alt={copy.alt}
          width={PLATE.width}
          height={PLATE.height}
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover select-none"
          draggable={false}
        />
      </picture>
      <h1 className="sr-only">{copy.title}</h1>
      <Link href={`${placePath(lang, "square")}#square`} className="room-back">
        <Icon name="arrow-left" className="drop-shadow-hug" />
        <span>{rooms.back}</span>
      </Link>
    </main>
  );
}
