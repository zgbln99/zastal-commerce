"use client";
import Link from "next/link";
import { useState } from "react";
import { productImages, secondaryImage, type ImageProduct, type ProductMedia } from "../lib/product-media.mjs";
import { Heart, Plus, ArrowUpRight } from "lucide-react";
import { fmt } from "../lib/catalog";
import { productDisplayPrice, type Product } from "../lib/commerce.mjs";
import { useStore } from "./StoreProvider";
import PriceReduction from "./PriceReduction";
export function ProductImage({ product, media, className = "", eager = false, showLabel = true }: { product: ImageProduct; media?: ProductMedia; className?: string; eager?: boolean; showLabel?: boolean }) {
  const current = media || productImages(product)[0];
  const source = current?.url || "/assets/product-unavailable.svg";
  const [failed, setFailed] = useState("");
  const broken = failed === source;
  return <><img src={broken ? "/assets/product-unavailable.svg" : source} alt={broken ? "Zdjęcie produktu niedostępne" : current?.alt || product.name || "Produkt"} className={className} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(source)}/></>;
}
export default function ProductCard({ product, eager = false }: { product: Product; eager?: boolean }) {
  const store = useStore();
  const [alternate, setAlternate] = useState(false);
  const images = productImages(product);
  const current = alternate ? secondaryImage(images) || images[0] : images[0];
  const liked = store.favorites.includes(product.id);
  const available = product.variants.some(v => v.stock > 0);
  const lastPieces = product.verified && available && !product.preorder && product.variants.reduce((sum, v) => sum + v.stock, 0) <= 3;
  const needsSelection = !!product.sizes || !!product.personalization_enabled;
  return <article className="product-card" onMouseEnter={() => setAlternate(window.matchMedia("(hover: hover) and (pointer: fine)").matches)} onMouseLeave={() => setAlternate(false)} onFocusCapture={() => setAlternate(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlternate(false); }}>
    <div className="product-image-wrap">
      <Link href={"/produkt/" + product.id} className="product-image-link" aria-label={product.name}><ProductImage product={product} media={current} eager={eager}/></Link>
      {product.verified && !available ? <span className="product-badge">Wyprzedane</span> : product.preorder ? <span className="product-badge preorder">Przedsprzedaż</span> : product.badge_info ? <span className={"product-badge badge-" + product.badge_info.code}>{product.badge_info.label}</span> : lastPieces ? <span className="product-badge">Ostatnie sztuki</span> : null}
      <button className={"favorite-button " + (liked ? "is-favorite" : "")} onClick={() => store.favorite(product.id)} aria-label={(liked ? "Usuń z ulubionych: " : "Dodaj do ulubionych: ") + product.name} aria-pressed={liked} disabled={!store.hydrated}><Heart size={18} fill={liked ? "currentColor" : "none"}/></button>
      <button className="card-quick" onClick={() => needsSelection ? store.setQuickId(product.id) : store.add(product.id, "UNI")} disabled={store.status !== "ready" || !product.verified || !available}><Plus size={16}/> {product.personalization_enabled ? "Wybierz nadruk" : product.sizes ? "Wybierz rozmiar" : "Dodaj do koszyka"}</button>
    </div>
    <div className="product-card-category">{product.category}{product.sizes && <span>{product.sizes[0]}–{product.sizes[product.sizes.length - 1]}</span>}</div>
    <Link className="product-card-name" href={"/produkt/" + product.id}>{product.name}</Link>
    <p className="product-card-subtitle">{product.subtitle}</p>
    <div className="product-card-bottom"><strong>{product.verified ? <>{fmt(productDisplayPrice(product))}{product.personalization_required && <small> z nadrukiem</small>}<PriceReduction product={product} compact/></> : <span className="price-pending">Cena wkrótce</span>}</strong><button className="card-mobile-add" aria-label={"Zobacz " + product.name} onClick={() => store.setQuickId(product.id)}><ArrowUpRight size={18}/></button></div>
  </article>;
}
