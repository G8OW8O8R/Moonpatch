"use client";

import Link from "next/link";
import { type CSSProperties, type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { SquareState } from "@/components/gate/renderer/SquareRenderer";
import { Icon } from "@/components/ui/Icon";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/messages";
import type { PlateWindow } from "@/lib/gate-rig";
import { PLATE, type Size, coverSizes } from "@/lib/plate-box";
import { PROP_LIGHT } from "@/lib/prop-light";
import { placePath } from "@/lib/routes";
import { ARMS, type ArmId, BOARD_WRITING, DUSK_PROP, type PropQuad, propsOnScreen } from "@/lib/square-props";
import { DUSK, gradeAt } from "@/lib/square-rig";
import { LABEL_SIZE, armLabelSizes, knownArmLabelSizes } from "./labels";
import { DUSK_POSTER, GOLDEN_PLATE, plateSrcSet } from "./warm";

export interface SquareOverlayHandle {
  /**
   * Places everything for this frame. `onCanvas`: the WebGL scene draws the
   * square. `pan`: the camera pans on portrait screens, as the WebGL scene's
   * does (also while this layer stands in for it, before it is ready).
   * Returns the window onto the plate for this frame.
   */
  update(state: SquareState, css: Size, onCanvas: boolean, pan: boolean): PlateWindow;
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
  /**
   * The square itself is wanted: not while the board is open on its own
   * address, where the square shows only out of focus behind it.
   */
  plates: boolean;
  /** The page's first frame is the square: its plates are painted with it, not a frame later. */
  first: boolean;
  boardOpen: boolean;
  onPointArm(arm: ArmId, pointed: boolean): void;
  onPointBoard(pointed: boolean): void;
  onOpenBoard(): void;
  ref?: Ref<SquareOverlayHandle>;
}

/**
 * A square plate: the golden photograph, or the square at the end of dusk
 * as the scene draws it. `first`: shown in the page's first frame, decoded
 * with it rather than after it.
 */
function Plate({ plate, className, first }: { plate: { base: string; widths: readonly number[] }; className: string; first: boolean }) {
  const sizes = coverSizes(PLATE);
  return (
    <picture>
      <source type="image/avif" srcSet={plateSrcSet(plate.base, plate.widths, "avif")} sizes={sizes} />
      <img
        src={`${plate.base}-1600.webp`}
        srcSet={plateSrcSet(plate.base, plate.widths, "webp")}
        sizes={sizes}
        alt=""
        width={PLATE.width}
        height={PLATE.height}
        decoding={first ? "sync" : "async"}
        draggable={false}
        className={`absolute inset-0 size-full max-w-none select-none ${className}`}
      />
    </picture>
  );
}

/** The plain-HTML lettering: the scene's size, and the grain of its own arm to wear it. */
const labelStyle = (arm: ArmId, size: number | undefined): CSSProperties => ({
  fontSize: `${(size ?? LABEL_SIZE / 0.7) * 100}cqh`,
  maskImage: `url(/img/square/arm-${arm}.webp)`,
});

const place = (el: HTMLElement | null, rect: { x: number; y: number; w: number; h: number }, turn = 0, pivot?: { x: number; y: number }) => {
  if (!el) return;
  el.style.width = `${rect.w}px`;
  el.style.height = `${rect.h}px`;
  if (pivot) el.style.transformOrigin = `${pivot.x - rect.x}px ${pivot.y - rect.y}px`;
  el.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)${turn ? ` rotate(${turn}rad)` : ""}`;
};

/**
 * A prop as the plain-HTML square shows it: in the photograph's golden light,
 * and the same prop in the light at the end of dusk (baked), laid over it as
 * dusk falls.
 */
function PropImage({ id }: { id: PropQuad["id"] }) {
  return (
    <>
      <picture>
        <img src={`/img/square/${id}.webp`} alt="" aria-hidden="true" className="prop-golden absolute inset-0 size-full" draggable={false} />
      </picture>
      <picture>
        <img src={DUSK_PROP(id)} alt="" aria-hidden="true" className="prop-dusk absolute inset-0 size-full" draggable={false} />
      </picture>
    </>
  );
}

/**
 * Everything on the square that is not the photograph: the signpost (links
 * to the three buildings), the notice board (opens the Visit panel), the
 * tagline and the scroll hint. Over WebGL these are invisible hit areas laid
 * exactly over the painted props; without it they carry the props
 * themselves, over plain plates, under a still grain.
 */
export function SquareOverlay({ lang, t, paints: paintsSquare, plates: squareWanted, first, boardOpen, onPointArm, onPointBoard, onOpenBoard, ref }: SquareOverlayProps) {
  // Behind the board opened on its own address nothing of the square is drawn here: not one image is fetched for it.
  const paints = paintsSquare && squareWanted;
  const root = useRef<HTMLDivElement>(null);
  const props = useRef<HTMLDivElement>(null);
  const plates = useRef<HTMLDivElement>(null);
  const post = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLButtonElement>(null);
  const arms = useRef<Partial<Record<ArmId, HTMLAnchorElement | null>>>({});
  const shadows = useRef<HTMLDivElement>(null);
  const flags = useRef({ shown: false, dusk: false, tagline: false, door: false });
  /** Lettering sizes for the plain-HTML arms, measured as the scene measures its own. */
  const [labelSizes, setLabelSizes] = useState<Partial<Record<ArmId, number>>>(() => knownArmLabelSizes(lang));

  useEffect(() => {
    if (!paints) return;
    let cancelled = false;
    void armLabelSizes(t.arms, lang).then((sizes) => {
      if (!cancelled) setLabelSizes(sizes);
    });
    return () => {
      cancelled = true;
    };
  }, [paints, t.arms, lang]);

  useImperativeHandle(
    ref,
    () => ({
      update(state, css, onCanvas, pan) {
        const { props: onScreen, shadows: contact, plate } = propsOnScreen(css, state, { pan });
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
        if (!el) return plate;
        if (next.shown !== flags.current.shown && props.current) props.current.inert = !next.shown;
        el.style.setProperty("--props", String(onCanvas ? 1 : state.props));
        // The scene's own golden-to-dusk grade, for a start straight onto the square (no crossfade to wait for).
        el.style.setProperty("--grade", gradeAt(state.dusk).toFixed(3));
        for (const key of Object.keys(next) as (keyof typeof next)[]) {
          if (next[key] === flags.current[key]) continue;
          if (next[key]) el.dataset[key] = "";
          else delete el.dataset[key];
        }
        flags.current = next;
        return plate;
      },
    }),
    [],
  );

  return (
    <div ref={root} className="square-overlay absolute inset-0" data-webgl={paints ? undefined : ""}>
      {paints && (
        <div ref={plates} aria-hidden="true" className="square-plates absolute top-0 left-0 overflow-hidden">
          <Plate plate={GOLDEN_PLATE} className="" first={first} />
          <Plate plate={DUSK_POSTER} className="square-dusk" first={first} />
        </div>
      )}
      {paints && <div aria-hidden="true" className="square-grain absolute inset-0" />}
      {paints && (
        <svg aria-hidden="true" className="absolute size-0">
          {/* The photograph's golden light on the props, as the scene gives it. */}
          <filter id="props-golden" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={`${PROP_LIGHT.golden[0]} 0 0 0 0  0 ${PROP_LIGHT.golden[1]} 0 0 0  0 0 ${PROP_LIGHT.golden[2]} 0 0  0 0 0 1 0`} />
          </filter>
        </svg>
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
            <div ref={post} aria-hidden="true" className="sign-post absolute top-0 left-0">
              <PropImage id="post" />
            </div>
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
                  {paints && <PropImage id={`arm-${arm.id}`} />}
                  <span
                    className={paints ? "arm-label" : "sr-only"}
                    style={paints ? labelStyle(arm.id, labelSizes[arm.id]) : undefined}
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
          onPointerEnter={() => onPointBoard(true)}
          onPointerLeave={() => onPointBoard(false)}
          onFocus={() => onPointBoard(true)}
          onBlur={() => onPointBoard(false)}
        >
          {paints && (
            <>
              <PropImage id="board" />
              <picture>
                <img src={BOARD_WRITING} alt="" aria-hidden="true" className="board-writing absolute inset-0 size-full" draggable={false} />
              </picture>
            </>
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
            {t.useSignpost}
            <Icon name="arrow-left" className="hint-arrow hint-arrow-door" />
          </span>
        </p>
      </div>
    </div>
  );
}
