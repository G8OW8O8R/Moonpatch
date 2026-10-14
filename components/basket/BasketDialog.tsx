"use client";

import { type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { subscribeLenis } from "@/components/ui/lenis-channel";
import { useFocusTrap } from "@/components/ui/useFocusTrap";
import { type PricedLine, formatDay, formatMoney, sections, visitDays } from "@/lib/basket";
import { useBasket } from "@/lib/basket-store";
import type { Locale } from "@/lib/i18n";
import { type Messages, format } from "@/lib/messages";
import { cubicBezier, duration, ease } from "@/lib/motion-tokens";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = () => window.matchMedia("(max-width: 639px)").matches;

/** A line drawn by hand across the paper between two things. */
function Rule() {
  return (
    <svg aria-hidden="true" className="basket-rule" viewBox="0 0 400 6" preserveAspectRatio="none">
      <path d="M1 3.4C48 2.2 92 4.1 151 3.1S262 1.9 318 3.3 372 3.9 399 2.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Weekends of the season, Friday to Sunday, as rows. */
function byWeekend(days: readonly string[]): string[][] {
  const rows: string[][] = [];
  for (const day of days) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    const last = rows.at(-1);
    if (!last || weekday === 5) rows.push([day]);
    else last.push(day);
  }
  return rows;
}

function Line({ line, lang, t, ruled }: { line: PricedLine; lang: Locale; t: Messages["basket"]; ruled: boolean }) {
  const setQty = useBasket((state) => state.setQty);
  const name = line.product.name[lang];
  return (
    <li className="basket-line">
      {ruled && <Rule />}
      <picture className="basket-thumb">
        <source type="image/avif" srcSet={`${line.product.image}.avif`} />
        <img src={`${line.product.image}.webp`} alt="" width={1280} height={1600} loading="lazy" decoding="async" draggable={false} />
      </picture>
      <p className="basket-name font-display">{name}</p>
      <div className="basket-qty" role="group" aria-label={format(t.qty, { qty: line.qty, name })}>
        <button type="button" onClick={() => setQty(line.id, line.qty - 1)} aria-label={format(t.less, { name })}>
          <Icon name="minus" />
        </button>
        <span aria-hidden="true">{line.qty}</span>
        <button type="button" onClick={() => setQty(line.id, line.qty + 1)} aria-label={format(t.more, { name })} disabled={line.qty >= 12}>
          <Icon name="plus" />
        </button>
      </div>
      <p className="basket-amount">{formatMoney(line.cents, lang)}</p>
    </li>
  );
}

/**
 * The wheelbarrow: a sheet of cream paper screwed to a weathered board on the
 * right (on a phone, a sheet up from the bottom). What is shipped home and
 * what waits at the farm are listed apart; the latter asks for the day of the
 * visit. A demo shop: “Checkout” only says what would happen, nothing is paid.
 */
export function BasketDialog({ lang, t, onClose }: { lang: Locale; t: Messages["basket"]; onClose(): void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const motion = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const daysRef = useRef<HTMLFieldSetElement>(null);
  const closing = useRef(false);
  const lines = useBasket((state) => state.lines);
  const visitDay = useBasket((state) => state.visitDay);
  const pickDay = useBasket((state) => state.pickDay);
  const [askDay, setAskDay] = useState(false);
  const [done, setDone] = useState(false);

  const split = useMemo(() => sections(lines, lang), [lines, lang]);
  const days = useMemo(() => visitDays(new Date()), []);
  const both = split.ship.lines.length > 0 && split.visit.lines.length > 0;
  const empty = lines.length === 0;

  // Opened only on a click, so never rendered on the server: the portal has its body.
  useFocusTrap(dialog, { initial: closeButton, restore: () => document.querySelector<HTMLElement>(".basket-button") });

  // The page stands still under the wheelbarrow.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.basketOpen = "";
    let stopped: { start(): void } | null = null;
    const unsubscribe = subscribeLenis((lenis) => {
      if (lenis && !lenis.isStopped) {
        lenis.stop();
        stopped = lenis;
      }
    });
    return () => {
      unsubscribe();
      delete root.dataset.basketOpen;
      stopped?.start();
    };
  }, []);

  const move = useCallback((backwards: boolean) => {
    const el = motion.current;
    if (!el) return null;
    if (reduced()) return el.animate([{ opacity: backwards ? 1 : 0 }, { opacity: backwards ? 0 : 1 }], { duration: duration.reduced * 1000, fill: "both" });
    const away = narrow() ? "translate3d(0, 100%, 0)" : "translate3d(48px, 0, 0) rotate(1.5deg)";
    const frames: Keyframe[] = [{ transform: away, opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: "none", opacity: 1 }];
    return el.animate(backwards ? [...frames].reverse() : frames, {
      duration: (backwards ? duration.ui : duration.panel) * 1000,
      easing: cubicBezier(backwards ? ease.inOut : ease.out),
      fill: "both",
    });
  }, []);

  useLayoutEffect(() => {
    move(false);
  }, [move]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const animation = move(true);
    if (!animation) return onClose();
    animation.finished.then(onClose, onClose);
  }, [move, onClose]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    // Only the wheelbarrow closes; the room or card under it stays.
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    close();
  };

  const checkout = () => {
    if (split.visit.lines.length > 0 && !visitDay) {
      setAskDay(true);
      daysRef.current?.querySelector<HTMLInputElement>("input")?.focus();
      return;
    }
    setDone(true);
    requestAnimationFrame(() => closeButton.current?.focus());
  };

  const section = (kind: "ship" | "visit") => {
    const part = split[kind];
    if (!part.lines.length) return null;
    const headingId = `basket-${kind}`;
    return (
      <section aria-labelledby={headingId} className="basket-section">
        <h3 id={headingId} className="basket-section-title font-display">
          {kind === "ship" ? t.ship : t.visit}
        </h3>
        <ul>
          {part.lines.map((line, i) => (
            <Line key={line.id} line={line} lang={lang} t={t} ruled={i > 0} />
          ))}
        </ul>
        {kind === "visit" && (
          <fieldset ref={daysRef} className="basket-days" aria-describedby={askDay && !visitDay ? "basket-day-hint" : undefined}>
            <legend className="basket-days-legend">
              <Icon name="calendar" />
              {t.day}
            </legend>
            {byWeekend(days).map((weekend) => (
              <div key={weekend[0]} className="basket-weekend">
                {weekend.map((day) => (
                  <label key={day} className="basket-day">
                    <input type="radio" name="visit-day" value={day} checked={visitDay === day} onChange={() => pickDay(day)} className="sr-only" />
                    <span>{formatDay(day, lang)}</span>
                  </label>
                ))}
              </div>
            ))}
            {askDay && !visitDay && (
              <p id="basket-day-hint" className="basket-day-hint">
                {t.dayHint}
              </p>
            )}
          </fieldset>
        )}
        {both && (
          <p className="basket-subtotal">
            <span>{t.subtotal}</span>
            <span>{formatMoney(part.cents, lang)}</span>
          </p>
        )}
      </section>
    );
  };

  return createPortal(
    <div className="basket-layer" onKeyDown={onKeyDown}>
      <div className="basket-scrim" aria-hidden="true" onClick={close} />
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="basket-title" tabIndex={-1} className="basket">
        <div ref={motion} className="basket-motion">
          <div className="basket-board">
            <div className="basket-paper">
              <span aria-hidden="true" className="basket-screw" data-at="tl" />
              <span aria-hidden="true" className="basket-screw" data-at="tr" />
              <span aria-hidden="true" className="basket-screw" data-at="bl" />
              <span aria-hidden="true" className="basket-screw" data-at="br" />
              <button ref={closeButton} type="button" className="basket-close" onClick={close} aria-label={t.close}>
                <Icon name="close" />
              </button>
              <h2 id="basket-title" className="basket-title font-display">
                {done ? t.doneTitle : t.title}
                <Icon name="wheelbarrow" className="basket-title-barrow" />
              </h2>

              {done ? (
                <div className="basket-done" role="status">
                  {visitDay && split.visit.lines.length > 0 && <p className="basket-done-day font-display">{format(t.visitOn, { day: formatDay(visitDay, lang, "long"), hours: t.hours })}</p>}
                  {split.ship.lines.length > 0 && <p>{t.shipped}</p>}
                  <p>{t.charged}</p>
                  <button type="button" className="basket-link" onClick={close}>
                    {t.back}
                  </button>
                </div>
              ) : empty ? (
                <p className="basket-empty">{t.empty}</p>
              ) : (
                <>
                  {section("ship")}
                  {both && <Rule />}
                  {section("visit")}
                  <Rule />
                  <p className="basket-total">
                    <span>{t.total}</span>
                    <span>{formatMoney(split.cents, lang)}</span>
                  </p>
                  <div className="basket-foot">
                    <p className="basket-demo">{t.demo}</p>
                    <button type="button" className="card-action" onClick={checkout}>
                      {t.checkout}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
