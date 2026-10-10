"use client";
import Link from "next/link";
import { Heart, Plus, ArrowUpRight } from "lucide-react";
import { fmt } from "../lib/catalog";
import type { Product } from "../lib/commerce.mjs";
import { useStore } from "./StoreProvider";
export function ProductImage({ product, className = "", eager = false }: { product: { image: string; name: string }; className?: string; eager?: boolean }) {
  return <img src={product.image} alt={product.name} className={className} loading={eager ? "eager" : "lazy"} decoding="async" onError={e => { const el = e.currentTarget; if (!el.dataset.failed) { el.dataset.failed = "1"; el.src = "/assets/product-unavailable.svg"; } }} />;
}
export default function ProductCard({ product }: { product: Product }) {
  const store = useStore();
  const liked = store.favorites.includes(product.id);
  const available = product.variants.some(v => v.stock > 0);
  return <article className="product-card">
    <div className="product-image-wrap">
      <Link href={"/produkt/" + product.id} className="product-image-link" tabIndex={-1} aria-hidden="true"><ProductImage product={product}/></Link>
      {product.id === 2 && <span className="product-badge">Retro</span>}
      {product.verified && !available && <span className="product-badge">Wyprzedane</span>}
      <button className={"favorite-button " + (liked ? "is-favorite" : "")} onClick={() => store.favorite(product.id)} aria-label={(liked ? "Usuń z ulubionych: " : "Dodaj do ulubionych: ") + product.name} aria-pressed={liked} disabled={!store.hydrated}><Heart size={18} fill={liked ? "currentColor" : "none"}/></button>
      <button className="card-quick" onClick={() => product.sizes ? store.setQuickId(product.id) : store.add(product.id, "UNI")} disabled={store.status !== "ready" || !product.verified || !available}><Plus size={16}/> {product.sizes ? "Wybierz rozmiar" : "Dodaj do koszyka"}</button>
    </div>
    <div className="product-card-category">{product.category}{product.sizes && <span>{product.sizes[0]}–{product.sizes[product.sizes.length - 1]}</span>}</div>
    <Link className="product-card-name" href={"/produkt/" + product.id}>{product.name}</Link>
    <p className="product-card-subtitle">{product.subtitle}</p>
    <div className="product-card-bottom"><strong>{product.verified ? fmt(product.price) : <span className="price-pending">Sprawdzanie ceny…</span>}</strong><button className="card-mobile-add" aria-label={"Zobacz " + product.name} onClick={() => store.setQuickId(product.id)}><ArrowUpRight size={18}/></button></div>
  </article>;
}
