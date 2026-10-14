import type { CSSProperties, MouseEvent, ReactNode, Ref } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Locale } from "@/lib/i18n";
import { type Messages, format } from "@/lib/messages";
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
  /** Reached within the visit: the room's name rises into place as the camera lands. */
  arrived: boolean;
  onBack(event: MouseEvent<HTMLAnchorElement>): void;
  onNextDoor(room: RoomId, event: MouseEvent<HTMLAnchorElement>): void;
  headingRef?: Ref<HTMLHeadingElement>;
  ref?: Ref<HTMLDivElement>;
  /** The room's seeds, under the words. */
  children?: ReactNode;
}

/**
 * What is laid over a room, in type alone: the way back under the wordmark,
 * the room's name in the bottom-left corner like a gallery label, and the
 * corridor of the three buildings in the order they stand on the square.
 */
export function RoomUi({ room, lang, t, hint, arrived, onBack, onNextDoor, headingRef, ref, children }: RoomUiProps) {
  return (
    <div ref={ref} className="room-ui pointer-events-none absolute inset-0" data-arrived={arrived ? "" : undefined}>
      {children}
      <a href={`${placePath(lang, "square")}#square`} onClick={onBack} className="room-back pointer-events-auto">
        <Icon name="arrow-left" className="room-back-arrow" />
        <span>{t.back}</span>
      </a>
      <div className="room-foot" style={{ "--look": ROOMS[room].look, "--safe-left": ROOMS[room].safeLeft } as CSSProperties}>
        <div className="room-plaque">
          <p className="room-caption">{format(t.plaque, { n: ROOM_ROW.indexOf(room) + 1 })}</p>
          <h1 ref={headingRef} tabIndex={-1} className="room-name font-display">
            <span className="room-name-line">{t[room].title}</span>
          </h1>
        </div>
        <p aria-hidden={!hint} data-shown={hint ? "" : undefined} className="room-hint">
          {t.swipe}
        </p>
        <nav aria-label={t.corridor} className="room-corridor pointer-events-auto">
          <ol>
            {ROOM_ROW.map((id, i) => (
              <li key={id}>
                {i > 0 && <span aria-hidden="true" className="corridor-rule" />}
                {id === room ? (
                  <span aria-current="page" className="corridor-here">
                    <Icon name="moon" className="corridor-moon" />
                    {t[id].title}
                  </span>
                ) : (
                  <a href={placePath(lang, id)} onClick={(event) => onNextDoor(id, event)} className="corridor-link">
                    {t[id].title}
                  </a>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </div>
  );
}
