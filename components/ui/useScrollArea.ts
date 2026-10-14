import { useCallback } from "react";

/** Within this of the end, the list counts as read to the bottom. */
const END_SLACK = 2;

/**
 * The scrolling middle of a dialog (between its heading and its foot). While
 * its content is taller than it, it says so (`data-scrolls`, which fades its
 * lower edge) and the keyboard can reach it, so PageDown and the arrows
 * scroll it; at the bottom (`data-end`) the fade goes. Pair it with the
 * `scroll-area` class and `data-lenis-prevent`, which keeps the page's own
 * smooth scroll off it even while that scroll is stopped.
 */
export function useScrollArea(labelledBy?: string) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      const check = () => {
        const scrolls = el.scrollHeight > el.clientHeight + 1;
        const end = el.scrollTop + el.clientHeight >= el.scrollHeight - END_SLACK;
        el.toggleAttribute("data-scrolls", scrolls);
        el.toggleAttribute("data-end", !scrolls || end);
        if (scrolls) {
          el.tabIndex = 0;
          el.setAttribute("role", "group");
          if (labelledBy) el.setAttribute("aria-labelledby", labelledBy);
        } else {
          el.removeAttribute("tabindex");
          el.removeAttribute("role");
          el.removeAttribute("aria-labelledby");
        }
      };
      check();
      const resize = new ResizeObserver(check);
      resize.observe(el);
      for (const child of el.children) resize.observe(child);
      // Lines added or taken out of the list change its height without resizing the area itself.
      const mutation = new MutationObserver(() => {
        for (const child of el.children) resize.observe(child);
        check();
      });
      mutation.observe(el, { childList: true, subtree: true, characterData: true });
      el.addEventListener("scroll", check, { passive: true });
      return () => {
        resize.disconnect();
        mutation.disconnect();
        el.removeEventListener("scroll", check);
      };
    },
    [labelledBy],
  );
}
