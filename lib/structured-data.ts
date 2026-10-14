/**
 * Structured data for search engines: the farm as a store on its front page,
 * and each building's products with their demo prices on the building's page.
 */
import { type Locale } from "./i18n";
import { type Building, type Product, productsIn } from "./products";
import { placePath } from "./routes";

type Thing = Record<string, unknown>;

const absolute = (path: string, base: URL) => new URL(path, base).href;

export function storeData(lang: Locale, base: URL, copy: { name: string; description: string }): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": absolute(`${placePath(lang, "square")}#store`, base),
    name: copy.name,
    description: copy.description,
    url: absolute(placePath(lang, "square"), base),
    image: absolute("/img/og/gate.jpg", base),
    logo: absolute("/img/icons/icon-512.png", base),
    inLanguage: lang,
    currenciesAccepted: lang === "pl" ? "PLN" : "USD",
  };
}

export function productData(product: Product, lang: Locale, base: URL, storeName: string): Thing {
  const url = absolute(placePath(lang, product.building), base);
  return {
    "@type": "Product",
    "@id": `${url}#${product.id}`,
    sku: product.id,
    name: product.name[lang],
    description: product.description[lang],
    image: absolute(`${product.image}.webp`, base),
    brand: { "@type": "Brand", name: storeName },
    offers: {
      "@type": "Offer",
      url,
      price: (lang === "pl" ? product.price.pln : product.price.usd).toFixed(2),
      priceCurrency: lang === "pl" ? "PLN" : "USD",
      availability: "https://schema.org/InStock",
    },
  };
}

/** A building's page: its products, in the catalogue's order. */
export function buildingData(building: Building, lang: Locale, base: URL, storeName: string): Thing {
  return {
    "@context": "https://schema.org",
    "@graph": productsIn(building).map((product) => productData(product, lang, base, storeName)),
  };
}

/** JSON for a script tag: nothing in it can close the tag. */
export const jsonLd = (data: Thing) => JSON.stringify(data).replace(/</g, "\\u003c");
