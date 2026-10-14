import type { StateStorage } from "zustand/middleware";

/**
 * The browser's storage, where there is one; a blocked or full storage (a
 * private window, a strict browser) costs what was saved, never a click.
 */
export function browserStorage(): StateStorage {
  if (typeof localStorage === "undefined" || !localStorage) throw new Error("no storage");
  const store = localStorage;
  return {
    getItem: (name) => {
      try {
        return store.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        store.setItem(name, value);
      } catch {
        // Not saved; it still works for this visit.
      }
    },
    removeItem: (name) => {
      try {
        store.removeItem(name);
      } catch {
        // Nothing to undo.
      }
    },
  };
}
