/** Every public catalogue address, for the sitemap, llms.txt and prerender lists. Server-side only; never throws. */
import { CATEGORY_SLUGS } from "./site";
import { productPath } from "./commerce.mjs";

const backend = () => process.env.ZASTAL_CMS_API || "http://127.0.0.1:8880";
export type CatalogEntry = { id: number; slug: string; sku: string; name: string; category: string; price: number; subtitle: string; image: string; images: { url: string }[]; description: string; path: string; verified: boolean; variants: { stock: number }[]; preorder: boolean; meta_title: string; meta_description: string };

export async function getAllProducts(): Promise<CatalogEntry[]> {
  try {
    const response = await fetch(backend() + "/api/catalog", { cache: "no-store", signal: AbortSignal.timeout(2500) });
    if (!response.ok) return [];
    const rows = await response.json();
    if (!Array.isArray(rows)) return [];
    return rows.filter(row => Number.isSafeInteger(row?.id) && row.id > 0).map(row => ({
      id: row.id, slug: typeof row.slug === "string" ? row.slug : "", sku: String(row.sku || ""), name: String(row.name || ""), category: String(row.category || ""), price: Number.isSafeInteger(row.price) ? row.price : 0,
      subtitle: String(row.subtitle || ""), image: String(row.image || ""), images: Array.isArray(row.images) ? row.images.filter((img: { url?: string }) => typeof img?.url === "string") : [],
      description: String(row.description || ""), path: productPath(row), verified: true, variants: Array.isArray(row.variants) ? row.variants : [], preorder: row.preorder === true,
      meta_title: String(row.meta_title || ""), meta_description: String(row.meta_description || ""),
    }));
  } catch { return []; }
}

export type ProductLookup = { kind: "ok"; item: CatalogEntry } | { kind: "missing" } | { kind: "unavailable" };

/** One product by slug or id: a 404 from the API is "missing", anything else that fails is "unavailable". */
export async function getProduct(handle: string): Promise<ProductLookup> {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(handle)) return { kind: "missing" };
  try {
    const response = await fetch(`${backend()}/api/catalog/${handle}`, { cache: "no-store", signal: AbortSignal.timeout(2500) });
    if (response.status === 404) return { kind: "missing" };
    if (!response.ok) return { kind: "unavailable" };
    const item = mapOne(await response.json());
    return item ? { kind: "ok", item } : { kind: "unavailable" };
  } catch { return { kind: "unavailable" }; }
}

function mapOne(row: Record<string, unknown>): CatalogEntry | null {
  if (!Number.isSafeInteger(row?.id)) return null;
  const r = row as { id: number; slug?: string; sku?: string; name?: string; category?: string; price?: number; subtitle?: string; image?: string; images?: { url: string }[]; description?: string; variants?: { stock: number }[]; preorder?: boolean; };
  return { id: r.id, slug: typeof r.slug === "string" ? r.slug : "", sku: String(r.sku || ""), name: String(r.name || ""), category: String(r.category || ""), price: Number.isSafeInteger(r.price) ? (r.price as number) : 0, subtitle: String(r.subtitle || ""), image: String(r.image || ""),
    images: Array.isArray(r.images) ? r.images.filter(img => typeof img?.url === "string") : [], description: String(r.description || ""), path: productPath(r), verified: true, variants: Array.isArray(r.variants) ? r.variants : [], preorder: r.preorder === true, meta_title: String((row as { meta_title?: string }).meta_title || ""), meta_description: String((row as { meta_description?: string }).meta_description || "") };
}

export const categoryPaths = () => Object.keys(CATEGORY_SLUGS).map(slug => "/kategoria/" + slug);
