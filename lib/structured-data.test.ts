import { describe, expect, it } from "vitest";
import { productsIn } from "./products";
import { buildingData, jsonLd, productData, storeData } from "./structured-data";

const base = new URL("https://farm.example");

describe("structured data", () => {
  it("names the store at the language's front page", () => {
    const store = storeData("pl", base, { name: "Moonpatch Farm", description: "d" });
    expect(store["@type"]).toBe("Store");
    expect(store.url).toBe("https://farm.example/pl");
    expect(store.currenciesAccepted).toBe("PLN");
  });

  it("prices a product in the language's currency at its building's address", () => {
    const [latte] = productsIn("cafe");
    if (!latte) throw new Error("no café products");
    const offer = productData(latte, "pl", base, "Moonpatch Farm").offers as Record<string, string>;
    expect(offer.priceCurrency).toBe("PLN");
    expect(offer.price).toBe(latte.price.pln.toFixed(2));
    expect(offer.url).toBe("https://farm.example/pl/kawiarnia");
  });

  it("lists every product of a building", () => {
    const graph = buildingData("haunt", "en", base, "Moonpatch Farm")["@graph"] as unknown[];
    expect(graph).toHaveLength(productsIn("haunt").length);
  });

  it("cannot close its script tag", () => {
    expect(jsonLd({ name: "</script><b>" })).not.toContain("</");
  });
});
