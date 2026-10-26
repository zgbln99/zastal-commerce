"use client";
import Link from "next/link";
import { useState } from "react";
import { productImages, secondaryImage, type ImageProduct, type ProductMedia } from "../lib/product-media.mjs";
import { Heart, Plus } from "reicon-react";
import { fmt } from "../lib/catalog";
import { productDisplayPrice, productPath, type Product } from "../lib/commerce.mjs";
import { useStore } from "./StoreProvider";
import PriceReduction from "./PriceReduction";
import { cn } from "@/lib/utils";

export function ProductImage({ product, media, className = "", eager = false }: { product: ImageProduct; media?: ProductMedia; className?: string; eager?: boolean; showLabel?: boolean }) {
  const current = media || productImages(product)[0];
  const source = current?.url || "/assets/product-unavailable.svg";
  const [failed, setFailed] = useState("");
  const broken = failed === source;
  return <img src={broken ? "/assets/product-unavailable.svg" : source} alt={broken ? "Zdjęcie produktu niedostępne" : current?.alt || product.name || "Produkt"} className={className} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(source)}/>;
}

/** Catalogue tile in the kit's "featured product" pattern: rounded photo, heart, status pill, quiet type underneath. */
export default function ProductCard({ product, eager = false }: { product: Product; eager?: boolean }) {
  const store = useStore();
  const [alternate, setAlternate] = useState(false);
  const images = productImages(product);
  const current = alternate ? secondaryImage(images) || images[0] : images[0];
  const liked = store.favorites.includes(product.id);
  const available = product.variants.some(v => v.stock > 0);
  const soldOut = product.verified && !available;
  const lastPieces = product.verified && available && !product.preorder && product.variants.reduce((sum, v) => sum + v.stock, 0) <= 3;
  const needsSelection = !!product.sizes || !!product.personalization_enabled;
  const sizeRange = product.sizes ? product.sizes[0] + "–" + product.sizes[product.sizes.length - 1] : "Rozmiar uniwersalny";
  return <article className="group flex min-w-0 flex-col" onMouseEnter={() => setAlternate(window.matchMedia("(hover: hover) and (pointer: fine)").matches)} onMouseLeave={() => setAlternate(false)} onFocusCapture={() => setAlternate(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlternate(false); }}>
    <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-muted">
      <Link href={productPath(product)} className="block size-full" aria-label={product.name}><ProductImage product={product} media={current} eager={eager} className={cn("size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105", soldOut && "opacity-60 grayscale-[0.4]")}/></Link>
      {soldOut ? <span className="product-badge absolute left-3 top-3">Wyprzedane</span> : product.preorder ? <span className="product-badge preorder absolute left-3 top-3">Przedsprzedaż</span> : product.badge_info ? <span className={"product-badge badge-" + product.badge_info.code + " absolute left-3 top-3"}>{product.badge_info.label}</span> : lastPieces ? <span className="product-badge absolute left-3 top-3">Ostatnie sztuki</span> : null}
      <button className={cn("absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background disabled:opacity-50", liked && "text-orange")} onClick={() => store.favorite(product.id)} aria-label={(liked ? "Usuń z ulubionych: " : "Dodaj do ulubionych: ") + product.name} aria-pressed={liked} disabled={!store.hydrated}><Heart size={16} weight={liked ? "Filled" : "Outline"}/></button>
      {!soldOut && <button className="absolute inset-x-3 bottom-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-background/95 text-sm font-medium text-foreground shadow-md backdrop-blur-sm transition-all hover:bg-primary hover:text-primary-foreground disabled:opacity-60 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100" onClick={() => needsSelection ? store.setQuickId(product.id) : store.add(product.id, "UNI")} disabled={store.status !== "ready" || !product.verified || !available}><Plus size={16}/> {product.personalization_enabled ? "Wybierz nadruk" : product.sizes ? "Wybierz rozmiar" : "Dodaj do koszyka"}</button>}
    </div>
    <div className="mt-3 min-w-0">
      <Link className="block truncate text-sm font-medium text-foreground hover:text-primary" href={productPath(product)}>{product.name}</Link>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{product.subtitle || product.category} · {sizeRange}</p>
      <div className="mt-1.5 text-sm font-medium">{product.verified ? <>{fmt(productDisplayPrice(product))}{product.personalization_required && <span className="ml-1 text-[11px] font-normal text-muted-foreground">z nadrukiem</span>}<PriceReduction product={product} compact/></> : <span className="text-muted-foreground">…</span>}</div>
    </div>
  </article>;
}
