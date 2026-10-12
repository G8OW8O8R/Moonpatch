"use client";

import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { subscribeLenis } from "./lenis-channel";

/** How long the rail lingers after the page comes to rest. */
const LINGER_MS = 1500;

const fineHover = "(hover: hover) and (pointer: fine)";

const nativeProgress = () => {
  const limit = document.documentElement.scrollHeight - window.innerHeight;
  return limit > 0 ? window.scrollY / limit : 0;
};

/**
 * Stands in for the hidden scrollbar on mouse devices: a hairline at the right
 * edge with a crescent riding down it as the whole page scrolls. It wakes on
 * scroll and fades out once the page is still. Touch keeps the system bar.
 */
export function ScrollMoon() {
  const root = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = root.current;
    const moon = rail.current;
    if (!el || !moon) return;

    let last = -1;
    let timer = 0;
    const update = (progress: number) => {
      const p = Math.min(1, Math.max(0, progress));
      if (Math.abs(p - last) < 1e-4) return;
      // The first reading only places the moon; it shows itself once the page moves.
      const moved = last >= 0;
      last = p;
      moon.style.transform = `translate3d(0, ${(p * 100).toFixed(3)}%, 0)`;
      if (!moved) return;
      el.dataset.shown = "";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => delete el.dataset.shown, LINGER_MS);
    };

    // Ride on the smooth scroll's own events when it runs, on plain scroll events otherwise.
    const onNative = () => update(nativeProgress());
    let detach = () => {};
    const follow = () =>
      subscribeLenis((lenis) => {
        detach();
        if (lenis) {
          detach = lenis.on("scroll", ({ progress }) => update(progress));
        } else {
          window.addEventListener("scroll", onNative, { passive: true });
          detach = () => window.removeEventListener("scroll", onNative);
        }
        update(lenis ? lenis.progress : nativeProgress());
      });

    const query = window.matchMedia(fineHover);
    let unfollow: (() => void) | null = null;
    const sync = () => {
      if (query.matches && !unfollow) {
        unfollow = follow();
      } else if (!query.matches && unfollow) {
        unfollow();
        unfollow = null;
        detach();
        detach = () => {};
      }
    };
    sync();
    query.addEventListener("change", sync);

    return () => {
      query.removeEventListener("change", sync);
      unfollow?.();
      detach();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div ref={root} aria-hidden="true" className="scroll-moon">
      <span className="scroll-moon-line" />
      <span ref={rail} className="scroll-moon-rail">
        <Icon name="moon" className="scroll-moon-thumb drop-shadow-hug" />
      </span>
    </div>
  );
}
