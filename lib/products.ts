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
  /** Shipped home, or kept at the farm for the visit (what cannot travel: coffee with milk, pastry). */
  fulfillment: z.enum(["ship", "visit"]),
  /** Path without extension; AVIF and WebP live side by side. */
  image: z.string().regex(/^\/products\/\d{2}-[a-z0-9-]+$/),
  price: z.strictObject({
    usd: z.number().positive().multipleOf(0.01),
    pln: z.number().positive().multipleOf(0.01),
  }),
  name: localized,
  description: localized,
  /** What goes into it, as one hand-written line; recipe cards only. */
  ingredients: localized.optional(),
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
      if ((product.card === "recipe") !== !!product.ingredients) {
        ctx.addIssue({ code: "custom", path: ["products", index, "ingredients"], message: "Recipe cards, and only they, list ingredients" });
      }
      if (product.image !== `/products/${product.id}`) {
        ctx.addIssue({ code: "custom", path: ["products", index, "image"], message: "Image must match the id" });
      }
    });
  });

export type Product = z.infer<typeof productSchema>;

export const products: readonly Product[] = catalogSchema.parse(data).products;

/** An amount in the language's currency: dollars in English, złoty in Polish; whole amounts without the cents. */
export function formatMoney(cents: number, lang: "en" | "pl"): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(lang === "pl" ? "pl-PL" : "en-US", {
    style: "currency",
    currency: lang === "pl" ? "PLN" : "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** A product's demo price in cents of the language's currency. */
export const priceCents = (product: Pick<Product, "price">, lang: "en" | "pl") =>
  Math.round((lang === "pl" ? product.price.pln : product.price.usd) * 100);

/** A demo price in the language's currency. */
export function formatPrice(product: Pick<Product, "price">, lang: "en" | "pl"): string {
  return formatMoney(priceCents(product, lang), lang);
}

export const productById = (id: string): Product | undefined => products.find((product) => product.id === id);

export function productsIn(building: Building): Product[] {
  return products.filter((product) => product.building === building);
}
