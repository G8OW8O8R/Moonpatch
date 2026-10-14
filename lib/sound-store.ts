/**
 * The visitor's choice to hear the farm: off until they turn it on, then kept
 * in the browser and read back through `readSoundChoice` once the page has
 * hydrated (`rehydrateSound`), never during the server render.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { browserStorage } from "./browser-storage";
import { readSoundChoice } from "./sound";

export interface SoundStore {
  on: boolean;
  /** True once the saved choice has been read back. */
  hydrated: boolean;
  toggle(): void;
}

export const SOUND_STORAGE_KEY = "moonpatch-sound";

export const useSound = create<SoundStore>()(
  persist(
    (set) => ({
      on: false,
      hydrated: false,
      toggle: () => set((state) => ({ on: !state.on })),
    }),
    {
      name: SOUND_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(browserStorage),
      skipHydration: true,
      partialize: ({ on }) => ({ on }),
      merge: (stored, current) => ({ ...current, on: readSoundChoice(stored), hydrated: true }),
    },
  ),
);

/** Reads the saved choice back; without storage it simply stays off. */
export async function rehydrateSound(): Promise<void> {
  try {
    await useSound.persist.rehydrate();
  } catch {
    // Unreadable storage: silence.
  }
  if (!useSound.getState().hydrated) useSound.setState({ hydrated: true });
}
