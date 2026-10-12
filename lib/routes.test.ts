import { describe, expect, it } from "vitest";
import { placeAlternates, placeAt, placePath, routeFor, switchLanguage } from "./routes";

describe("places", () => {
  it("gives every place an address in both languages", () => {
    expect(placePath("en", "square")).toBe("/en");
    expect(placePath("en", "cafe")).toBe("/en/cafe");
    expect(placePath("pl", "cafe")).toBe("/pl/kawiarnia");
    expect(placePath("pl", "barn")).toBe("/pl/stodola");
    expect(placePath("pl", "haunt")).toBe("/pl/straszydla");
    expect(placePath("pl", "visit")).toBe("/pl/odwiedz-nas");
  });

  it("reads a place back from its address", () => {
    expect(placeAt("/pl/odwiedz-nas")).toEqual({ lang: "pl", place: "visit" });
    expect(placeAt("/en/visit/")).toEqual({ lang: "en", place: "visit" });
    expect(placeAt("/pl")).toEqual({ lang: "pl", place: "square" });
    expect(placeAt("/pl/visit")).toEqual({ lang: "pl", place: "visit" });
    expect(placeAt("/en/kawiarnia")).toBeNull();
    expect(placeAt("/de/cafe")).toBeNull();
  });
});

describe("routeFor", () => {
  it("rewrites Polish addresses onto the pages", () => {
    expect(routeFor("/pl/kawiarnia")).toEqual({ rewrite: "/pl/cafe" });
    expect(routeFor("/pl/odwiedz-nas")).toEqual({ rewrite: "/pl/visit" });
  });

  it("sends English page names under /pl to their Polish addresses", () => {
    expect(routeFor("/pl/cafe")).toEqual({ redirect: "/pl/kawiarnia" });
    expect(routeFor("/pl/visit")).toEqual({ redirect: "/pl/odwiedz-nas" });
  });

  it("leaves everything else alone", () => {
    expect(routeFor("/pl")).toBeNull();
    expect(routeFor("/en/cafe")).toBeNull();
    expect(routeFor("/pl/lab/gate")).toBeNull();
  });
});

describe("switchLanguage", () => {
  it("lands on the same place in the other language", () => {
    expect(switchLanguage("/en/cafe", "pl")).toBe("/pl/kawiarnia");
    expect(switchLanguage("/pl/odwiedz-nas", "en")).toBe("/en/visit");
    expect(switchLanguage("/pl", "en")).toBe("/en");
  });

  it("keeps the path of anything that is not a place", () => {
    expect(switchLanguage("/en/lab/gate", "pl")).toBe("/pl/lab/gate");
  });

  it("lists hreflang alternates with an English default", () => {
    expect(placeAlternates("cafe", ["en", "pl"], "en")).toEqual({
      en: "/en/cafe",
      pl: "/pl/kawiarnia",
      "x-default": "/en/cafe",
    });
  });
});
