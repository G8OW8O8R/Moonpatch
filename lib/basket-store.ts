/**
 * The wheelbarrow kept across visits: one store for the header's counter, the
 * cards and the wheelbarrow itself, saved in the browser and read back
 * through `readBasket`, so a stale or tampered save never reaches the page.
 * It is read back once the page has hydrated (`rehydrateBasket`), never
 * during the server render.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { type BasketState, addItem, emptyBasket, readBasket, setQty, visitDays } from "./basket";
import { browserStorage } from "./browser-storage";

export interface BasketStore extends BasketState {
  /** True once the saved wheelbarrow has been read back. */
  hydrated: boolean;
  add(id: string): void;
  setQty(id: string, qty: number): void;
  pickDay(day: string | null): void;
  clear(): void;
}

export const BASKET_STORAGE_KEY = "moonpatch-wheelbarrow";

export const useBasket = create<BasketStore>()(
  persist(
    (set) => ({
      ...emptyBasket,
      hydrated: false,
      add: (id) => set((state) => ({ lines: addItem(state.lines, id) })),
      setQty: (id, qty) => set((state) => ({ lines: setQty(state.lines, id, qty) })),
      pickDay: (day) => set(() => ({ visitDay: day && visitDays(new Date()).includes(day) ? day : null })),
      clear: () => set(() => ({ ...emptyBasket })),
    }),
    {
      name: BASKET_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(browserStorage),
      skipHydration: true,
      partialize: ({ lines, visitDay }) => ({ lines, visitDay }),
      merge: (stored, current) => ({ ...current, ...readBasket(stored, visitDays(new Date())), hydrated: true }),
    },
  ),
);

/** Reads the saved wheelbarrow back; without storage (a private window) it simply stays empty. */
export async function rehydrateBasket(): Promise<void> {
  try {
    await useBasket.persist.rehydrate();
  } catch {
    // Unreadable storage: an empty wheelbarrow.
  }
  if (!useBasket.getState().hydrated) useBasket.setState({ hydrated: true });
}
