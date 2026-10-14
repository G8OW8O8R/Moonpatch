import type { Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";
import { visitCopy } from "@/lib/visit";
import type { SquareCopy } from "./GateScene";

/** Everything the scene shows in words, and each place's page title for when the scene moves there itself. */
export function sceneCopy(lang: Locale): SquareCopy {
  const { meta, square, visit, rooms, product } = getMessages(lang);
  const titled = (title: string) => `${title} · ${meta.siteName}`;
  return {
    lang,
    t: square,
    visit,
    board: visitCopy(lang),
    rooms,
    product,
    titles: {
      square: meta.title,
      cafe: titled(rooms.cafe.title),
      barn: titled(rooms.barn.title),
      haunt: titled(rooms.haunt.title),
    },
  };
}
