"use client";

import "lenis/dist/lenis.css";
import { usePathname } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { type RigParams, defaultRig } from "@/lib/gate-rig";
import type { Locale } from "@/lib/i18n";
import type { Messages } from "@/lib/messages";
import { placeAt, placePath } from "@/lib/routes";
import { type ArmId, OPENED_BOARD, OPENED_BOARD_AVIF } from "@/lib/square-props";
import { DUSK, type Track, defaultTrack, trackAt, trackEnd, trackLength } from "@/lib/square-rig";
import type { VisitCopy } from "@/lib/visit";
import { publishLenis } from "@/components/ui/lenis-channel";
import { SquareDriver } from "@/components/square/driver";
import { drawArmLabels } from "@/components/square/labels";
import { SquareOverlay, type SquareOverlayHandle } from "@/components/square/SquareOverlay";
import { VisitPanel } from "@/components/square/VisitPanel";
import type { FrameStats } from "./renderer/GateRenderer";
import { type SquareState, restingSquare } from "./renderer/SquareRenderer";
import type { GateController } from "./renderer/start";

type Mode = "poster" | "webgl" | "fallback";

export interface GateDebugState {
  mode: Mode;
  reason: string;
  progress: number;
  stats: FrameStats;
}

export interface SquareCopy {
  lang: Locale;
  t: Messages["square"];
  visit: Messages["visit"];
  board: VisitCopy;
}

export interface GateSceneProps {
  /** The poster and the screen-reader copy, rendered on the server. */
  children: ReactNode;
  labelledBy: string;
  square: SquareCopy;
  /** Open on the notice board (its own address) instead of at the gate. */
  initialView?: "gate" | "visit";
  /** Lengths of the scroll, in viewport heights. */
  track?: Track;
  params?: RigParams;
  onDebug?: (state: GateDebugState) => void;
}

interface ScrollLock {
  stop(): void;
  start(): void;
  destroy(): void;
}

const whenIdle = (task: () => void) => {
  const run = () => ("requestIdleCallback" in window ? window.requestIdleCallback(task, { timeout: 1500 }) : setTimeout(task, 200));
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
};

/** Development only: ?layer=gate|plate holds one renderer, for frame-by-frame comparison. */
const debugLayer = (): { debugLayer?: "gate" | "plate" } => {
  if (process.env.NODE_ENV === "production") return {};
  const layer = new URLSearchParams(window.location.search).get("layer");
  return layer === "gate" || layer === "plate" ? { debugLayer: layer } : {};
};

const prefersReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The farm's front page in one scroll: the gate opens, the ride goes through
 * it onto the square, dusk falls over the square, and a last stretch pushes
 * in. The server-rendered poster is the first frame; the WebGL scene loads
 * after it and takes over invisibly, and draws the square from the very
 * texture the ride lands on. Without WebGL2, on a slow device or with
 * reduced motion, the square is plain HTML and dusk is a short crossfade.
 */
