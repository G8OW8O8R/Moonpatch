/**
 * The wheelbarrow: what the visitor picked up, how many of each, and the day
 * they mean to come by for what waits at the farm. A demo shop: amounts are
 * only ever added up, nothing is charged.
 */
import { z } from "zod";
import type { Locale } from "./i18n";
import { type Product, priceCents, productById } from "./products";

export { formatMoney } from "./products";

/** More than a family carries home from a farm shop. */
export const MAX_QTY = 12;

export interface BasketLine {
  id: string;
  qty: number;
}

export interface BasketState {
  lines: BasketLine[];
  /** ISO date (yyyy-mm-dd) of the visit, for what waits at the farm. */
  visitDay: string | null;
}

export const emptyBasket: BasketState = { lines: [], visitDay: null };

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** As stored: anything unreadable falls back to an empty wheelbarrow. */
const storedSchema = z.object({
  lines: z.array(z.object({ id: z.string(), qty: z.number().int() })),
  visitDay: isoDay.nullable(),
});

const clampQty = (qty: number) => Math.min(MAX_QTY, Math.max(0, Math.round(qty)));

/**
 * What a stored wheelbarrow can still hold: products that exist, each once,
 * in sensible amounts, and a visit day that can still be picked (`days`).
 */
export function readBasket(stored: unknown, days: readonly string[]): BasketState {
  const parsed = storedSchema.safeParse(stored);
  if (!parsed.success) return emptyBasket;
  const lines: BasketLine[] = [];
  for (const { id, qty } of parsed.data.lines) {
    const q = clampQty(qty);
    if (q === 0 || !productById(id)) continue;
    const same = lines.find((line) => line.id === id);
    if (same) same.qty = clampQty(same.qty + q);
    else lines.push({ id, qty: q });
  }
  const visitDay = parsed.data.visitDay && days.includes(parsed.data.visitDay) ? parsed.data.visitDay : null;
  return { lines, visitDay };
}

/** One more of a product; a new line goes at the end. */
export function addItem(lines: readonly BasketLine[], id: string): BasketLine[] {
  if (!productById(id)) return [...lines];
  const at = lines.findIndex((line) => line.id === id);
  if (at < 0) return [...lines, { id, qty: 1 }];
  return lines.map((line, i) => (i === at ? { ...line, qty: clampQty(line.qty + 1) } : line));
}

/** Sets a line's amount; at zero the line goes. */
export function setQty(lines: readonly BasketLine[], id: string, qty: number): BasketLine[] {
  const q = clampQty(qty);
  return q === 0 ? lines.filter((line) => line.id !== id) : lines.map((line) => (line.id === id ? { ...line, qty: q } : line));
}

export const itemCount = (lines: readonly BasketLine[]) => lines.reduce((sum, line) => sum + line.qty, 0);

export interface PricedLine extends BasketLine {
  product: Product;
  /** Line total in the language's currency, in cents. */
  cents: number;
}

export interface Section {
  lines: PricedLine[];
  cents: number;
}

/** The two halves of the wheelbarrow: shipped home, and kept at the farm for the visit. */
export interface Sections {
  ship: Section;
  visit: Section;
  cents: number;
}

export function sections(lines: readonly BasketLine[], lang: Locale): Sections {
  const out: Sections = { ship: { lines: [], cents: 0 }, visit: { lines: [], cents: 0 }, cents: 0 };
  for (const line of lines) {
    const product = productById(line.id);
    if (!product) continue;
    const cents = priceCents(product, lang) * line.qty;
    const section = out[product.fulfillment];
    section.lines.push({ ...line, product, cents });
    section.cents += cents;
    out.cents += cents;
  }
  return out;
}

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** Fridays, Saturdays and Sundays of one October. */
function octoberWeekends(year: number): string[] {
  const days: string[] = [];
  for (let day = 1; day <= 31; day++) {
    const weekday = new Date(Date.UTC(year, 9, day)).getUTCDay();
    if (weekday === 5 || weekday === 6 || weekday === 0) days.push(iso(year, 9, day));
  }
  return days;
}

/**
 * The days the farm is open for a visit, from `today` on: the weekends
 * (Friday to Sunday) of this October, or next year's once it has gone.
 */
export function visitDays(today: Date): string[] {
  const now = iso(today.getFullYear(), today.getMonth(), today.getDate());
  const left = octoberWeekends(today.getFullYear()).filter((day) => day >= now);
  return left.length ? left : octoberWeekends(today.getFullYear() + 1);
}

/** A visit day as it is read: "Fri, Oct 16" / "pt., 16 paź". */
export function formatDay(day: string, lang: Locale, style: "short" | "long" = "short"): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(lang === "pl" ? "pl-PL" : "en-US", {
    weekday: style,
    day: "numeric",
    month: style,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
