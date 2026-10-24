import type { MetadataRoute } from "next";
import { storeStatus, publicCatalog } from "../lib/store-status";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env.ZASTAL_SITE_ORIGIN || "https://zastalstore.51-15-21-164.sslip.io";
  if (!(await storeStatus()).live) return [];
  const products = await publicCatalog();
  return [
    { url: origin + "/", changeFrequency: "daily", priority: 1 },
    { url: origin + "/sklep", changeFrequency: "daily", priority: 0.9 },
    { url: origin + "/zawodnicy", changeFrequency: "weekly", priority: 0.5 },
    { url: origin + "/karta-podarunkowa", changeFrequency: "monthly", priority: 0.5 },
    { url: origin + "/pomoc", changeFrequency: "monthly", priority: 0.3 },
    ...products.map(product => ({ url: `${origin}/produkt/${product.id}`, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
