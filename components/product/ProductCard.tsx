"use client";

import { type CSSProperties, type KeyboardEvent, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useFocusTrap } from "@/components/ui/useFocusTrap";
import { useScrollArea } from "@/components/ui/useScrollArea";
import { useBasket } from "@/lib/basket-store";
import { FLIGHT_EVENT, type FlightDetail } from "@/lib/flight";
import { growFrom } from "@/lib/hotspots";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/messages";
import { cubicBezier, duration, ease } from "@/lib/motion-tokens";
import { type Product, formatPrice } from "@/lib/products";
import { tornPolygon } from "@/lib/torn-edge";

export interface ProductCardProps {
  product: Product;
  lang: Locale;
  t: Messages["product"];
  /** The seed it opens out of, CSS px on the screen. */
  from: { x: number; y: number };
  /** Its seed, to take the focus back on closing. */
  seed: () => HTMLElement | null;
  onClose(): void;
}

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A product's card, opened out of its seed in the room: a recipe card of
 * cream paper with a torn edge, or a kraft tag hanging on twine from the top
 * of the screen. A dialog: the focus stays inside it until it closes (Esc,
 * the ×, or a click back in the room), then goes back to the seed.
 */
export function ProductCard({ product, lang, t, from, seed, onClose }: ProductCardProps) {
  const sheet = useRef<HTMLDivElement>(null);
  const motion = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const [done, setDone] = useState(false);
  const recipe = product.card === "recipe";
  const titleId = `card-${product.id}-title`;
  // A description longer than the card scrolls, and then the keyboard can reach and scroll it.
  const scrollArea = useScrollArea(titleId);
  const edge = useMemo(() => (recipe ? tornPolygon(product.id, { depth: 3.5, points: 56 }) : undefined), [product.id, recipe]);

  useFocusTrap(sheet, { restore: seed });

  /** The card out of its seed, or back into it. */
  const grow = useCallback(
    (backwards: boolean) => {
      const el = motion.current;
      if (!el) return null;
      if (reduced()) return el.animate([{ opacity: backwards ? 1 : 0 }, { opacity: backwards ? 0 : 1 }], { duration: duration.reduced * 1000, fill: "both" });
      const rect = el.getBoundingClientRect();
      const start = growFrom(from, rect);
      const tilt = recipe ? -4 : 6;
      const out = `translate3d(${start.x}px, ${start.y}px, 0) scale(${start.scale}) rotate(${tilt}deg)`;
      const frames: Keyframe[] = [
        { transform: out, opacity: 0 },
        { opacity: 1, offset: 0.25 },
        { transform: "none", opacity: 1 },
      ];
      return el.animate(backwards ? [...frames].reverse() : frames, {
        duration: (backwards ? duration.ui : duration.panel + 0.12) * 1000,
        easing: cubicBezier(backwards ? ease.inOut : ease.settle),
        fill: "both",
      });
    },
    [from, recipe],
  );

  useLayoutEffect(() => {
    grow(false);
  }, [grow]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const animation = grow(true);
    if (!animation) return onClose();
    animation.finished.then(onClose, onClose);
  }, [grow, onClose]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    // The room leaves on Esc too; here it only closes the card.
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    close();
  };

  /** Into the wheelbarrow; the photo flies up to it from where it sits on the card. */
  const act = () => {
    useBasket.getState().add(product.id);
    const box = sheet.current?.querySelector(".card-photo img")?.getBoundingClientRect();
    if (box) {
      const detail: FlightDetail = { id: product.id, from: { x: box.x, y: box.y, width: box.width, height: box.height } };
      window.dispatchEvent(new CustomEvent(FLIGHT_EVENT, { detail }));
    }
    setDone(true);
  };

  const name = product.name[lang];
  const price = formatPrice(product, lang);
  const action = product.fulfillment === "visit" ? t.visit : t.ship;
  const doneText = product.fulfillment === "visit" ? t.kept : t.shipped;

  const photo = (
    <picture className="card-photo">
      <source type="image/avif" srcSet={`${product.image}.avif`} />
      <img src={`${product.image}.webp`} alt={name} width={1280} height={1600} decoding="async" draggable={false} />
    </picture>
  );

  const foot = (
    <div className="card-foot">
      <p className={recipe ? "card-price" : "card-price card-stamp"}>
        <span className="sr-only">{t.price}: </span>
        {price}
      </p>
      <button type="button" className="card-action" onClick={act} aria-live="polite" data-done={done ? "" : undefined}>
        {done ? doneText : action}
      </button>
    </div>
  );

  return (
    <div className="card-layer absolute inset-0" onKeyDown={onKeyDown}>
      <div className="card-scrim absolute inset-0" aria-hidden="true" onClick={close} />
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={recipe ? "card card-recipe" : "card card-tag"}
        data-fulfillment={product.fulfillment}
      >
        <div ref={motion} className="card-motion">
          {recipe ? (
            <div className="recipe-shadow">
              <div className="recipe-paper" style={{ clipPath: edge } as CSSProperties}>
                <button type="button" className="card-close" onClick={close} aria-label={t.close}>
                  <Icon name="close" />
                </button>
                {photo}
                <h2 id={titleId} className="card-title font-display">
                  {name}
                </h2>
                <div ref={scrollArea} className="card-scroll scroll-area" data-lenis-prevent>
                  <p className="card-description">{product.description[lang]}</p>
                  {product.ingredients && (
                    <div className="card-ingredients">
                      <h3>{t.ingredients}</h3>
                      <p>{product.ingredients[lang]}</p>
                    </div>
                  )}
                </div>
                {foot}
              </div>
            </div>
          ) : (
            <div className="tag-swing">
              <div className="tag-shadow">
                <div className="tag-paper">
                  <span aria-hidden="true" className="tag-eyelet" />
                  <button type="button" className="card-close" onClick={close} aria-label={t.close}>
                    <Icon name="close" />
                  </button>
                  {photo}
                  <h2 id={titleId} className="card-title font-display">
                    {name}
                  </h2>
                  <div ref={scrollArea} className="card-scroll scroll-area" data-lenis-prevent>
                    <p className="card-description">{product.description[lang]}</p>
                  </div>
                  {foot}
                </div>
              </div>
              <span aria-hidden="true" className="tag-twine" />
              <span aria-hidden="true" className="tag-grommet" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
