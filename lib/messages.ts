import { z } from "zod";
import en from "@/content/messages/en.json";
import pl from "@/content/messages/pl.json";
import type { Locale } from "./i18n";

const text = z.string().trim().min(1);
const room = z.strictObject({ title: text, description: text, alt: text });

/** Strict on purpose: a key missing from one language fails validation. */
export const messagesSchema = z.strictObject({
  meta: z.strictObject({
    siteName: text,
    title: text,
    description: text,
  }),
  gate: z.strictObject({
    heading: text,
    intro: text,
    posterAlt: text,
  }),
  header: z.strictObject({
    home: text,
    language: text,
    sound: text,
    soundOff: text,
    moons: text.includes("{found}").includes("{total}"),
    basket: text.includes("{count}"),
  }),
  square: z.strictObject({
    heading: text,
    intro: text,
    tagline: text,
    wander: text,
    useSignpost: text,
    signpost: text,
    arms: z.strictObject({ cafe: text, barn: text, haunt: text }),
    board: text,
  }),
  visit: z.strictObject({
    title: text,
    description: text,
    board: text,
    close: text,
    map: text,
    drawings: text,
  }),
  rooms: z.strictObject({
    back: text,
    plaque: text.includes("{n}"),
    corridor: text,
    swipe: text,
    cafe: room,
    barn: room,
    haunt: room,
  }),
});

export type Messages = z.infer<typeof messagesSchema>;

const catalog: Record<Locale, Messages> = {
  en: messagesSchema.parse(en),
  pl: messagesSchema.parse(pl),
};

export function getMessages(locale: Locale): Messages {
  return catalog[locale];
}

/** Fills `{name}` placeholders; unknown placeholders are left visible. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : whole,
  );
}
