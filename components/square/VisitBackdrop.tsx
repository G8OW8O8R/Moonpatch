import type { CSSProperties, Ref } from "react";
import type { PlateWindow } from "@/lib/gate-rig";
import { SOFT_POSTER, SOFT_VIEW } from "@/lib/square-poster";

const { rect } = SOFT_POSTER;

/** The plate regions that cover the screen behind the board, for the stylesheet's first placement. */
const style = {
  "--soft-x": rect.x,
  "--soft-y": rect.y,
  "--soft-w": rect.w,
  "--soft-h": rect.h,
  "--wide-x": SOFT_VIEW.wide.x,
  "--wide-y": SOFT_VIEW.wide.y,
  "--wide-w": SOFT_VIEW.wide.w,
  "--wide-h": SOFT_VIEW.wide.h,
  "--tall-x": SOFT_VIEW.tall.x,
  "--tall-y": SOFT_VIEW.tall.y,
  "--tall-w": SOFT_VIEW.tall.w,
  "--tall-h": SOFT_VIEW.tall.h,
} as CSSProperties;

/**
 * The square at dusk out of focus behind the opened board, baked: there from
 * the server's first paint, placed by the stylesheet until the page can place
 * it exactly where the scene's camera has the plate. It steps aside once the
 * scene paints the same view itself.
 */
export function VisitBackdrop({ painted, ref }: { painted: boolean; ref?: Ref<HTMLImageElement> }) {
  return (
    <picture>
      <img
        ref={ref}
        src={SOFT_POSTER.src}
        alt=""
        aria-hidden="true"
        width={Math.round(rect.w * SOFT_POSTER.scale)}
        height={Math.round(rect.h * SOFT_POSTER.scale)}
        fetchPriority="high"
        draggable={false}
        className="visit-backdrop absolute max-w-none select-none"
        data-painted={painted ? "" : undefined}
        style={style}
      />
    </picture>
  );
}

/**
 * Exactly where the plate is (the scene's window onto it), and how far the camera has come onto the
 * board. A transform from where the stylesheet put it, so the page's layout never shifts.
 */
export function placeBackdrop(el: HTMLImageElement | null, plate: PlateWindow, visit: number) {
  if (!el || !el.offsetWidth) return;
  const s = plate.scale;
  const k = (rect.w * s) / el.offsetWidth;
  const x = plate.origin.x + rect.x * s - el.offsetLeft;
  const y = plate.origin.y + rect.y * s - el.offsetTop;
  el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${k})`;
  // Comes into focus over the last of the move, where it covers the screen.
  const t = Math.min(1, Math.max(0, (visit - 0.6) / 0.4));
  el.style.setProperty("--arrive", (t * t * (3 - 2 * t)).toFixed(3));
}
