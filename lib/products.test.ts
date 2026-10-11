import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import data from "@/content/products.json";
import { catalogSchema, products, productsIn } from "./products";

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
