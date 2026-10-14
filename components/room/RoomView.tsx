import type { CSSProperties, MouseEvent, Ref } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/messages";
import { PLATE, ROOM_REST_ZOOM } from "@/lib/plate-box";
import { ROOMS, ROOM_ROW, type RoomId } from "@/lib/rooms";
import { placePath } from "@/lib/routes";

const srcSet = (room: RoomId, format: "avif" | "webp") => `/img/plates/${room}-1600.${format} 1600w, /img/plates/${room}-2576.${format} 2576w`;

/** The plate is the cover fit, a little larger: as wide as the screen, or wider on a tall one. */
const ratio = PLATE.width / PLATE.height;
const sizes = `(max-aspect-ratio: ${PLATE.width}/${PLATE.height}) ${+(ratio * ROOM_REST_ZOOM * 100).toFixed(2)}vh, ${ROOM_REST_ZOOM * 100}vw`;

/**
 * The room at rest as a plain picture, framed exactly as the scene frames it
 * (the cover fit at the resting zoom, looking where the room first looks):
 * the page's first frame when it opens inside, and the room whenever the
 * scene is not drawing it. Opened on its own address it simply stands there
 * (it is the page's largest paint); reached within the visit it fades in.
 */
export function RoomPlate({ room, alt, fade, ref }: { room: RoomId; alt: string; fade: boolean; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className={`room-plate absolute inset-0 overflow-hidden transition-opacity duration-150 ${fade ? "starting:opacity-0" : ""}`}>
      <picture>
        <source type="image/avif" srcSet={srcSet(room, "avif")} sizes={sizes} />
        <img
          src={`/img/plates/${room}-1600.webp`}
          srcSet={srcSet(room, "webp")}
          sizes={sizes}
          alt={alt}
          width={PLATE.width}
          height={PLATE.height}
          fetchPriority="high"
          draggable={false}
          style={{ "--look": ROOMS[room].look } as CSSProperties}
          className="select-none"
        />
      </picture>
    </div>
  );
}

export interface RoomUiProps {
  room: RoomId;
  lang: Locale;
  t: Messages["rooms"];
  /** Show the hint about looking around (narrow touch screens, once a visit). */
  hint: boolean;
  onBack(event: MouseEvent<HTMLAnchorElement>): void;
  onNextDoor(room: RoomId, event: MouseEvent<HTMLAnchorElement>): void;
  headingRef?: Ref<HTMLHeadingElement>;
  ref?: Ref<HTMLDivElement>;
}

/** What is laid over a room: its name for screen readers, the way back, the doors next to it. */
export function RoomUi({ room, lang, t, hint, onBack, onNextDoor, headingRef, ref }: RoomUiProps) {
  const others = ROOM_ROW.filter((id) => id !== room);
  return (
    <div ref={ref} className="room-ui pointer-events-none absolute inset-0 transition-opacity duration-150">
      <h1 ref={headingRef} tabIndex={-1} className="sr-only">
        {t[room].title}
      </h1>
      <nav aria-label={t[room].title} className="room-nav pointer-events-auto">
        <a href={`${placePath(lang, "square")}#square`} onClick={onBack} className="room-link">
          <Icon name="arrow-left" className="room-icon" />
          <span>{t.back}</span>
        </a>
        <p className="room-next">
          <span>{t.nextDoor}: </span>
          {others.map((id, i) => (
            <span key={id}>
              {i > 0 && <span aria-hidden="true"> · </span>}
              <a href={placePath(lang, id)} onClick={(event) => onNextDoor(id, event)} className="room-link">
                {t[id].title}
              </a>
            </span>
          ))}
        </p>
      </nav>
      <p aria-hidden={!hint} data-shown={hint ? "" : undefined} className="room-hint">
        {t.swipe}
      </p>
    </div>
  );
}
