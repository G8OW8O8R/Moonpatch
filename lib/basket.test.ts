import { describe, expect, it } from "vitest";
import { MAX_QTY, addItem, formatDay, formatMoney, itemCount, readBasket, sections, setQty, visitDays } from "./basket";

const days = visitDays(new Date(2026, 9, 14));

describe("visit days", () => {
  it("are the Fridays to Sundays of October still ahead", () => {
    expect(days[0]).toBe("2026-10-16");
    expect(days).toEqual(["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-30", "2026-10-31"]);
  });

  it("move on to next October once this one is over", () => {
    const later = visitDays(new Date(2026, 10, 3));
    expect(later[0]).toBe("2027-10-01");
    expect(later.every((day) => day.startsWith("2027-10"))).toBe(true);
    expect(visitDays(new Date(2026, 1, 1))[0]).toBe("2026-10-02");
  });

  it("read as a short date in each language", () => {
    expect(formatDay("2026-10-17", "en")).toBe("Sat, Oct 17");
    expect(formatDay("2026-10-17", "pl")).toMatch(/^sob\.?, 17 paź/);
  });
});

describe("lines", () => {
  it("add one at a time, a new product at the end", () => {
    let lines = addItem([], "07-plaid-blanket");
    lines = addItem(lines, "01-pumpkin-spice-latte");
    lines = addItem(lines, "07-plaid-blanket");
    expect(lines).toEqual([
      { id: "07-plaid-blanket", qty: 2 },
      { id: "01-pumpkin-spice-latte", qty: 1 },
    ]);
    expect(itemCount(lines)).toBe(3);
  });

  it("ignore products that do not exist", () => {
    expect(addItem([], "99-ghost")).toEqual([]);
  });

  it("stop at the most one carries, and go at zero", () => {
    expect(setQty([{ id: "07-plaid-blanket", qty: 1 }], "07-plaid-blanket", 50)).toEqual([{ id: "07-plaid-blanket", qty: MAX_QTY }]);
    expect(setQty([{ id: "07-plaid-blanket", qty: 1 }], "07-plaid-blanket", 0)).toEqual([]);
  });
});

describe("sections and sums", () => {
  const lines = [
    { id: "07-plaid-blanket", qty: 1 },
    { id: "01-pumpkin-spice-latte", qty: 2 },
  ];

  it("split what ships from what waits at the farm, in the language's currency", () => {
    const en = sections(lines, "en");
    expect(en.ship.lines.map((l) => l.id)).toEqual(["07-plaid-blanket"]);
    expect(en.visit.lines.map((l) => l.id)).toEqual(["01-pumpkin-spice-latte"]);
    expect(en.visit.cents).toBe(1300);
    expect(en.cents).toBe(en.ship.cents + en.visit.cents);
    const pl = sections(lines, "pl");
    expect(pl.visit.cents).toBe(4800);
  });

  it("are formatted as money, whole amounts without the cents", () => {
    expect(formatMoney(12350, "en")).toBe("$123.50");
    expect(formatMoney(8900, "en")).toBe("$89");
    expect(formatMoney(4800, "pl").replace(/\s/g, " ")).toBe("48 zł");
  });

  it("never pick up floating-point dust", () => {
    const many = sections([{ id: "01-pumpkin-spice-latte", qty: 3 }], "en");
    expect(Number.isInteger(many.cents)).toBe(true);
  });
});

describe("a saved wheelbarrow", () => {
  it("comes back as it was", () => {
    const saved = { lines: [{ id: "07-plaid-blanket", qty: 2 }], visitDay: "2026-10-17" };
    expect(readBasket(saved, days)).toEqual(saved);
  });

  it("drops what no longer makes sense", () => {
    const saved = {
      lines: [
        { id: "07-plaid-blanket", qty: 2 },
        { id: "99-ghost", qty: 1 },
        { id: "07-plaid-blanket", qty: 1 },
        { id: "01-pumpkin-spice-latte", qty: 0 },
        { id: "02-cider-donuts", qty: 400 },
      ],
      visitDay: "2026-10-01",
    };
    expect(readBasket(saved, days)).toEqual({
      lines: [
        { id: "07-plaid-blanket", qty: 3 },
        { id: "02-cider-donuts", qty: MAX_QTY },
      ],
      visitDay: null,
    });
  });

  it("is empty when it cannot be read", () => {
    for (const junk of [undefined, null, "lines", { lines: "x" }, { lines: [{ id: 3 }] }, { lines: [], visitDay: "tomorrow" }]) {
      expect(readBasket(junk, days)).toEqual({ lines: [], visitDay: null });
    }
  });
});
