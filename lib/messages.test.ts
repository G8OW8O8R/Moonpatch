import { describe, expect, it } from "vitest";
import en from "@/content/messages/en.json";
import pl from "@/content/messages/pl.json";
import { format, getMessages, messagesSchema } from "./messages";

describe("messages", () => {
  it("validates both languages", () => {
    expect(messagesSchema.safeParse(en).success).toBe(true);
    expect(messagesSchema.safeParse(pl).success).toBe(true);
  });

  it("rejects a dictionary with a missing or extra key", () => {
    const { header, ...withoutHeader } = en;
    expect(messagesSchema.safeParse(withoutHeader).success).toBe(false);
    expect(messagesSchema.safeParse({ ...en, header: { ...header, extra: "x" } }).success).toBe(false);
  });

  it("actually translates the interface", () => {
    expect(getMessages("pl").header.sound).not.toBe(getMessages("en").header.sound);
  });
});

describe("format", () => {
  it("fills placeholders", () => {
    expect(format("{found} of {total} moons found", { found: 0, total: 4 })).toBe("0 of 4 moons found");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(format("W taczce: {count}", {})).toBe("W taczce: {count}");
  });
});
