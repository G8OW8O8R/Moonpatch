import { z } from "zod";
import data from "@/content/products.json";

const text = z.string().trim().min(1);
const localized = z.strictObject({ en: text, pl: text });
const productId = z.string().regex(/^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const buildings = ["cafe", "barn", "haunt"] as const;
export type Building = (typeof buildings)[number];

export const productSchema = z.strictObject({
  id: productId,
  building: z.enum(buildings),
  card: z.enum(["recipe", "tag"]),
  /** Path without extension; AVIF and WebP live side by side. */
  image: z.string().regex(/^\/products\/\d{2}-[a-z0-9-]+$/),
  price: z.strictObject({
    usd: z.number().positive().multipleOf(0.01),
    pln: z.number().positive().multipleOf(0.01),
  }),
  name: localized,
  description: localized,
});

export const catalogSchema = z
  .strictObject({ products: z.array(productSchema).min(1) })
  .superRefine(({ products }, ctx) => {
    const seen = new Set<string>();
    products.forEach((product, index) => {
      if (seen.has(product.id)) {
        ctx.addIssue({ code: "custom", path: ["products", index, "id"], message: `Duplicate id ${product.id}` });
      }
      seen.add(product.id);
      if (product.image !== `/products/${product.id}`) {
        ctx.addIssue({ code: "custom", path: ["products", index, "image"], message: "Image must match the id" });
      }
    });
  });

export type Product = z.infer<typeof productSchema>;

export const products: readonly Product[] = catalogSchema.parse(data).products;

export function productsIn(building: Building): Product[] {
  return products.filter((product) => product.building === building);
}
