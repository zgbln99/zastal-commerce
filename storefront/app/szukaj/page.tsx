import type { Metadata } from "next";
import { Suspense } from "react";
import ShopClient from "../sklep/ShopClient";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `Szukaj: ${q}` : "Szukaj", description: q ? `Wyniki wyszukiwania „${q}” w sklepie Zastalu Zielona Góra.` : "Szukaj produktów w sklepie Zastalu Zielona Góra.", robots: { index: false, follow: true } };
}

/** Search results live on their own, unindexed address; the header and the mobile dialog send here. */
export default function SearchPage() {
  return <Suspense fallback={<div className="container page-heading"><h1>Szukaj w sklepie</h1><p>Wczytujemy katalog…</p></div>}><ShopClient searchMode/></Suspense>;
}
