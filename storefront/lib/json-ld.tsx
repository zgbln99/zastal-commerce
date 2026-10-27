import { absolute, categoryPath, categoryLabel, siteOrigin, SITE_NAME, STORE_DESCRIPTION } from "./site";
import { priceString } from "./money";
import { productPath } from "./commerce.mjs";

type JsonLd = Record<string, unknown>;
export type LdProduct = { id: number; slug?: string; name: string; sku: string; category: string; price: number; subtitle?: string; description?: string; image?: string; images?: { url: string }[]; preorder?: boolean; variants?: { stock: number }[] };

/** Renders structured data; `<` is escaped so a product name can never close the script. */
export function JsonLdScript({ data }: { data: JsonLd | JsonLd[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}/>;
}

export const firstParagraph = (text: string) => (text || "").split("\n").map(line => line.trim()).find(line => line && !line.startsWith("#") && !line.startsWith("-")) || "";

export function productJsonLd(product: LdProduct, live: boolean): JsonLd {
  const images = product.images?.length ? product.images.map(img => absolute(img.url)) : product.image ? [absolute(product.image)] : undefined;
  const data: JsonLd = {
    "@context": "https://schema.org", "@type": "Product", name: product.name, sku: product.sku, category: product.category,
    description: firstParagraph(product.description || "") || product.subtitle || undefined, image: images,
    brand: { "@type": "Brand", name: "Zastal Zielona Góra" },
  };
  // Offers only while online sales are open: no price claims before launch.
  if (live && Number.isSafeInteger(product.price) && product.price > 0) {
    data.offers = { "@type": "Offer", url: absolute(productPath(product)), priceCurrency: "PLN", price: priceString(product.price), itemCondition: "https://schema.org/NewCondition",
      availability: product.preorder ? "https://schema.org/PreOrder" : (product.variants || []).some(v => v.stock > 0) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" };
  }
  return data;
}

export function breadcrumbJsonLd(items: { name: string; path?: string }[]): JsonLd {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, ...(item.path ? { item: absolute(item.path) } : {}) })) };
}

export const productBreadcrumbJsonLd = (product: LdProduct) => breadcrumbJsonLd([{ name: "Strona główna", path: "/" }, { name: "Sklep", path: "/sklep" }, { name: categoryLabel(product.category), path: categoryPath(product.category) }, { name: product.name }]);

export function storeJsonLd(seller?: { name?: string; email?: string; phone?: string } | null): JsonLd[] {
  const origin = siteOrigin();
  return [
    { "@context": "https://schema.org", "@type": "Organization", name: seller?.name || SITE_NAME, url: origin, logo: absolute("/assets/zastal-logo.svg"), ...(seller?.email ? { email: seller.email } : {}), ...(seller?.phone ? { telephone: seller.phone } : {}) },
    { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: origin, description: STORE_DESCRIPTION,
      potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${origin}/szukaj?q={search_term_string}` }, "query-input": "required name=search_term_string" } },
  ];
}

export function collectionJsonLd(name: string, path: string, products: LdProduct[]): JsonLd {
  return { "@context": "https://schema.org", "@type": "CollectionPage", name, url: absolute(path),
    mainEntity: { "@type": "ItemList", numberOfItems: products.length, itemListElement: products.map((p, index) => ({ "@type": "ListItem", position: index + 1, name: p.name, url: absolute(productPath(p)) })) } };
}
