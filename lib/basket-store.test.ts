import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A browser's localStorage, in memory. */
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

/** The store as a fresh page load finds it: storage as left, module evaluated anew. */
async function load() {
  vi.resetModules();
  return import("./basket-store");
}

describe("the wheelbarrow store", () => {
  let storage: Storage;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 14, 12));
    storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts empty and is not read back before the page asks", async () => {
    storage.setItem("moonpatch-wheelbarrow", JSON.stringify({ state: { lines: [{ id: "07-plaid-blanket", qty: 1 }], visitDay: null }, version: 1 }));
    const { useBasket } = await load();
    expect(useBasket.getState().lines).toEqual([]);
    expect(useBasket.getState().hydrated).toBe(false);
  });

  it("survives a reload", async () => {
    const first = await load();
    await first.rehydrateBasket();
    first.useBasket.getState().add("07-plaid-blanket");
    first.useBasket.getState().add("07-plaid-blanket");
    first.useBasket.getState().add("02-cider-donuts");
    first.useBasket.getState().pickDay("2026-10-24");

    const second = await load();
    await second.rehydrateBasket();
    const state = second.useBasket.getState();
    expect(state.hydrated).toBe(true);
    expect(state.lines).toEqual([
      { id: "07-plaid-blanket", qty: 2 },
      { id: "02-cider-donuts", qty: 1 },
    ]);
    expect(state.visitDay).toBe("2026-10-24");
  });

  it("saves only the lines and the day", async () => {
    const { useBasket, rehydrateBasket } = await load();
    await rehydrateBasket();
    useBasket.getState().add("07-plaid-blanket");
    const saved = JSON.parse(storage.getItem("moonpatch-wheelbarrow") ?? "null") as { state: Record<string, unknown> };
    expect(Object.keys(saved.state).sort()).toEqual(["lines", "visitDay"]);
  });

  it("reads a tampered save back as what still makes sense", async () => {
    storage.setItem(
      "moonpatch-wheelbarrow",
      JSON.stringify({ state: { lines: [{ id: "99-ghost", qty: 3 }, { id: "08-dried-wreath", qty: -2 }, { id: "11-stoneware-mug", qty: 2 }], visitDay: "2026-10-14" }, version: 1 }),
    );
    const { useBasket, rehydrateBasket } = await load();
    await rehydrateBasket();
    expect(useBasket.getState().lines).toEqual([{ id: "11-stoneware-mug", qty: 2 }]);
    // A Wednesday: the farm only opens for visits on weekends.
    expect(useBasket.getState().visitDay).toBeNull();
  });

  it("is empty after a broken save", async () => {
    storage.setItem("moonpatch-wheelbarrow", "{not json");
    const { useBasket, rehydrateBasket } = await load();
    await rehydrateBasket();
    expect(useBasket.getState().lines).toEqual([]);
    expect(useBasket.getState().hydrated).toBe(true);
  });

  it("changes amounts, takes a line out at zero, and empties", async () => {
    const { useBasket, rehydrateBasket } = await load();
    await rehydrateBasket();
    const { add, setQty, clear } = useBasket.getState();
    add("12-beeswax-tapers");
    add("10-amber-candle");
    setQty("12-beeswax-tapers", 4);
    setQty("10-amber-candle", 0);
    expect(useBasket.getState().lines).toEqual([{ id: "12-beeswax-tapers", qty: 4 }]);
    clear();
    expect(useBasket.getState().lines).toEqual([]);
  });

  it("only keeps a visit day the farm is open", async () => {
    const { useBasket, rehydrateBasket } = await load();
    await rehydrateBasket();
    useBasket.getState().pickDay("2026-10-20");
    expect(useBasket.getState().visitDay).toBeNull();
    useBasket.getState().pickDay("2026-10-16");
    expect(useBasket.getState().visitDay).toBe("2026-10-16");
  });

  it("stays empty and quiet where there is no storage", async () => {
    vi.stubGlobal("localStorage", undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { useBasket, rehydrateBasket } = await load();
    await rehydrateBasket();
    expect(useBasket.getState().hydrated).toBe(true);
    useBasket.getState().add("07-plaid-blanket");
    expect(useBasket.getState().lines).toHaveLength(1);
    warn.mockRestore();
  });
});
