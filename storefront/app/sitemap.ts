import type { MetadataRoute } from "next";
import { storeStatus } from "../lib/store-status";
import { getAllProducts, categoryPaths } from "../lib/catalog-paths";
import { siteOrigin } from "../lib/site";

export const dynamic = "force-dynamic";

/** Canonical addresses only: product slugs, category pages and the public info pages. Empty before launch. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  if (!(await storeStatus()).live) return [];
  const products = await getAllProducts();
  return [
    { url: origin + "/", changeFrequency: "daily", priority: 1 },
    { url: origin + "/sklep", changeFrequency: "daily", priority: 0.9 },
    ...categoryPaths().map(path => ({ url: origin + path, changeFrequency: "weekly" as const, priority: 0.8 })),
    { url: origin + "/zawodnicy", changeFrequency: "weekly", priority: 0.5 },
    { url: origin + "/karta-podarunkowa", changeFrequency: "monthly", priority: 0.5 },
    { url: origin + "/kontakt", changeFrequency: "monthly", priority: 0.4 },
    { url: origin + "/pomoc", changeFrequency: "monthly", priority: 0.3 },
    ...products.map(product => ({ url: origin + product.path, changeFrequency: "weekly" as const, priority: 0.7, images: product.images.length ? product.images.map(img => origin + img.url) : undefined })),
  ];
}