export function GateScene({
  children,
  labelledBy,
  square,
  initialView = "gate",
  track = defaultTrack,
  params = defaultRig,
  onDebug,
}: GateSceneProps) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<SquareOverlayHandle>(null);
  const controller = useRef<GateController | null>(null);
  const driver = useRef<SquareDriver | null>(null);
  const progress = useRef(0);
  const paramsRef = useRef(params);
  const trackRef = useRef(track);
  const [mode, setMode] = useState<Mode>("poster");
  const [reason, setReason] = useState("");
  const [pastHalf, setPastHalf] = useState(false);
  const [moved, setMoved] = useState(false);
  const [restart, setRestart] = useState(0);
  const [stats, setStats] = useState<FrameStats>({ fps: 0, quality: 0 });
  const [debugProgress, setDebugProgress] = useState(0);
  const [arrived, setArrived] = useState(false);
  /** The board was opened from the square in this visit (not arrived on at its own address). */
  const [openedInPage, setOpenedInPage] = useState(false);
  const lenis = useRef<ScrollLock | null>(null);
  const modeRef = useRef<Mode>("poster");
  const rideTarget = useRef<0 | 1>(0);
  /** Where the scroll wants the ride; it only plays back once the square is back on its first frame. */
  const rideWanted = useRef<0 | 1>(0);
  const rideAt = useRef<0 | 1>(0);
  const squareReady = useRef(false);
  const holdTimer = useRef(0);
  const openedHere = useRef(false);
  const arrivedOnBoard = useRef(initialView === "visit");
  /** The opened board, decoded while the visitor is still on the square, so opening it never waits on it. */
  const boardImage = useRef<HTMLImageElement | null>(null);

  const pathname = usePathname();
  const boardOpen = placeAt(pathname ?? "")?.place === "visit";
  const boardOpenRef = useRef(boardOpen);

  // While the timed ride plays, the page holds still inside the section; it lets go when the ride lands.
  const release = useCallback(() => {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = 0;
    if (!boardOpenRef.current) lenis.current?.start();
  }, []);
  const hold = useCallback(() => {
    lenis.current?.stop();
    window.clearTimeout(holdTimer.current);
    // Never hold on for good, even if the scene goes quiet.
    holdTimer.current = window.setTimeout(release, paramsRef.current.rideDuration * 1000 + 600);
  }, [release]);

  const sendRide = useCallback(
    (target: 0 | 1) => {
      if (target === rideTarget.current) return;
      rideTarget.current = target;
      controller.current?.setRide(target);
      if (modeRef.current === "webgl") hold();
    },
    [hold],
  );

  /** Props stand on the square once the ride has landed and the scene can draw them (or at once in HTML). */
  const syncProps = useCallback((jump = false) => {
    const d = driver.current;
    if (!d) return;
    const webgl = modeRef.current === "webgl";
    const onSquare = webgl ? rideAt.current === 1 && rideWanted.current === 1 && squareReady.current : progress.current >= 0.5;
    d.showProps(onSquare || boardOpenRef.current, jump);
    if (onSquare && !boardImage.current) {
      // Through a <picture> like the panel's, so the browser picks the same file.
      const picture = document.createElement("picture");
      const source = document.createElement("source");
      source.type = "image/avif";
      source.srcset = OPENED_BOARD_AVIF;
      const img = document.createElement("img");
      picture.append(source, img);
      // Only once the source is in place, or the browser would start on the fallback.
      img.src = OPENED_BOARD;
      void img.decode().catch(() => undefined);
      boardImage.current = img;
      // The board's lettering, so its first layout never waits on a font.
      const css = getComputedStyle(document.documentElement);
      for (const font of [`600 24px ${css.getPropertyValue("--font-fraunces")}`, `500 20px ${css.getPropertyValue("--font-caveat")}`]) {
        void document.fonts.load(font).catch(() => undefined);
      }
    }
  }, []);

  const measure = useCallback(() => {
    const el = section.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // The pinned stage is a fixed 100lvh, unlike innerHeight, which jumps as a phone's toolbar hides.
    const unit = stage.current?.clientHeight ?? window.innerHeight;
    const at = trackAt(-rect.top / unit, trackRef.current);
    progress.current = at.gate;
    controller.current?.setProgress(at.gate);
    driver.current?.follow(at.dusk, at.wander);
    // Crossing the threshold plays the ride forwards; coming back above it plays it back,
    // once dusk has lifted again (the ride only knows the golden square).
    const wanted = at.gate >= paramsRef.current.threshold ? 1 : 0;
    if (wanted !== rideWanted.current) {
      rideWanted.current = wanted;
      syncProps();
    }
    if (wanted === 1 || driver.current?.atStart !== false) sendRide(wanted);
    setPastHalf(at.gate >= 0.5);
    if (at.gate > 0) setMoved(true);
    if (onDebug) setDebugProgress(at.gate);
  }, [onDebug, sendRide, syncProps]);

  useEffect(() => {
    paramsRef.current = params;
    controller.current?.setParams(params);
  }, [params]);

  useEffect(() => {
    trackRef.current = track;
    measure();
  }, [track, measure]);

  useEffect(() => {
    onDebug?.({ mode, reason, progress: debugProgress, stats });
  }, [onDebug, mode, reason, debugProgress, stats]);

  // The square's own motion, on this thread: every frame goes to the canvas and to the page's layer.
  useEffect(() => {
    const d = new SquareDriver({
      reduced: prefersReduced(),
      onFrame: (state: SquareState) => {
        const webgl = modeRef.current === "webgl";
        if (webgl) controller.current?.setSquare(state);
        const el = stage.current;
        if (el) overlay.current?.update(state, { width: el.clientWidth, height: el.clientHeight }, webgl);
        // Paper type once the sky has darkened, and over the opened board.
        const header = state.dusk >= DUSK.header || state.visit > 0 ? "paper" : "ink";
        if (section.current && section.current.dataset.header !== header) section.current.dataset.header = header;
        setArrived(boardOpenRef.current && state.visit >= 0.999);
        // A ride back that waited for dusk to lift can go now.
        if (rideWanted.current === 0 && rideTarget.current === 1 && d.atStart) sendRide(0);
      },
    });
    driver.current = d;
    return () => {
      d.dispose();
      driver.current = null;
    };
  }, [sendRide]);

  // Scroll: smoothed wheel on desktop, native on touch, none of it under reduced motion.
  useEffect(() => {
    let cancelled = false;
    if (!prefersReduced()) {
      void import("lenis").then(({ default: Lenis }) => {
        if (cancelled) return;
        const instance = new Lenis({ autoRaf: true, smoothWheel: true, syncTouch: false });
        lenis.current = instance;
        if (boardOpenRef.current) instance.stop();
        publishLenis(instance);
      });
    }
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelled = true;
      window.clearTimeout(holdTimer.current);
      if (lenis.current) publishLenis(null);
      lenis.current?.destroy();
      lenis.current = null;
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // Arriving on the board's own address, or on the square's (#square): the scene starts where it ends.
  useEffect(() => {
    if (initialView !== "visit" && window.location.hash !== "#square") return;
    const el = section.current;
    const unit = stage.current?.clientHeight ?? window.innerHeight;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + trackEnd(trackRef.current) * unit, behavior: "instant" });
    measure();
    driver.current?.follow(1, 1, true);
    rideWanted.current = 1;
    syncProps(true);
  }, [initialView, measure, syncProps]);

  // The board opens with its address: the camera flies onto it, the page holds still beneath it.
  useEffect(() => {
    boardOpenRef.current = boardOpen;
    const d = driver.current;
    if (!d) return;
    if (boardOpen) {
      // Arriving on the board's address, it is simply open; opened from up by the gate, the square comes to rest first.
      const jump = arrivedOnBoard.current || progress.current < paramsRef.current.threshold;
      arrivedOnBoard.current = false;
      if (jump) {
        const el = section.current;
        const unit = stage.current?.clientHeight ?? window.innerHeight;
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + trackEnd(trackRef.current) * unit, behavior: "instant" });
        measure();
        d.follow(1, 1, true);
      }
      syncProps(jump);
      d.openBoard(true, jump);
      lenis.current?.stop();
    } else {
      d.openBoard(false);
      if (!holdTimer.current) lenis.current?.start();
    }
  }, [boardOpen, measure, syncProps]);

  const openBoard = useCallback(() => {
    openedHere.current = true;
    setOpenedInPage(true);
    window.history.pushState(null, "", placePath(square.lang, "visit"));
  }, [square.lang]);

  const closeBoard = useCallback(() => {
    if (openedHere.current) {
      openedHere.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", placePath(square.lang, "square"));
    }
  }, [square.lang]);

  const pointArm = useCallback((arm: ArmId, pointed: boolean) => driver.current?.pointArm(arm, pointed), []);

  // The WebGL scene, started once the poster is on screen and the page is idle.
  useEffect(() => {
    const fallBack = (why: string) =>
      queueMicrotask(() => {
        setMode("fallback");
        setReason(why);
      });
    // Both checks are free: no trial context is ever created.
    if (prefersReduced()) return fallBack("reduced motion");
    if (typeof WebGL2RenderingContext === "undefined") return fallBack("no webgl2");
    const canvasEl = canvas.current;
    const stageEl = stage.current;
    const poster = stageEl?.querySelector<HTMLImageElement>("img.gate-poster");
    if (!canvasEl || !stageEl || !poster) return;

    let cancelled = false;
    let visible = true;
    let onscreen = true;
    const sync = () => controller.current?.setActive(visible && onscreen);
    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      sync();
    };
    const intersection = new IntersectionObserver(([entry]) => {
      onscreen = !!entry?.isIntersecting;
      sync();
    });
    const resize = new ResizeObserver(() => {
      controller.current?.resize({ width: stageEl.clientWidth, height: stageEl.clientHeight });
    });

    whenIdle(() => {
      if (cancelled) return;
      void import("./renderer/start").then(({ startGate }) => {
        if (cancelled) return;
        squareReady.current = false;
        controller.current = startGate(
          canvasEl,
          poster,
          {
            css: { width: stageEl.clientWidth, height: stageEl.clientHeight },
            params: paramsRef.current,
            progress: progress.current,
            square: driver.current?.snapshot() ?? restingSquare,
            ...debugLayer(),
          },
          {
            onReady: () => {
              setMode("webgl");
              setReason("");
            },
            onFail: (why) => {
              controller.current = null;
              setMode("fallback");
              setReason(why);
            },
            onPlateChange: () => {
              controller.current?.dispose();
              controller.current = null;
              setMode("poster");
              setRestart((n) => n + 1);
            },
            onStats: setStats,
            onRideSettled: (ride) => {
              rideAt.current = ride;
              syncProps();
              release();
            },
            onSquareReady: () => {
              squareReady.current = true;
              syncProps();
            },
          },
        );
        // The arms' lettering is set on this thread, where the fonts are.
        void drawArmLabels(square.t.arms).then((labels) => {
          for (const [arm, bitmap] of Object.entries(labels) as [ArmId, ImageBitmap][]) {
            if (controller.current && !cancelled) controller.current.setLabel(arm, bitmap);
            else bitmap.close();
          }
        });
        intersection.observe(section.current!);
        resize.observe(stageEl);
        document.addEventListener("visibilitychange", onVisibility);
      });
    });

    return () => {
      cancelled = true;
      intersection.disconnect();
      resize.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      controller.current?.dispose();
      controller.current = null;
    };
  }, [restart, release, syncProps, square.t.arms]);

  // A fresh frame once the canvas is shown; without the scene nothing may hold the page.
  useEffect(() => {
    modeRef.current = mode;
    if (mode === "webgl") {
      controller.current?.setParams(paramsRef.current);
      const d = driver.current;
      if (d) controller.current?.setSquare(d.snapshot());
    } else {
      release();
    }
    syncProps(true);
    // One frame for the layer that now draws the square.
    driver.current?.refresh();
  }, [mode, release, syncProps]);

  // Without WebGL the square is plain HTML, shown once the poster's job is done.
  const htmlSquare = mode !== "webgl" && (mode === "fallback" || pastHalf);

  // The plain-HTML square mounts its images when it takes over: place them at once.
  useEffect(() => {
    if (htmlSquare) driver.current?.refresh();
  }, [htmlSquare]);
  // Above 2× the canvas is drawn at 2× and upscaled, a touch softer than the poster:
  // there it takes over with the first movement, where the difference cannot be seen.
  const canvasShown = mode === "webgl" && (moved || (typeof window !== "undefined" && window.devicePixelRatio <= 2));

  return (
    <section
      ref={section}
      aria-labelledby={labelledBy}
      data-header="ink"
      className="relative"
      style={{ height: `${trackLength(track) * 100}lvh` }}
    >
      <div ref={stage} className="scene-stage sticky top-0 h-lvh overflow-hidden bg-bark">
        {children}
        <canvas
          key={restart}
          ref={canvas}
          aria-hidden="true"
          data-gate-canvas={mode}
          className={`absolute inset-0 size-full ${canvasShown ? "" : "invisible"}`}
        />
        <div className={`absolute inset-0 transition-opacity duration-150 ${htmlSquare || mode === "webgl" ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <SquareOverlay
            ref={overlay}
            lang={square.lang}
            t={square.t}
            paints={htmlSquare}
            boardOpen={boardOpen}
            onPointArm={pointArm}
            onOpenBoard={openBoard}
          />
        </div>
        {boardOpen && (
          <VisitPanel
            copy={square.board}
            t={square.visit}
            arrived={arrived || mode !== "webgl"}
            content={arrived || mode !== "webgl"}
            fade={openedInPage}
            onClose={closeBoard}
          />
        )}
      </div>
    </section>
  );
}
