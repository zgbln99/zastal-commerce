import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import ProductDetail from "./ProductDetail";
import { storeStatus } from "../../../lib/store-status";
import { getProduct, type CatalogEntry } from "../../../lib/catalog-paths";
import ProductUnavailable from "./ProductUnavailable";
import { JsonLdScript, firstParagraph, productBreadcrumbJsonLd, productJsonLd} from "../../../lib/json-ld";
import { absolute } from "../../../lib/site";

const isId = (handle: string) => /^[1-9][0-9]{0,8}$/.test(handle);

/** Current catalogue entry by slug or id. "missing" is a real 404; "unavailable" means the API did not answer and the client renders from its own catalogue. */
async function resolve(handle: string): Promise<{ kind: "ok"; item: CatalogEntry } | { kind: "missing" } | { kind: "unavailable" }> {
  return getProduct(handle);
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const resolved = await resolve(handle);
  if (resolved.kind !== "ok") return { title: "Produkt", description: "Odzież i akcesoria Zastalu Zielona Góra", robots: { index: false, follow: true } };
  const item = resolved.item;
  const image = item.images[0]?.url || item.image || "";
  const title = item.meta_title || item.name;
  const description = item.meta_description || [firstParagraph(item.description) || item.subtitle, "Oficjalny sklep Zastalu Zielona Góra."].filter(Boolean).join(" ");
  const canonical = absolute(item.path);
  return { title, description, alternates: { canonical }, openGraph: { title, description, type: "website", url: canonical, images: image ? [{ url: absolute(image), alt: item.name }] : [] }, twitter: { card: image ? "summary_large_image" : "summary", title, description } };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ handle }, query] = await Promise.all([params, searchParams]);
  const resolved = await resolve(handle);
  if (resolved.kind === "missing") notFound();
  if (resolved.kind === "unavailable") return <ProductUnavailable handle={handle}/>;
  const item = resolved.item;
  // Old numeric links keep working and move to the slug address for good; the query (e.g. ?zawodnik=) rides along.
  if (isId(handle) && item.slug && item.slug !== handle) {
    const qs = new URLSearchParams(Object.entries(query).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : Array.isArray(value) ? value.map(v => [key, v]) : [])).toString();
    permanentRedirect("/produkt/" + item.slug + (qs ? "?" + qs : ""));
  }
  const status = await storeStatus();
  return <>
    <JsonLdScript data={[productBreadcrumbJsonLd(item), productJsonLd(item, status.live)]}/>
    <ProductDetail key={item.id} productId={item.id}/>
  </>;
}
