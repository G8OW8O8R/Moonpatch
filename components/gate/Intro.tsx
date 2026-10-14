"use client";

import { type CSSProperties, useEffect, useRef } from "react";
import { onGateReady } from "./gate-ready";

/** The pumpkin's five lobes, drawn from the middle out. */
const LOBES = [
  { cx: 256, cy: 310, rx: 84, ry: 136 },
  { cx: 190, cy: 314, rx: 92, ry: 128 },
  { cx: 322, cy: 314, rx: 92, ry: 128 },
  { cx: 132, cy: 318, rx: 86, ry: 112 },
  { cx: 380, cy: 318, rx: 86, ry: 112 },
] as const;

/** What has to be in before the gate can move, by how much of the wait it is. */
const PARTS = { poster: 0.45, fonts: 0.15, gate: 0.4 } as const;

/** The pumpkin is drawn by then; leaving earlier would cut it short. */
const DRAWN_AT = 1300;
/** The opening's longest stay, as the stylesheet times it. */
const LAST_FRAME = 2500;
const REPEAT_LAST_FRAME = 550;

/**
 * The opening of the farm: the pumpkin mark drawn in outline on warm paper, a
 * hairline under it that fills as the poster, the fonts and the gate's
 * textures really arrive, then the gate's poster coming up out of the warm
 * light. A click, a key or a scroll skips it. It only covers the page: the
 * gate, its words and its links are in the HTML underneath from the start.
 */
export function Intro() {
  const bar = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const stage = root.dataset.intro;
    if (stage !== "first" && stage !== "repeat") return;

    const timers: number[] = [];
    let left = false;
    const leave = (how: "leaving" | "skip") => {
      if (left) return;
      left = true;
      root.dataset.intro = how;
      timers.push(window.setTimeout(() => (root.dataset.intro = "done"), how === "skip" ? 180 : 600));
    };
    // However it goes, the opening is over by its last frame.
    const last = stage === "first" ? LAST_FRAME : REPEAT_LAST_FRAME;
    timers.push(window.setTimeout(() => (root.dataset.intro = "done"), Math.max(0, last + 100 - performance.now())));

    // Opened part-way down the page (a reload keeps its place), there is nothing to open onto.
    if (window.scrollY > 0) leave("skip");

    const skip = () => leave("skip");
    const skipOn = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    for (const type of skipOn) window.addEventListener(type, skip, { capture: true, passive: true });

    let progress = 0.04;
    const done = new Set<keyof typeof PARTS>();
    const arrived = (part: keyof typeof PARTS) => {
      if (done.has(part)) return;
      done.add(part);
      progress += PARTS[part];
      bar.current?.style.setProperty("--p", String(Math.min(1, progress)));
      if (done.size === Object.keys(PARTS).length && stage === "first") {
        timers.push(window.setTimeout(() => leave("leaving"), Math.max(0, DRAWN_AT - performance.now())));
      }
    };

    const poster = document.querySelector<HTMLImageElement>("img.gate-poster");
    if (!poster || (poster.complete && poster.naturalWidth)) arrived("poster");
    else {
      poster.addEventListener("load", () => arrived("poster"), { once: true });
      poster.addEventListener("error", () => arrived("poster"), { once: true });
    }
    void document.fonts.ready.then(() => arrived("fonts"));
    const unsubscribe = onGateReady(() => arrived("gate"));

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      for (const type of skipOn) window.removeEventListener(type, skip, { capture: true });
      unsubscribe();
    };
  }, []);

  return (
    <div className="intro" aria-hidden="true">
      <div className="intro-warm" />
      <div className="intro-light" />
      <div className="intro-center">
        <svg className="intro-mark" viewBox="0 0 512 512" fill="none">
          <defs>
            <mask id="intro-moon-bite">
              <rect width="512" height="512" fill="#fff" />
              <circle cx="292" cy="112" r="40" fill="#000" />
            </mask>
          </defs>
          <g stroke="currentColor" strokeWidth="9" strokeLinecap="round">
            {LOBES.map((lobe, i) => (
              <ellipse key={i} {...lobe} pathLength={1} className="intro-line" style={{ "--i": i } as CSSProperties} />
            ))}
            <path d="M244 176 Q250 160 262 152" pathLength={1} className="intro-line" style={{ "--i": 5 } as CSSProperties} />
          </g>
          <g className="intro-moon" fill="currentColor">
            <g mask="url(#intro-moon-bite)" transform="rotate(-18 268 126)">
              <circle cx="268" cy="126" r="46" />
            </g>
          </g>
        </svg>
        <span className="intro-track">
          <span ref={bar} className="intro-bar" />
        </span>
      </div>
    </div>
  );
}
