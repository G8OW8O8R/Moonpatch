"use client";

import Link from "next/link";
import { type Ref, useImperativeHandle, useRef } from "react";
import type { SquareState } from "@/components/gate/renderer/SquareRenderer";
import { Icon } from "@/components/ui/Icon";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/messages";
import { PLATE, type Size, coverSizes } from "@/lib/plate-box";
import { placePath } from "@/lib/routes";
import { ARMS, type ArmId, PROP_TINT, type PropQuad, propsOnScreen } from "@/lib/square-props";
import { DUSK } from "@/lib/square-rig";
import { LABEL_SIZE } from "./labels";

export interface SquareOverlayHandle {
  /** Places everything for this frame. `onCanvas`: the WebGL scene draws the square, panning on portrait screens. */
  update(state: SquareState, css: Size, onCanvas: boolean): void;
}

export interface SquareOverlayProps {
  lang: Locale;
  t: Messages["square"];
  /**
   * This layer paints the square itself in plain HTML (no WebGL, reduced
   * motion). Otherwise it only holds the buttons over what the canvas paints,
   * and loads no images at all.
   */
  paints: boolean;
  boardOpen: boolean;
  onPointArm(arm: ArmId, pointed: boolean): void;
  onOpenBoard(): void;
  ref?: Ref<SquareOverlayHandle>;
}

const plateSet = (name: string, format: "avif" | "webp") =>
  `/img/plates/${name}-1600.${format} 1600w, /img/plates/${name}-2576.${format} 2576w`;

/** `soft`: seen only out of focus behind the open board, so the small file will do. */
function Plate({ name, className, soft = false }: { name: "square-golden" | "square-dusk"; className: string; soft?: boolean }) {
  const sizes = soft ? "50vw" : coverSizes(PLATE);
  return (
    <picture>
      <source type="image/avif" srcSet={plateSet(name, "avif")} sizes={sizes} />
      <img
        src={`/img/plates/${name}-1600.webp`}
        srcSet={plateSet(name, "webp")}
        sizes={sizes}
        alt=""
        width={PLATE.width}
        height={PLATE.height}
        decoding="async"
        draggable={false}
        className={`absolute inset-0 size-full max-w-none select-none ${className}`}
      />
    </picture>
  );
}

