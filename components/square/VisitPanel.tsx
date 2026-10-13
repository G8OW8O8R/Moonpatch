"use client";

import { type CSSProperties, type KeyboardEvent, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Messages } from "@/lib/messages";
import { BOARD_TEXT } from "@/lib/board-parts";
import { openedBoardFile, openedBoardSrcSet } from "@/lib/square-poster";
import { BOARD, BOARD_PARTS, openedBoardSizes } from "@/lib/square-props";
import type { VisitCopy } from "@/lib/visit";
import { FilmGrain } from "./FilmGrain";
import { NoticeMap, PumpkinSketch } from "./sketches";

type CardId = keyof typeof BOARD_PARTS.cards;
type Box = { x: number; y: number; w: number; h: number };

const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

/** "10 am", "Oct 31", "31 października": a number never parts from its word at a line end. */
const keepTogether = (text: string) => text.replace(/(\d) (?=[a-zA-Ząćęłńóśźż])/g, "$1 ").replace(/([A-Za-z]{3}) (?=\d)/g, "$1 ");

/** A box on the board as shares of it, turned with its card, so it scales with the board. */
const boxStyle = (box: Box, card: CardId): CSSProperties => {
  const { rotate } = BOARD_PARTS.cards[card];
  return {
    left: `${(box.x / BOARD.width) * 100}%`,
    top: `${(box.y / BOARD.height) * 100}%`,
    width: `${(box.w / BOARD.width) * 100}%`,
    height: `${(box.h / BOARD.height) * 100}%`,
    transform: rotate ? `rotate(${rotate}deg)` : undefined,
  };
};

/** The corner the kraft note covers, kept clear by a float the words run around (board px, from the box's own corner). */
const notchStyle = (box: (typeof BOARD_TEXT)["hours"]): CSSProperties =>
  ({
    "--push": box.notch.y - box.y,
    "--notch": box.x + box.w - box.notch.x,
  }) as CSSProperties;

/** The opened board as the panel shows it, outside the page: for fetching and decoding it ahead of time. */
export function openedBoardPicture(): HTMLImageElement {
  const picture = document.createElement("picture");
  const source = document.createElement("source");
  source.type = "image/avif";
  source.srcset = openedBoardSrcSet("avif");
  source.sizes = openedBoardSizes();
  const img = document.createElement("img");
  img.srcset = openedBoardSrcSet("webp");
  img.sizes = openedBoardSizes();
  picture.append(source, img);
  // Only once the sources are in place, or the browser would start on the fallback.
  img.src = openedBoardFile(1160, "webp");
  return img;
}

export interface VisitPanelProps {
  copy: VisitCopy;
  t: Messages["visit"];
  /** The board has arrived (the camera move onto it is over): the cards may show. */
  arrived: boolean;
  /**
   * Whether the board itself is in the page yet. While the camera is still
   * flying onto it, the dialog holds only its title and close button; the
   * cards are laid out once the camera is still, where the work cannot jolt it.
   */
  content: boolean;
  /** Opened from the square (fades in), rather than arrived on at its address (simply there). */
  fade: boolean;
  /**
   * The scene paints the board itself, its lantern alight, beneath the cards:
   * the image here is only for the first paint and the plain-HTML square.
   */
  painted: boolean;
  onClose(): void;
}

/**
 * The notice board up close: hours, what's on, a map drawn in as the board
 * opens, a sheet of sketches and the note that says what this site is. A
 * modal dialog: focus stays inside, Esc and the close button go back to the
 * square. The board image lands exactly where the scene's camera brought it
 * (its place is set in CSS, from the server's first paint), so the hand-over
 * from the canvas cannot be seen; once the scene runs, the board under the
 * cards is the scene's own, its lantern alight.
 */
export function VisitPanel({ copy, t, arrived, content, fade, painted, onClose }: VisitPanelProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  // Focus moves in once, and goes back to whatever opened the board when it closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    close.current?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    // The page beneath stays put while the board is open.
    if (SCROLL_KEYS.has(event.key) && !(event.key === " " && (event.target as HTMLElement).matches("a, button"))) {
      event.preventDefault();
      return;
    }
    if (event.key !== "Tab" || !dialog.current) return;
    const focusable = [...dialog.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const board = content && (
    <div className="notice-board board-place absolute">
      <picture>
        <source type="image/avif" srcSet={openedBoardSrcSet("avif")} sizes={openedBoardSizes()} />
        <img
          src={openedBoardFile(1160, "webp")}
          srcSet={openedBoardSrcSet("webp")}
          sizes={openedBoardSizes()}
          alt=""
          width={BOARD.width}
          height={BOARD.height}
          fetchPriority={fade ? "auto" : "high"}
          className={`absolute inset-0 size-full max-w-none ${painted ? "invisible" : ""}`}
          draggable={false}
        />
      </picture>

      <section data-card="hours" className="notice-card notice-hours absolute" style={boxStyle(BOARD_TEXT.hours, "hours")}>
        <span aria-hidden="true" className="notice-push" style={notchStyle(BOARD_TEXT.hours)} />
        <span aria-hidden="true" className="notice-notch" style={notchStyle(BOARD_TEXT.hours)} />
        <h3 className="notice-title">{copy.hours.title}</h3>
        {copy.hours.lines.map((line) => (
          <p key={line} className="notice-hand">
            {keepTogether(line)}
          </p>
        ))}
      </section>

      <section data-card="whatsOn" className="notice-card notice-whats-on absolute" style={boxStyle(BOARD_TEXT.whatsOn, "whatsOn")}>
        <h3 className="notice-title">{copy.whatsOn.title}</h3>
        <ul className="notice-list">
          {copy.whatsOn.items.map((item) => (
            <li key={item} className="notice-hand">
              <svg aria-hidden="true" viewBox="0 0 20 14" className="notice-tick">
                <path pathLength={1} className="sketch-line" d="M3 8 Q5 10 7 12 Q11 5 18 2" />
              </svg>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <div
        data-card="map"
        className="notice-card notice-drawing absolute"
        style={boxStyle(BOARD_PARTS.cards.map, "map")}
        data-moon-slot={copy.moon.hiddenBehind === "map" ? copy.moon.id : undefined}
      >
        <NoticeMap labels={copy.map} title={t.map} />
      </div>

      <div data-card="drawings" className="notice-card notice-drawing absolute" style={boxStyle(BOARD_PARTS.cards.drawings, "drawings")}>
        <PumpkinSketch title={t.drawings} />
      </div>

      <section data-card="note" className="notice-card notice-kraft absolute" style={boxStyle(BOARD_TEXT.note, "note")}>
        <p>{copy.note.text}</p>
        <a href={copy.note.href} className="notice-link" rel="noopener" target="_blank">
          {copy.note.link}
        </a>
      </section>
    </div>
  );

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="visit-heading"
      className="visit-panel absolute inset-0"
      data-arrived={arrived ? "" : undefined}
      data-fade={fade ? "" : undefined}
      onKeyDown={onKeyDown}
    >
      <h2 id="visit-heading" className="sr-only">
        {t.board}
      </h2>

      {board}
      {content && <FilmGrain board={painted} />}

      <button ref={close} type="button" className="visit-close" onClick={onClose}>
        <Icon name="close" />
        <span>{t.close}</span>
      </button>
    </div>
  );
}
