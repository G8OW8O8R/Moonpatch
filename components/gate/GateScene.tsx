"use client";

import "lenis/dist/lenis.css";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { type RigParams, defaultRig } from "@/lib/gate-rig";
import { PLATE, SQUARE_ANCHOR, coverSizes, objectPosition } from "@/lib/plate-box";
import type { FrameStats } from "./renderer/GateRenderer";
import type { GateController } from "./renderer/start";

type Mode = "poster" | "webgl" | "fallback";

export interface GateDebugState {
  mode: Mode;
  reason: string;
  progress: number;
  stats: FrameStats;
}

export interface GateSceneProps {
  /** The poster and the screen-reader copy, rendered on the server. */
  children: ReactNode;
  labelledBy: string;
  /** Section length in viewport heights. */
  length?: number;
  params?: RigParams;
  onDebug?: (state: GateDebugState) => void;
}

const squareSrcSet = (format: "avif" | "webp") =>
  `/img/plates/square-golden-1600.${format} 1600w, /img/plates/square-golden-2576.${format} 2576w`;

/** square-golden in its own framing: where the ride lands, and what the fallback fades to. */
function SquarePlate({ shown }: { shown: boolean }) {
  return (
    <picture>
      <source type="image/avif" srcSet={squareSrcSet("avif")} sizes={coverSizes(PLATE)} />
      <img
        src="/img/plates/square-golden-1600.webp"
        srcSet={squareSrcSet("webp")}
        sizes={coverSizes(PLATE)}
        alt=""
        aria-hidden="true"
        width={PLATE.width}
        height={PLATE.height}
        decoding="async"
        draggable={false}
        style={{ objectPosition: objectPosition(SQUARE_ANCHOR) }}
        className={`absolute inset-0 size-full object-cover transition-opacity duration-150 select-none ${shown ? "opacity-100" : "opacity-0"}`}
      />
    </picture>
  );
}

const whenIdle = (task: () => void) => {
  const run = () => ("requestIdleCallback" in window ? window.requestIdleCallback(task, { timeout: 1500 }) : setTimeout(task, 200));
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
};

/**
 * The gate section: scrolling opens the gate and rides through it onto the
 * square. The server-rendered poster is the first frame; the WebGL scene loads
 * after it and takes over invisibly. Without WebGL2, on a slow device or with
 * reduced motion, the poster simply fades to the square halfway down.
 */
export function GateScene({ children, labelledBy, length = 2.5, params = defaultRig, onDebug }: GateSceneProps) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<GateController | null>(null);
  const progress = useRef(0);
  const paramsRef = useRef(params);
  const [mode, setMode] = useState<Mode>("poster");
  const [reason, setReason] = useState("");
  const [pastHalf, setPastHalf] = useState(false);
  const [moved, setMoved] = useState(false);
  const [restart, setRestart] = useState(0);
  const [stats, setStats] = useState<FrameStats>({ fps: 0, quality: 0 });
  const [debugProgress, setDebugProgress] = useState(0);

  const measure = useCallback(() => {
    const el = section.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // The pinned stage is a fixed 100lvh, unlike innerHeight, which jumps as a phone's toolbar hides.
    const travel = rect.height - (stage.current?.clientHeight ?? window.innerHeight);
    const p = travel > 0 ? Math.min(1, Math.max(0, -rect.top / travel)) : 0;
    progress.current = p;
    controller.current?.setProgress(p);
    setPastHalf(p >= 0.5);
    if (p > 0) setMoved(true);
    if (onDebug) setDebugProgress(p);
  }, [onDebug]);

  useEffect(() => {
    paramsRef.current = params;
    controller.current?.setParams(params);
  }, [params]);

  useEffect(() => {
    onDebug?.({ mode, reason, progress: debugProgress, stats });
  }, [onDebug, mode, reason, debugProgress, stats]);

  // Scroll: smoothed wheel on desktop, native on touch, none of it under reduced motion.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let lenis: { destroy(): void } | null = null;
    let cancelled = false;
    if (!reduced) {
      void import("lenis").then(({ default: Lenis }) => {
        if (!cancelled) lenis = new Lenis({ autoRaf: true, smoothWheel: true, syncTouch: false });
      });
    }
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelled = true;
      lenis?.destroy();
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // The WebGL scene, started once the poster is on screen and the page is idle.
  useEffect(() => {
    const fallBack = (why: string) =>
      queueMicrotask(() => {
        setMode("fallback");
        setReason(why);
      });
    // Both checks are free: no trial context is ever created.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return fallBack("reduced motion");
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
        controller.current = startGate(
          canvasEl,
          poster,
          { css: { width: stageEl.clientWidth, height: stageEl.clientHeight }, params: paramsRef.current, progress: progress.current },
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
          },
        );
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
  }, [restart]);

  // A fresh frame once the canvas is shown.
  useEffect(() => {
    if (mode === "webgl") controller.current?.setParams(paramsRef.current);
  }, [mode]);

  const showSquare = mode !== "webgl" && pastHalf;
  // Above 2× the canvas is drawn at 2× and upscaled, a touch softer than the poster:
  // there it takes over with the first movement, where the difference cannot be seen.
  const canvasShown = mode === "webgl" && (moved || (typeof window !== "undefined" && window.devicePixelRatio <= 2));

  return (
    <section
      ref={section}
      aria-labelledby={labelledBy}
      data-header="ink"
      className="relative"
      style={{ height: `${length * 100}lvh` }}
    >
      <div ref={stage} className="sticky top-0 h-lvh overflow-hidden bg-bark">
        {children}
        {/* Mounted only when needed, so it never competes with the poster for bandwidth. */}
        {mode !== "webgl" && (mode === "fallback" || pastHalf) && <SquarePlate shown={showSquare} />}
        <canvas
          key={restart}
          ref={canvas}
          aria-hidden="true"
          data-gate-canvas={mode}
          className={`absolute inset-0 size-full ${canvasShown ? "" : "invisible"}`}
        />
      </div>
    </section>
  );
}