const place = (el: HTMLElement | null, rect: { x: number; y: number; w: number; h: number }, turn = 0, pivot?: { x: number; y: number }) => {
  if (!el) return;
  el.style.width = `${rect.w}px`;
  el.style.height = `${rect.h}px`;
  if (pivot) el.style.transformOrigin = `${pivot.x - rect.x}px ${pivot.y - rect.y}px`;
  el.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)${turn ? ` rotate(${turn}rad)` : ""}`;
};

/**
 * Everything on the square that is not the photograph: the signpost (links
 * to the three buildings), the notice board (opens the Visit panel), the
 * tagline and the scroll hint. Over WebGL these are invisible hit areas laid
 * exactly over the painted props; without it they carry the props
 * themselves, over plain plates.
 */
export function SquareOverlay({ lang, t, paints, boardOpen, onPointArm, onOpenBoard, ref }: SquareOverlayProps) {
  const root = useRef<HTMLDivElement>(null);
  const props = useRef<HTMLDivElement>(null);
  const plates = useRef<HTMLDivElement>(null);
  const post = useRef<HTMLImageElement>(null);
  const board = useRef<HTMLButtonElement>(null);
  const arms = useRef<Partial<Record<ArmId, HTMLAnchorElement | null>>>({});
  const shadows = useRef<HTMLDivElement>(null);
  const flags = useRef({ shown: false, dusk: false, tagline: false, door: false });

  useImperativeHandle(
    ref,
    () => ({
      update(state, css, onCanvas) {
        const { props: onScreen, shadows: contact, plate } = propsOnScreen(css, state, { pan: onCanvas });
        for (const arm of ARMS) {
          const id = `arm-${arm.id}` as PropQuad["id"];
          place(arms.current[arm.id] ?? null, onScreen[id].rect, state.arms[arm.id], onScreen[id].pivot);
        }
        place(board.current, onScreen.board.rect);
        place(post.current, onScreen.post.rect);
        if (plates.current) {
          plates.current.style.transform = `translate3d(${plate.origin.x}px, ${plate.origin.y}px, 0)`;
          plates.current.style.width = `${PLATE.width * plate.scale}px`;
          plates.current.style.height = `${PLATE.height * plate.scale}px`;
        }
        if (shadows.current) {
          [...shadows.current.children].forEach((child, i) => {
            const s = contact[i];
            if (!s) return;
            place(child as HTMLElement, { x: s.x - s.rx, y: s.y - s.ry, w: s.rx * 2, h: s.ry * 2 });
            (child as HTMLElement).style.opacity = String(s.strength * (1 - state.visit));
          });
        }

        // Discrete moments only touch the DOM when they change.
        const next = {
          shown: state.props > 0.5 || state.visit > 0,
          dusk: state.dusk >= DUSK.header,
          tagline: state.dusk >= DUSK.tagline && state.visit === 0,
          door: state.wander >= 0.85,
        };
        const el = root.current;
        if (!el) return;
        if (next.shown !== flags.current.shown && props.current) props.current.inert = !next.shown;
        el.style.setProperty("--props", String(onCanvas ? 1 : state.props));
        for (const key of Object.keys(next) as (keyof typeof next)[]) {
          if (next[key] === flags.current[key]) continue;
          if (next[key]) el.dataset[key] = "";
          else delete el.dataset[key];
        }
        flags.current = next;
      },
    }),
    [],
  );

  return (
    <div ref={root} className="square-overlay absolute inset-0" data-webgl={paints ? undefined : ""}>
      {paints && (
        <svg aria-hidden="true" className="absolute size-0">
          {/* The props in the evening light, as the scene tints them. */}
          <filter id="props-dusk" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={`${PROP_TINT.dusk[0]} 0 0 0 0  0 ${PROP_TINT.dusk[1]} 0 0 0  0 0 ${PROP_TINT.dusk[2]} 0 0  0 0 0 1 0`} />
          </filter>
        </svg>
      )}
      {paints && (
        <div ref={plates} aria-hidden="true" className="square-plates absolute top-0 left-0 overflow-hidden">
          {/* Behind the open board only dusk shows, and only out of focus. */}
          {!boardOpen && <Plate name="square-golden" className="" />}
          <Plate name="square-dusk" className="square-dusk" soft={boardOpen} />
        </div>
      )}

      <div ref={props} className="square-props absolute inset-0" inert>
        {paints && (
          <div ref={shadows} aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <span key={i} className="contact-shadow absolute top-0 left-0" />
            ))}
          </div>
        )}

        <nav aria-label={t.signpost}>
          {paints && (
            <picture>
              <img ref={post} src="/img/square/post.webp" alt="" aria-hidden="true" className="sign-post absolute top-0 left-0" draggable={false} />
            </picture>
          )}
          <ul>
            {ARMS.map((arm) => (
              <li key={arm.id}>
                <Link
                  ref={(el) => {
                    arms.current[arm.id] = el;
                  }}
                  href={placePath(lang, arm.id)}
                  className="sign-arm absolute top-0 left-0"
                  data-points={arm.points}
                  onPointerEnter={() => onPointArm(arm.id, true)}
                  onPointerLeave={() => onPointArm(arm.id, false)}
                  onFocus={() => onPointArm(arm.id, true)}
                  onBlur={() => onPointArm(arm.id, false)}
                >
                  {paints && (
                    <picture>
                      <img src={`/img/square/arm-${arm.id}.webp`} alt="" className="size-full" draggable={false} />
                    </picture>
                  )}
                  <span
                    className={paints ? "arm-label" : "sr-only"}
                    style={paints ? { fontSize: `${LABEL_SIZE * 100}cqh` } : undefined}
                  >
                    {t.arms[arm.id]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <button
          ref={board}
          type="button"
          className="board-button absolute top-0 left-0"
          aria-haspopup="dialog"
          aria-expanded={boardOpen}
          onClick={onOpenBoard}
        >
          {paints && (
            <picture>
              <img src="/img/square/board.webp" alt="" className="size-full" draggable={false} />
            </picture>
          )}
          <span className="sr-only">{t.board}</span>
        </button>

      </div>

      <div className="square-words pointer-events-none absolute">
        <p className="tagline font-display">{t.tagline}</p>
        <p className="square-hint">
          <span className="hint-wander">
            {t.wander}
            <Icon name="arrow-left" className="hint-arrow -rotate-90" />
          </span>
          <span className="hint-door" aria-hidden="true">
            {t.pickDoor}
            <Icon name="arrow-left" className="hint-arrow hint-arrow-door" />
          </span>
        </p>
      </div>
    </div>
  );
}
