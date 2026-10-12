import type Lenis from "lenis";

type Listener = (lenis: Lenis | null) => void;

let current: Lenis | null = null;
const listeners = new Set<Listener>();

/** The scene that owns the smooth scroll announces it here, and `null` when it lets go. */
export function publishLenis(lenis: Lenis | null) {
  current = lenis;
  for (const listener of listeners) listener(lenis);
}

/** Called at once with the current instance, then on every change. */
export function subscribeLenis(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
