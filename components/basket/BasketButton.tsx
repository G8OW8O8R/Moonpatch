"use client";

import { useEffect, useRef, useState } from "react";
import { playCue } from "@/components/sound/sound-bus";
import { Icon } from "@/components/ui/Icon";
import { itemCount } from "@/lib/basket";
import { BASKET_STORAGE_KEY, rehydrateBasket, useBasket } from "@/lib/basket-store";
import { FLIGHT_EVENT, type FlightDetail, flightPath } from "@/lib/flight";
import type { Locale } from "@/lib/i18n";
import { type Messages, format } from "@/lib/messages";
import { cubicBezier, duration, ease } from "@/lib/motion-tokens";
import { productById } from "@/lib/products";
import { type PassOrder } from "@/lib/farm-pass";
import { BasketDialog } from "./BasketDialog";
import { FarmPass } from "./FarmPass";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The wheelbarrow in the header: how many things are in it, a button that
 * opens it, and the place the products fly into (it tips a little as each
 * one lands). Reads the saved wheelbarrow back once the page is up.
 */
export function BasketButton({ lang, t, tb }: { lang: Locale; t: Messages["header"]; tb: Messages["basket"] }) {
  const count = useBasket((state) => itemCount(state.lines));
  const [open, setOpen] = useState(false);
  /** The pass handed over at checkout, while it is on the table. */
  const [pass, setPass] = useState<PassOrder | null>(null);
  const [said, setSaid] = useState("");
  const barrow = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    void rehydrateBasket();
    // Another tab changed the wheelbarrow: follow it.
    const onStorage = (event: StorageEvent) => {
      if (event.key === BASKET_STORAGE_KEY) void rehydrateBasket();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const tip = () =>
      barrow.current?.animate(
        [{ transform: "none" }, { transform: "rotate(-14deg)", offset: 0.35 }, { transform: "rotate(5deg)", offset: 0.7 }, { transform: "none" }],
        { duration: duration.panel * 1000 + 120, easing: cubicBezier(ease.out) },
      );

    const onFlight = (event: Event) => {
      const { id, from } = (event as CustomEvent<FlightDetail>).detail;
      const product = productById(id);
      if (!product) return;
      setSaid(format(product.fulfillment === "visit" ? tb.kept : tb.added, { name: product.name[lang] }));
      const target = barrow.current?.getBoundingClientRect();
      if (!target || reduced()) return playCue("basket-add");

      const photo = document.createElement("img");
      photo.src = `${product.image}.webp`;
      photo.alt = "";
      photo.className = "flight-photo";
      Object.assign(photo.style, { left: `${from.x}px`, top: `${from.y}px`, width: `${from.width}px`, height: `${from.height}px` });
      document.body.append(photo);

      const steps = flightPath(from, { x: target.x, y: target.y, width: target.width, height: target.height });
      const flight = photo.animate(
        steps.map((s) => ({ transform: `translate3d(${s.x}px, ${s.y}px, 0) scale(${s.scale}) rotate(${s.rotate}deg)`, opacity: s.opacity })),
        { duration: 720, easing: cubicBezier(ease.inOut), fill: "forwards" },
      );
      flight.finished.then(
        () => {
          photo.remove();
          tip();
          playCue("basket-add");
        },
        () => photo.remove(),
      );
    };
    window.addEventListener(FLIGHT_EVENT, onFlight);
    return () => window.removeEventListener(FLIGHT_EVENT, onFlight);
  }, [lang, tb]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open || !!pass}
        aria-label={format(t.basket, { count })}
        className="basket-button flex items-center gap-1.5"
      >
        <span ref={barrow} className="basket-barrow inline-flex">
          <Icon name="wheelbarrow" className="drop-shadow-hug" />
        </span>
        <span aria-hidden="true">{count}</span>
      </button>
      <span role="status" className="sr-only">
        {said}
      </span>
      {open && (
        <BasketDialog
          lang={lang}
          t={tb}
          onClose={() => setOpen(false)}
          onPass={(order) => {
            setOpen(false);
            setPass(order);
          }}
        />
      )}
      {pass && <FarmPass lang={lang} t={tb} order={pass} onClose={() => setPass(null)} />}
    </>
  );
}
