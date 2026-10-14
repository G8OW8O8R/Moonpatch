import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import data from "@/content/products.json";
import { catalogSchema, formatPrice, productById, products, productsIn } from "./products";

describe("product catalogue", () => {
  it("validates the content file", () => {
    expect(catalogSchema.safeParse(data).success).toBe(true);
  });

  it("stocks every building", () => {
    expect(productsIn("cafe")).toHaveLength(6);
    expect(productsIn("barn")).toHaveLength(6);
    expect(productsIn("haunt")).toHaveLength(7);
  });

  it("keeps recipe cards in the café", () => {
    for (const product of products.filter((p) => p.card === "recipe")) {
      expect(product.building).toBe("cafe");
    }
  });

  it("prices in the language's currency", () => {
    expect(formatPrice({ price: { usd: 6.5, pln: 24 } }, "en")).toBe("$6.50");
    expect(formatPrice({ price: { usd: 89, pln: 329 } }, "en")).toBe("$89");
    expect(formatPrice({ price: { usd: 6.5, pln: 24 } }, "pl").replace(/\s/g, " ")).toBe("24 zł");
    expect(formatPrice({ price: { usd: 6.5, pln: 24.5 } }, "pl").replace(/\s/g, " ")).toBe("24,50 zł");
  });

  it("finds a product by its id", () => {
    expect(productById("07-plaid-blanket")?.building).toBe("barn");
    expect(productById("nope")).toBeUndefined();
  });

  it("keeps what cannot travel for the visit", () => {
    const visit = products.filter((p) => p.fulfillment === "visit").map((p) => p.id);
    expect(visit).toEqual(["01-pumpkin-spice-latte", "02-cider-donuts", "03-cinnamon-rolls", "04-pumpkin-pie"]);
  });

  it("lists ingredients on recipe cards only", () => {
    const [recipe] = data.products;
    const tag = data.products.find((p) => p.card === "tag");
    const parse = (product: object) => catalogSchema.safeParse({ products: [product] }).success;
    expect(parse({ ...recipe, ingredients: undefined })).toBe(false);
    expect(parse({ ...tag, ingredients: { en: "wool", pl: "wełna" } })).toBe(false);
  });

  it.each(products.map((p) => [p.id, p.image] as const))("%s has AVIF and WebP photos", (_id, image) => {
    for (const ext of ["avif", "webp"]) {
      expect(existsSync(join(process.cwd(), "public", `${image}.${ext}`))).toBe(true);
    }
  });

  it("rejects duplicates, unknown buildings and broken prices", () => {
    const [first] = data.products;
    expect(first).toBeDefined();
    const broken = (patch: object) =>
      catalogSchema.safeParse({ products: [first, { ...first, ...patch }] }).success;

    expect(broken({})).toBe(false);
    expect(broken({ id: "99-x", image: "/products/99-x", building: "shop" })).toBe(false);
    expect(broken({ id: "99-x", image: "/products/99-x", price: { usd: 0, pln: 10 } })).toBe(false);
    expect(broken({ id: "99-x", image: "/products/99-x" })).toBe(true);
  });
});
