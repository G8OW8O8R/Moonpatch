import { describe, expect, it } from "vitest";
import { isLocale, localeFromAcceptLanguage, splitLocale, switchLocalePath } from "./i18n";

describe("localeFromAcceptLanguage", () => {
  it.each([
    [null, "en"],
    ["", "en"],
    ["pl", "pl"],
    ["pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7", "pl"],
    ["en-US,en;q=0.9,pl;q=0.8", "en"],
    ["de-DE,de;q=0.9", "en"],
    ["de-DE,pl;q=0.5", "pl"],
    ["en;q=0.4,pl;q=0.6", "pl"],
    ["pl;q=0", "en"],
    ["*", "en"],
    ["PL-pl", "pl"],
  ] as const)("%j → %s", (header, expected) => {
    expect(localeFromAcceptLanguage(header)).toBe(expected);
  });
});

describe("locale paths", () => {
  it("recognises only supported locales", () => {
    expect(isLocale("pl")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("splits the locale prefix", () => {
    expect(splitLocale("/pl")).toEqual({ locale: "pl", rest: "" });
    expect(splitLocale("/en/cafe")).toEqual({ locale: "en", rest: "/cafe" });
    expect(splitLocale("/")).toEqual({ locale: null, rest: "" });
    expect(splitLocale("/english/cafe")).toEqual({ locale: null, rest: "/english/cafe" });
  });

  it("switches language and keeps the rest of the path", () => {
    expect(switchLocalePath("/en", "pl")).toBe("/pl");
    expect(switchLocalePath("/en/", "pl")).toBe("/pl");
    expect(switchLocalePath("/pl/cafe", "en")).toBe("/en/cafe");
    expect(switchLocalePath("/", "pl")).toBe("/pl");
  });
});
