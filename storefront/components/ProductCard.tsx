"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { productImages, secondaryImage, type ImageProduct, type ProductMedia } from "../lib/product-media.mjs";
import { Heart, Plus } from "reicon-react";
import { fmt } from "../lib/catalog";
import { productDisplayPrice, productPath, type Product } from "../lib/commerce.mjs";
import { useStore } from "./StoreProvider";
import PriceReduction from "./PriceReduction";
import { cn } from "@/lib/utils";

/** Local photos (bundled assets and uploads served by the API) go through the Next image optimizer; SVG placeholders and legacy remote URLs are served as they are. */
export const optimizable = (url: string) => /^\/(assets|api\/store\/media)\//.test(url) && !url.endsWith(".svg");

/**
 * Product photo with a placeholder fallback. With `sizes` the caller states how wide the picture is laid out, and the
 * photo is served resized and converted (AVIF/WebP) by `next/image`; without it the legacy stylesheets size a plain <img>.
 */
export function ProductImage({ product, media, className = "", eager = false, sizes }: { product: ImageProduct; media?: ProductMedia; className?: string; eager?: boolean; sizes?: string; showLabel?: boolean }) {
  const current = media || productImages(product)[0];
  const source = current?.url || "/assets/product-unavailable.svg";
  const [failed, setFailed] = useState("");
  const broken = failed === source;
  const src = broken ? "/assets/product-unavailable.svg" : source;
  const alt = broken ? "Zdjęcie produktu niedostępne" : current?.alt || product.name || "Produkt";
  if (!sizes) return <img src={src} alt={alt} className={className} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(source)}/>;
  return <Image src={src} alt={alt} width={800} height={1000} sizes={sizes} className={className} priority={eager} unoptimized={!optimizable(src)} onError={() => setFailed(source)}/>;
}

const CARD_SIZES = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw";

/** Catalogue tile in the kit's "featured product" pattern: rounded photo, heart, status pill, quiet type underneath. */
export default function ProductCard({ product, eager = false }: { product: Product; eager?: boolean }) {
  const store = useStore();
  const images = productImages(product);
  const current = images[0], second = secondaryImage(images);
  const liked = store.favorites.includes(product.id);
  const available = product.variants.some(v => v.stock > 0);
  const soldOut = product.verified && !available;
  const lastPieces = product.verified && available && !product.preorder && product.variants.reduce((sum, v) => sum + v.stock, 0) <= 3;
  const needsSelection = !!product.sizes || !!product.personalization_enabled;
  const sizeRange = product.sizes ? product.sizes[0] + "–" + product.sizes[product.sizes.length - 1] : "Rozmiar uniwersalny";
  return <article className="group flex min-w-0 flex-col">
    <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted">
      <Link href={productPath(product)} className="block size-full" aria-label={product.name}><ProductImage product={product} media={current} eager={eager} sizes={CARD_SIZES} className={cn("size-full object-cover transition-[opacity,transform] duration-500 ease-out", second ? "group-hover:opacity-0" : "group-hover:scale-105", soldOut && "opacity-60 grayscale-[0.4]")}/>
        {second && <ProductImage product={product} media={second} sizes={CARD_SIZES} className={cn("absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100", soldOut && "grayscale-[0.4]")}/>}</Link>
      {soldOut ? <span className="product-badge absolute left-3 top-3">Wyprzedane</span> : product.preorder ? <span className="product-badge preorder absolute left-3 top-3">Przedsprzedaż</span> : product.badge_info ? <span className={"product-badge badge-" + product.badge_info.code + " absolute left-3 top-3"}>{product.badge_info.label}</span> : lastPieces ? <span className="product-badge absolute left-3 top-3">Ostatnie sztuki</span> : null}
      <button className={cn("absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background disabled:opacity-50", liked && "text-orange")} onClick={() => store.favorite(product.id)} aria-label={(liked ? "Usuń z ulubionych: " : "Dodaj do ulubionych: ") + product.name} aria-pressed={liked} disabled={!store.hydrated}><Heart size={16} weight={liked ? "Filled" : "Outline"}/></button>
      {!soldOut && <button className="absolute inset-x-3 bottom-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-background/95 text-sm font-medium text-foreground shadow-md backdrop-blur-sm transition-all hover:bg-primary hover:text-primary-foreground disabled:opacity-60 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100" onClick={() => needsSelection ? store.setQuickId(product.id) : store.add(product.id, "UNI")} disabled={store.status !== "ready" || !product.verified || !available}><Plus size={16}/> {product.personalization_enabled ? "Wybierz nadruk" : product.sizes ? "Wybierz rozmiar" : "Dodaj do koszyka"}</button>}
    </div>
    <div className="mt-4 flex min-w-0 flex-1 flex-col gap-1">
      <Link className="block text-base font-medium leading-5 text-foreground [overflow-wrap:anywhere] hover:text-primary" href={productPath(product)}>{product.name}</Link>
      <p className="text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">{product.subtitle || product.category} · {sizeRange}</p>
      <div className="mt-auto pt-1.5 text-base font-semibold">{product.verified ? <>{fmt(productDisplayPrice(product))}{product.personalization_required && <span className="ml-1 text-[11px] font-normal text-muted-foreground">z nadrukiem</span>}<PriceReduction product={product} compact/></> : <span className="text-muted-foreground">…</span>}</div>
    </div>
  </article>;
}
