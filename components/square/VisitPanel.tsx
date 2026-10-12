"use client";

import { type CSSProperties, type KeyboardEvent, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import type { Messages } from "@/lib/messages";
import { BOARD, BOARD_PARTS, OPENED_BOARD, OPENED_BOARD_AVIF } from "@/lib/square-props";
import type { VisitCopy } from "@/lib/visit";
import { NoticeMap, PumpkinSketch } from "./sketches";

type CardId = keyof typeof BOARD_PARTS.cards;

const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

/** "10 am", "Oct 31", "31 października": a number never parts from its word at a line end. */
const keepTogether = (text: string) =>
  text.replace(/(d) (?=[a-zA-Ząćęłńóśźż])/g, "$1 ").replace(/([A-Za-z]{3}) (?=d)/g, "$1 ");

/** A card's place on the board as shares of it, so it scales with the board. */
const cardStyle = (id: CardId): CSSProperties => {
  const c = BOARD_PARTS.cards[id];
  return {
    left: `${(c.x / BOARD.width) * 100}%`,
    top: `${(c.y / BOARD.height) * 100}%`,
    width: `${(c.w / BOARD.width) * 100}%`,
    height: `${(c.h / BOARD.height) * 100}%`,
    transform: c.rotate ? `rotate(${c.rotate}deg)` : undefined,
  };
};

const lanternStyle: CSSProperties = {
  left: `${(BOARD_PARTS.lantern.x / BOARD.width) * 100}%`,
  top: `${(BOARD_PARTS.lantern.y / BOARD.height) * 100}%`,
  width: `${((BOARD_PARTS.lantern.r * 4.8) / BOARD.width) * 100}%`,
};

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
  onClose(): void;
}

/**
 * The notice board up close: hours, what's on, a map drawn in as the board
 * opens, a sheet of sketches and the note that says what this site is. A
 * modal dialog: focus stays inside, Esc and the close button go back to the
 * square. The board image lands exactly where the scene's camera brought it
 * (its place is set in CSS, from the server's first paint), so the hand-over
 * from the canvas cannot be seen.
 */
export function VisitPanel({ copy, t, arrived, content, fade, onClose }: VisitPanelProps) {
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

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="visit-heading"
      className="visit-panel fixed inset-0 z-20"
      data-arrived={arrived ? "" : undefined}
      data-fade={fade ? "" : undefined}
      onKeyDown={onKeyDown}
    >
      <h2 id="visit-heading" className="sr-only">
        {t.board}
      </h2>

      {content && (
        <div className="notice-board absolute">
          <picture>
            <source type="image/avif" srcSet={OPENED_BOARD_AVIF} />
            <img src={OPENED_BOARD} alt="" className="absolute inset-0 size-full" draggable={false} />
          </picture>
          <span aria-hidden="true" className="notice-lantern absolute" style={lanternStyle} />

          <section className="notice-card notice-cream absolute" style={cardStyle("hours")}>
            <h3 className="notice-title">{copy.hours.title}</h3>
            {copy.hours.lines.map((line) => (
              <p key={line} className="notice-hand">
                {keepTogether(line)}
              </p>
            ))}
          </section>

          <section className="notice-card notice-cream absolute" style={cardStyle("whatsOn")}>
            <h3 className="notice-title">{copy.whatsOn.title}</h3>
            <ul className="notice-list">
              {copy.whatsOn.items.map((item) => (
                <li key={item} className="notice-hand">
                  <svg aria-hidden="true" viewBox="0 0 20 14" className="notice-tick">
                    <path pathLength={1} className="sketch-line" d="M2 8 Q5 10 7 12 Q11 5 18 2" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <div className="notice-card absolute" style={cardStyle("map")} data-moon-slot={copy.moon.hiddenBehind === "map" ? copy.moon.id : undefined}>
            <NoticeMap labels={copy.map} title={t.map} />
          </div>

          <div className="notice-card absolute" style={cardStyle("drawings")}>
            <PumpkinSketch title={t.drawings} />
          </div>

          <section className="notice-card notice-kraft absolute" style={cardStyle("note")}>
            <p>{copy.note.text}</p>
            <a href={copy.note.href} className="notice-link" rel="noopener" target="_blank">
              {copy.note.link}
            </a>
          </section>
        </div>
      )}

      <button ref={close} type="button" className="visit-close" onClick={onClose}>
        <Icon name="close" />
        <span>{t.close}</span>
      </button>
    </div>
  );
}
