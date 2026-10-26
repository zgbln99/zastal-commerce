import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ShopClient from "../../sklep/ShopClient";
import { CATEGORY_SLUGS, categoryLabel, absolute } from "../../../lib/site";
import { getAllProducts } from "../../../lib/catalog-paths";
import { JsonLdScript, breadcrumbJsonLd, collectionJsonLd } from "../../../lib/json-ld";

export const dynamic = "force-dynamic";

const descriptions: Record<string, string> = {
  Koszulki: "Koszulki klubowe Zastalu Zielona Góra: kolekcje sezonowe, linie kibicowskie i nadruki zawodnicze. Sprawdź rozmiary i dostępność.",
  Bluzy: "Bluzy z kapturem Zastalu Zielona Góra: klasyczna bluza z logo i kolekcja Retro. Rozmiary S–XXL.",
  Akcesoria: "Akcesoria Zastalu Zielona Góra: worek sportowy, breloki i magnesy. Drobne klubowe akcenty na co dzień.",
  Dzieci: "Koszulki dziecięce Zastalu Zielona Góra w rozmiarach 116–164 dla najmłodszych kibiców.",
};

export function generateStaticParams() { return Object.keys(CATEGORY_SLUGS).map(slug => ({ slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = CATEGORY_SLUGS[slug];
  if (!category) return { title: "Kategoria", robots: { index: false } };
  const title = categoryLabel(category);
  return { title, description: descriptions[category], alternates: { canonical: absolute("/kategoria/" + slug) }, openGraph: { title: `${title} · Zastal Store`, description: descriptions[category], type: "website", url: absolute("/kategoria/" + slug) } };
}

/** One address per category, so each can rank and be linked on its own; the listing itself is the shared catalogue client. */
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = CATEGORY_SLUGS[slug];
  if (!category) notFound();
  const products = (await getAllProducts()).filter(p => p.category === category);
  return <>
    <JsonLdScript data={[breadcrumbJsonLd([{ name: "Strona główna", path: "/" }, { name: "Sklep", path: "/sklep" }, { name: categoryLabel(category) }]), collectionJsonLd(categoryLabel(category), "/kategoria/" + slug, products)]}/>
    <Suspense fallback={<div className="container page-heading"><h1>{categoryLabel(category)}</h1><p>Wczytujemy katalog…</p></div>}><ShopClient fixedCategory={category}/></Suspense>
  </>;
}
