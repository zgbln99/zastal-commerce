"use client";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize, X } from "reicon-react";
import { galleryIndex, productImages, swipeIndex, type ImageProduct } from "../lib/product-media.mjs";
import { ProductImage } from "./ProductCard";
import Modal from "./Modal";
import { cn } from "@/lib/utils";

const navButton = "inline-flex size-10 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:opacity-40";

export default function ProductGallery({ product }: { product: ImageProduct }) {
  const images = productImages(product), [index, setIndex] = useState(0), [zoom, setZoom] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const current = images[galleryIndex(index, 0, images.length)];
  const move = (step: number) => setIndex(i => galleryIndex(i, step, images.length));
  const view = (expanded = false) => <div className={cn("gallery-view flex flex-col gap-4 outline-none", expanded && "expanded")} tabIndex={0} role="group" aria-label="Galeria produktu. Strzałki w lewo i w prawo zmieniają zdjęcie." onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); move(e.key === "ArrowLeft" ? -1 : 1); } }}>
    <div className={cn("product-gallery-main relative overflow-hidden rounded-2xl bg-muted", expanded ? "flex max-h-[80dvh] items-center justify-center" : "aspect-[4/5] sm:aspect-square lg:aspect-[4/5]")} onTouchStart={e => { const p = e.touches[0]; start.current = e.touches.length === 1 ? { x: p.clientX, y: p.clientY } : null; }} onTouchCancel={() => { start.current = null; }} onTouchEnd={e => { const p = e.changedTouches[0], origin = start.current; start.current = null; if (!origin || e.changedTouches.length !== 1) return; setIndex(i => swipeIndex(i, images.length, p.clientX - origin.x, p.clientY - origin.y)); }}>
      <ProductImage product={product} media={current} eager className={expanded ? "max-h-[80dvh] w-auto object-contain" : "size-full object-cover"}/>
      {!expanded && current && <button type="button" className="absolute bottom-4 right-4 inline-flex size-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur-sm hover:bg-background" aria-label="Powiększ aktualne zdjęcie produktu" onClick={() => setZoom(true)}><Maximize size={18}/></button>}
    </div>
    <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground"><button type="button" className={navButton} aria-label="Poprzednie zdjęcie" disabled={images.length < 2} onClick={() => move(-1)}><ChevronLeft size={18}/></button><span role="status" aria-live="polite" className="tabular-nums">{images.length ? `${galleryIndex(index, 0, images.length) + 1} / ${images.length}` : "Brak zdjęć produktu"}</span><button type="button" className={navButton} aria-label="Następne zdjęcie" disabled={images.length < 2} onClick={() => move(1)}><ChevronRight size={18}/></button></div>
    {images.length > 1 && <div className="flex flex-wrap gap-2" aria-label="Wybierz zdjęcie">{images.map((img, i) => <button type="button" key={img.id} className={cn("size-16 overflow-hidden rounded-lg border-2 bg-muted transition-colors", img.id === current?.id ? "border-primary" : "border-transparent hover:border-border")} aria-label={`Zdjęcie ${i + 1}: ${img.alt}`} aria-pressed={img.id === current?.id} onClick={() => setIndex(i)}><ProductImage product={product} media={img} className="size-full object-cover"/></button>)}</div>}
  </div>;
  return <div className="product-gallery">{view()}{zoom && <Modal title={"Zdjęcia: " + product.name} onClose={() => setZoom(false)} className="product-zoom-modal max-w-5xl"><button className="absolute right-4 top-4 z-10 inline-flex size-10 items-center justify-center rounded-full border border-border bg-background hover:bg-muted" aria-label="Zamknij powiększenie" onClick={() => setZoom(false)}><X size={20}/></button>{view(true)}</Modal>}</div>;
}
