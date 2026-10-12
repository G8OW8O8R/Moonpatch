import { z } from "zod";
import data from "@/content/visit.json";
import type { Locale } from "./i18n";

const text = z.string().trim().min(1);
const localized = z.strictObject({ en: text, pl: text });

/** The cards pinned to the notice board; one of them hides a moon. */
export const cards = ["hours", "whatsOn", "map", "drawings", "note"] as const;

export const visitSchema = z.strictObject({
  hours: z.strictObject({ title: localized, lines: z.array(localized).min(1) }),
  whatsOn: z.strictObject({ title: localized, items: z.array(localized).min(1) }),
  map: z.strictObject({ gate: localized, road: localized, farm: localized }),
  note: z.strictObject({ text: localized, link: localized, href: z.url({ protocol: /^https$/ }) }),
  moon: z.strictObject({ id: z.string().regex(/^[a-z]+$/), hiddenBehind: z.enum(cards) }),
});

export type VisitContent = z.infer<typeof visitSchema>;

export const visit: VisitContent = visitSchema.parse(data);

/** The board's copy in one language. */
export function visitCopy(lang: Locale) {
  const pick = (value: { en: string; pl: string }) => value[lang];
  return {
    hours: { title: pick(visit.hours.title), lines: visit.hours.lines.map(pick) },
    whatsOn: { title: pick(visit.whatsOn.title), items: visit.whatsOn.items.map(pick) },
    map: { gate: pick(visit.map.gate), road: pick(visit.map.road), farm: pick(visit.map.farm) },
    note: { text: pick(visit.note.text), link: pick(visit.note.link), href: visit.note.href },
    moon: visit.moon,
  };
}

export type VisitCopy = ReturnType<typeof visitCopy>;
