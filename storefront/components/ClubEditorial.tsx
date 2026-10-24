"use client";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronRight } from "lucide-react";
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
      <div className="editorial-serial"><span>02 — PERSONALIZACJA</span><span>SKLEP ZASTALU / NADRUK</span></div>
      <div className="editorial-print-body">
        <span className="editorial-mini-label">WYBRANE PRODUKTY / NADRUK NA ZAMÓWIENIE</span>
        <h2 id="editorial-print-title">Nadruk z Twoim<br/>nazwiskiem</h2>
        <p>Wybierz zawodnika z listy albo dodaj własne nazwisko i numer przy wybranym produkcie.</p>
        <div className="editorial-print-choices" aria-label="Dostępne opcje personalizacji">
          <span><b>01</b> Zawodnik z listy</span>
          <span><b>02</b> Własny napis i numer</span>
        </div>
        <Link className="editorial-print-action" href={"/produkt/" + product.id}>
          Dodaj swój nadruk <ArrowUpRight size={18}/>
        </Link>
      </div>
      <div className="editorial-print-foot"><span>PRODUKT Z OPCJĄ NADRUKU</span><span>{product.sku}</span></div>
    </div>
    <Link href={"/produkt/" + product.id} className="editorial-print-visual" aria-label={"Zobacz produkt do personalizacji: " + product.name}>
      <div className="editorial-print-court" aria-hidden="true">
        <svg viewBox="0 0 450 450" fill="none"><circle cx="225" cy="225" r="178"/><circle cx="225" cy="225" r="57"/><path d="M225 47v356M47 225h356"/><path d="M225 47c-118 117-118 239 0 356M225 47c118 117 118 239 0 356"/></svg>
      </div>
      <ProductImage product={product}/>
      <div className="editorial-print-product-label"><div><span>WYBRANY PRODUKT</span><strong>{product.name}</strong></div><div><span>OD</span><strong>{product.verified ? fmt(product.price) : "—"}</strong></div></div>
      <span className="editorial-print-corner" aria-hidden="true">ZG / 1946</span>
    </Link>
  </section>;
}

export function AccessoriesEditorial({ products }: { products: Product[] }) {
  if (!products.length) return null;
  return <section className="container editorial-accessories" aria-labelledby="accessories-title">
    <div className="editorial-accessories-heading">
      <div><span className="home-kicker">05 / DODATKI</span><h2 id="accessories-title">Akcesoria<br/><em>Zastalu</em></h2></div>
      <div className="editorial-accessories-intro"><p>Klubowe dodatki na mecz i na co dzień.</p><Link href="/sklep?category=Akcesoria">Zobacz akcesoria <ArrowUpRight size={17}/></Link></div>
    </div>
    <div className="editorial-accessories-grid">
      {products.slice(0, 3).map((product, index) => <Link key={product.id} href={"/produkt/" + product.id} className={"editorial-accessory accessory-" + index}>
        <div className="editorial-accessory-image"><ProductImage product={product}/><span className="editorial-accessory-index">0{index + 1}</span></div>
        <div className="editorial-accessory-info"><div><span>AKCESORIA / ZASTAL</span><h3>{product.name}</h3></div><span className="editorial-accessory-price">{product.verified ? fmt(product.price) : "—"}</span><ChevronRight size={18}/></div>
      </Link>)}
    </div>
  </section>;
}
