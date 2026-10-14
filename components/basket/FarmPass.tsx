"use client";

import { type CSSProperties, type KeyboardEvent, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { subscribeLenis } from "@/components/ui/lenis-channel";
import { useFocusTrap } from "@/components/ui/useFocusTrap";
import { useScrollArea } from "@/components/ui/useScrollArea";
import { useBasket } from "@/lib/basket-store";
import { FRAME_GAP, type Orientation, type PassOrder, type Rect, framePath, outlinePolygon, passDate, passLayout, passNumber } from "@/lib/farm-pass";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/messages";
import { cubicBezier, duration, ease } from "@/lib/motion-tokens";
import { productById } from "@/lib/products";
import { passPicture } from "./pass-picture";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Upright phones get the ticket standing tall, its stub at the foot. */
const TALL = "(max-width: 699px)";
/** Room kept around the ticket: the header above it, the words and links under it. */
const ROOM = { x: 32, top: 96, bottom: 150 } as const;
/** How the ticket lies once it has settled, degrees. */
const TILT: Record<Orientation, number> = { wide: -2.5, tall: -1.2 };

const inset = (r: Rect, by: number): Rect => ({ x: r.x + by, y: r.y + by, width: r.width - 2 * by, height: r.height - 2 * by });

/** The double frame, drawn in the ticket's px; `box` is the piece it sits on. */
function Frames({ frame, box, children }: { frame: Rect; box: Rect; children?: ReactNode }) {
  return (
    <svg aria-hidden="true" className="pass-frames" viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`} width={box.width} height={box.height}>
      <path d={framePath(frame, 14)} strokeWidth={2} />
      <path d={framePath(inset(frame, FRAME_GAP), 10)} strokeWidth={1} />
      {children}
    </svg>
  );
}

/**
 * The Farm Pass, handed over at checkout when something waits at the farm:
 * a cream ticket with torn edges, a double frame and a perforated stub with
 * the moon stamp, listing the day of the visit and what will be ready. It
 * slides up like paper pushed across a table and settles a little askew.
 * "Save ticket" tears the stub along the perforation, saves the ticket as a
 * picture and empties the wheelbarrow. A demo shop: nothing was charged.
 */
export function FarmPass({ lang, t, order, onClose }: { lang: Locale; t: Messages["basket"]; order: PassOrder; onClose(): void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const motion = useRef<HTMLDivElement>(null);
  const ticket = useRef<HTMLElement>(null);
  const stubRef = useRef<HTMLDivElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const closing = useRef(false);
  const torn = useRef(false);
  const [orientation, setOrientation] = useState<Orientation>(() => (window.matchMedia(TALL).matches ? "tall" : "wide"));
  const [scale, setScale] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const items = useMemo(
    () => order.visit.flatMap((line) => {
      const product = productById(line.id);
      return product ? [{ ...line, product }] : [];
    }),
    [order.visit],
  );
  const layout = useMemo(() => passLayout(orientation, items.length, order.day), [orientation, items.length, order.day]);
  const [day, hours] = passDate(order.day, lang, t.hours);
  const wide = orientation === "wide";
  const number = passNumber(order);

  // The ticket is scaled to fit; on a window too short even for that, it scrolls above the links.
  const scrollArea = useScrollArea("pass-title");

  useFocusTrap(dialog, { initial: saveButton, restore: () => document.querySelector<HTMLElement>(".basket-button") });

  // Fits the window; turns upright on a narrow one.
  useEffect(() => {
    const query = window.matchMedia(TALL);
    const fit = () => {
      const next: Orientation = query.matches ? "tall" : "wide";
      setOrientation(next);
      const size = passLayout(next, items.length, order.day);
      setScale(Math.min(1, (window.innerWidth - ROOM.x) / size.width, (window.innerHeight - ROOM.top - ROOM.bottom) / size.height));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [items.length, order.day]);

  // The page stands still under the pass.
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

  /** Paper pushed up across the table: in from below, turned, a small over-swing, then at rest askew. */
  const move = useCallback(
    (backwards: boolean) => {
      const el = motion.current;
      if (!el) return null;
      const rest = `rotate(${TILT[orientation]}deg)`;
      if (reduced()) {
        el.style.transform = rest;
        return el.animate([{ opacity: backwards ? 1 : 0 }, { opacity: backwards ? 0 : 1 }], { duration: duration.reduced * 1000, fill: "both" });
      }
      const frames: Keyframe[] = [
        { transform: "translate3d(0, 56px, 0) rotate(6deg)", opacity: 0 },
        { opacity: 1, offset: 0.25 },
        { transform: `translate3d(0, -4px, 0) rotate(${TILT[orientation] - 1.4}deg)`, offset: 0.7 },
        { transform: rest, opacity: 1 },
      ];
      return el.animate(backwards ? [frames[0]!, frames[3]!].reverse() : frames, {
        duration: (backwards ? duration.ui : duration.scene) * 1000,
        easing: cubicBezier(backwards ? ease.inOut : ease.settle),
        fill: "both",
      });
    },
    [orientation],
  );

  useLayoutEffect(() => {
    const opening = move(false);
    // Once down, the ticket keeps its rest as a plain style, so a turn of the phone can lay it again.
    opening?.finished.then(
      () => {
        opening.commitStyles();
        opening.cancel();
      },
      () => undefined,
    );
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (motion.current) motion.current.style.transform = `rotate(${TILT[orientation]}deg)`;
  }, [orientation]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const animation = move(true);
    if (!animation) return onClose();
    animation.finished.then(onClose, onClose);
  }, [move, onClose]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    close();
  };

  /** Tears the stub along the perforation (once), saves the picture, empties the wheelbarrow. */
  const save = async () => {
    const el = ticket.current;
    if (!el || saving) return;
    setSaving(true);
    try {
      const blob = await passPicture(el, layout);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${t.passFile}-${order.day}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if (!torn.current && !reduced()) {
        torn.current = true;
        stubRef.current?.animate(
          [{ transform: "none" }, { transform: wide ? "translate3d(22px, 14px, 0) rotate(7deg)" : "translate3d(10px, 20px, 0) rotate(-5deg)" }],
          { duration: duration.panel * 1000 + 160, easing: cubicBezier(ease.settle), fill: "forwards" },
        );
      }
      useBasket.getState().clear();
      setSaved(true);
    } catch {
      // Not saved (a blocked download, a picture that would not load): the wheelbarrow keeps its things.
    } finally {
      setSaving(false);
    }
  };

  const stubBox: Rect = wide
    ? { x: layout.cut, y: 0, width: layout.width - layout.cut, height: layout.height }
    : { x: 0, y: layout.cut, width: layout.width, height: layout.height - layout.cut };
  const mainBox: Rect = wide ? { x: 0, y: 0, width: layout.cut, height: layout.height } : { x: 0, y: 0, width: layout.width, height: layout.cut };
  const { cx, cy, r } = layout.arc;
  const at = (top: number): CSSProperties => ({ top });

  return createPortal(
    <div className="pass-layer" onKeyDown={onKeyDown}>
      <div className="pass-scrim" aria-hidden="true" onClick={close} />
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="pass-title" aria-describedby="pass-note" tabIndex={-1} className="pass">
        <div ref={scrollArea} className="pass-body scroll-area" data-lenis-prevent>
          <div className="pass-fit" style={{ width: layout.width * scale, height: layout.height * scale }}>
            <div ref={motion} className="pass-motion">
              <article
                ref={ticket}
                className="pass-ticket"
                data-orientation={orientation}
                aria-labelledby="pass-title"
                style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}
              >
                <div
                  data-piece="main"
                  className="pass-piece"
                  style={{ left: mainBox.x, top: mainBox.y, width: mainBox.width, height: mainBox.height, clipPath: outlinePolygon(layout.main, mainBox.x, mainBox.y) }}
                >
                  <Frames frame={layout.mainFrame} box={mainBox}>
                    <path id="pass-arc" d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="none" />
                    <text data-arc="" className="pass-arc">
                      <textPath href="#pass-arc" startOffset="50%" textAnchor="middle">
                        {t.passTitle.toLocaleUpperCase(lang)}
                      </textPath>
                    </text>
                  </Frames>
                  <h2 id="pass-title" className="sr-only">
                    {t.passTitle}, Moonpatch Farm
                  </h2>
                  {/* eslint-disable-next-line @next/next/no-img-element -- drawn again onto the saved picture */}
                  <img
                    src="/brand/wordmark.svg"
                    alt=""
                    className="pass-wordmark"
                    style={{ left: layout.wordmark.x, top: layout.wordmark.y, width: layout.wordmark.width, height: layout.wordmark.height }}
                    draggable={false}
                  />
                  <p className="pass-date font-display">
                    {(wide ? [`${day} · ${hours}`] : [day, hours]).map((words, i) => (
                      <span key={i} className="pass-line" style={at(layout.date[i]!)}>
                        <span data-ink="">{words}</span>
                      </span>
                    ))}
                  </p>
                  <p className="pass-line pass-waiting font-display" style={at(layout.waiting)}>
                    <span data-ink="">{t.passWaiting}</span>
                  </p>
                  <ul className="pass-list font-display" style={at(layout.list.top)}>
                    {items.map((item) => (
                      <li key={item.id} style={{ height: layout.list.step }}>
                        <span data-ink="" className="pass-qty">
                          {item.qty} ×
                        </span>{" "}
                        <span data-ink="">{item.product.name[lang]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div
                  ref={stubRef}
                  data-piece="stub"
                  className="pass-piece pass-stub"
                  style={{
                    left: stubBox.x,
                    top: stubBox.y,
                    width: stubBox.width,
                    height: stubBox.height,
                    clipPath: outlinePolygon(layout.stub, stubBox.x, stubBox.y),
                    backgroundPosition: `0 0, ${-stubBox.x}px ${-stubBox.y}px`,
                  }}
                >
                  <Frames frame={layout.stubFrame} box={stubBox} />
                  <p className="pass-serial" style={{ right: stubBox.x + stubBox.width - layout.serial.right, top: layout.serial.top - stubBox.y }}>
                    <span data-ink="">Nº {number}</span>
                  </p>
                  <p
                    data-admit=""
                    className="pass-admit font-display"
                    style={{ left: layout.admit.x - stubBox.x, top: layout.admit.y - stubBox.y, transform: `translate(-50%, -50%) rotate(${layout.admit.rotate}deg)` }}
                  >
                    {t.passAdmit.toLocaleUpperCase(lang)}
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element -- drawn again onto the saved picture */}
                  <img
                    data-stamp=""
                    src="/img/textures/stamp-moon.webp"
                    alt={t.passStamp}
                    className="pass-stamp"
                    style={{
                      left: layout.stamp.x - stubBox.x - layout.stamp.size / 2,
                      top: layout.stamp.y - stubBox.y - layout.stamp.size / 2,
                      width: layout.stamp.size,
                      transform: `rotate(${layout.stamp.rotate}deg)`,
                    }}
                    draggable={false}
                  />
                </div>
              </article>
            </div>
          </div>
        </div>
        <div className="pass-foot">
          <p id="pass-note">
            {t.passNote}
            {order.shipped && <> {t.shipped}</>}
          </p>
          <div className="pass-links">
            <button ref={saveButton} type="button" className="pass-link" onClick={save} aria-busy={saving}>
              <Icon name="arrow-left" className="pass-link-arrow pass-link-down" />
              <span>{t.passSave}</span>
            </button>
            <button type="button" className="pass-link" onClick={close}>
              <span>{t.back}</span>
              <Icon name="arrow-left" className="pass-link-arrow pass-link-on" />
            </button>
          </div>
          <p role="status" className="sr-only">
            {saved ? t.passSaved : ""}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
