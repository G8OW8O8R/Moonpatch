import { beforeEach, describe, expect, it, vi } from "vitest";

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

async function load() {
  vi.resetModules();
  return import("./sound-store");
}

describe("the sound switch's memory", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
  });

  it("starts silent on a first visit", async () => {
    const { useSound, rehydrateSound } = await load();
    await rehydrateSound();
    expect(useSound.getState()).toMatchObject({ on: false, hydrated: true });
  });

  it("keeps the choice for the next visit", async () => {
    const first = await load();
    await first.rehydrateSound();
    first.useSound.getState().toggle();
    const next = await load();
    await next.rehydrateSound();
    expect(next.useSound.getState().on).toBe(true);
  });

  it("falls back to silence on a tampered save", async () => {
    const { SOUND_STORAGE_KEY } = await load();
    storage.setItem(SOUND_STORAGE_KEY, JSON.stringify({ state: { on: "loud" }, version: 1 }));
    const { useSound, rehydrateSound } = await load();
    await rehydrateSound();
    expect(useSound.getState().on).toBe(false);
  });
});
