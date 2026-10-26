"use client";
import { productUrl } from "../lib/urls.mjs";
import Link from "next/link";
import { ArrowUpRight, ChevronRight, PenLine, UserRound } from "lucide-react";
import { fmt } from "../lib/catalog";
import type { Product } from "../lib/commerce.mjs";
import { ProductImage } from "./ProductCard";

/**
 * Merchandising uses existing, verified catalog items.
 * No generated product imagery, invented prices or fictional print capabilities.
 */
export function PersonalizationEditorial({ product }: { product: Product | undefined }) {
  if (!product || !product.personalization_enabled) return null;
  return <section className="editorial-print" aria-labelledby="editorial-print-title">
    <div className="editorial-print-copy">
      <div className="editorial-print-body">
        <h2 id="editorial-print-title">Nadruk z Twoim<br/>nazwiskiem</h2>
        <p>Wybierz zawodnika z listy albo dodaj własne nazwisko i numer przy wybranym produkcie.</p>
        <div className="editorial-print-choices" aria-label="Dostępne opcje personalizacji">
          <span><UserRound size={17} strokeWidth={1.8}/> Zawodnik z listy</span>
          <span><PenLine size={17} strokeWidth={1.8}/> Własny napis i numer</span>
        </div>
        <Link className="editorial-print-action" href={productUrl(product)}>
          Dodaj swój nadruk <ArrowUpRight size={18}/>
        </Link>
      </div>
    </div>
    <Link href={productUrl(product)} className="editorial-print-visual" aria-label={"Zobacz produkt do personalizacji: " + product.name}>
      <ProductImage product={product}/>
      <div className="editorial-print-product-label"><div><span>Produkt z nadrukiem</span><strong>{product.name}</strong></div><div><span>Cena od</span><strong>{product.verified ? fmt(product.price) : "…"}</strong></div></div>
    </Link>
  </section>;
}

export function AccessoriesEditorial({ products }: { products: Product[] }) {
  if (!products.length) return null;
  return <section className="container editorial-accessories" aria-labelledby="accessories-title">
    <div className="editorial-accessories-heading">
      <div><h2 id="accessories-title">Akcesoria Zastalu</h2></div>
      <div className="editorial-accessories-intro"><p>Klubowe dodatki na mecz i na co dzień.</p><Link href="/sklep/akcesoria">Zobacz akcesoria <ArrowUpRight size={17}/></Link></div>
    </div>
    <div className="editorial-accessories-grid">
      {products.slice(0, 3).map((product, index) => <Link key={product.id} href={productUrl(product)} className={"editorial-accessory accessory-" + index}>
        <div className="editorial-accessory-image"><ProductImage product={product}/></div>
        <div className="editorial-accessory-info"><div><span>Akcesoria</span><h3>{product.name}</h3></div><span className="editorial-accessory-price">{product.verified ? fmt(product.price) : "…"}</span><ChevronRight size={18}/></div>
      </Link>)}
    </div>
  </section>;
}
