/**
 * Whether the gate is ready to be moved: its scene has its textures on the GPU,
 * or it has settled for the still poster. Told once per page.
 */
let ready = false;
const listeners = new Set<() => void>();

export function markGateReady(): void {
  if (ready) return;
  ready = true;
  for (const listener of listeners) listener();
  listeners.clear();
}

/** Calls `listener` once the gate is ready (at once if it already is). Returns an unsubscribe. */
export function onGateReady(listener: () => void): () => void {
  if (ready) {
    listener();
    return () => {};
  }
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
