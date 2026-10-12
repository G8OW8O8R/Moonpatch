import { describe, expect, it } from "vitest";
import data from "@/content/visit.json";
import { visit, visitCopy, visitSchema } from "./visit";

describe("visit", () => {
  it("validates the notice board's copy", () => {
    expect(visitSchema.safeParse(data).success).toBe(true);
    expect(visitSchema.safeParse({ ...data, extra: 1 }).success).toBe(false);
    expect(visitSchema.safeParse({ ...data, note: { ...data.note, href: "http://example.com" } }).success).toBe(false);
  });

  it("says plainly that the farm is made up, with a link to who made it", () => {
    expect(visitCopy("en").note.text).toContain("fictional farm");
    expect(visitCopy("pl").note.text).toContain("fikcyjna farma");
    expect(visit.note.href).toBe("https://www.govodigital.com");
  });

  it("speaks each language on its own", () => {
    expect(visitCopy("pl").hours.title).not.toBe(visitCopy("en").hours.title);
    expect(visitCopy("en").whatsOn.items).toHaveLength(3);
    expect(visitCopy("pl").map.gate).toBe("Brama");
  });

  it("keeps the square's moon behind the map", () => {
    expect(visit.moon).toEqual({ id: "square", hiddenBehind: "map" });
  });
});
