import { type RefObject, useEffect } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab inside a dialog while it is open: from the last stop back to the
 * first and the other way round. Focus lands on `initial` (or the dialog) on
 * opening and goes back to where it came from on closing.
 */
export function useFocusTrap(dialog: RefObject<HTMLElement | null>, { initial, restore }: { initial?: RefObject<HTMLElement | null>; restore?: () => HTMLElement | null } = {}) {
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (initial?.current ?? el).focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const stops = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((node) => !node.closest("[inert]") && node.getClientRects().length > 0);
      if (stops.length === 0) {
        event.preventDefault();
        el.focus({ preventScroll: true });
        return;
      }
      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === el || !el.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (active === last || !el.contains(active))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const back = restore?.() ?? before;
      if (back?.isConnected) back.focus({ preventScroll: true });
    };
    // The dialog opens and closes with the component; the refs are read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
