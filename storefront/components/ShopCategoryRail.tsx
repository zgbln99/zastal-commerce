"use client";
import { ArrowUpRight } from "lucide-react";
import type { Product } from "../lib/commerce.mjs";
import { ProductImage } from "./ProductCard";

const groups = [
  { key: "Koszulki", title: "Koszulki", number: "01", sku: 10 },
  { key: "Bluzy", title: "Bluzy", number: "02", sku: 2 },
  { key: "Akcesoria", title: "Akcesoria", number: "03", sku: 8 },
  { key: "Dzieci", title: "Dla dzieci", number: "04", sku: 9 },
] as const;

export default function ShopCategoryRail({
  category, products, onChoose
}: {
  category: string;
  products: Product[];
  onChoose: (category: string) => void;
}) {
  return <section className="shop-category-section" aria-label="Wybierz kategorię produktów">
    <div className="shop-category-header"><div><span>ODKRYJ KOLEKCJĘ</span><p>Znajdź to, czego szukasz.</p></div><button onClick={() => onChoose("")} className={!category ? "current" : ""}>Wszystkie produkty <ArrowUpRight size={15}/></button></div>
    <div className="shop-category-rail">{groups.map(group => {
      const p = products.find(x => x.id === group.sku) || products.find(x => x.category === group.key);
      const selected = category === group.key;
      return <button key={group.key} className={"shop-category-tile " + (selected ? "selected" : "")} onClick={() => onChoose(selected ? "" : group.key)} aria-pressed={selected}>
        <span className="shop-category-image">{p && <ProductImage product={p} eager/>}</span>
        <span className="shop-category-label"><small>{group.number} / {products.filter(x => x.category === group.key).length} PRODUKTÓW</small><strong>{group.title}</strong></span>
        <span className="shop-category-arrow"><ArrowUpRight size={16}/></span>
      </button>;
    })}</div><p className="shop-category-scroll-hint">Przesuń, aby zobaczyć kolejne kategorie →</p>
  </section>;
}
