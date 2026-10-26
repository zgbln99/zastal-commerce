"use client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useState } from "react";
import { ArrowRight, ChevronRight, Clock, Heart, Box, TruckFast, ArrowDottedRotateAnticlockwise } from "reicon-react";
import { fmt } from "../../../lib/catalog";
import { shippingCost } from "../../../lib/commerce.mjs";
import { useStore } from "../../../components/StoreProvider";
import ProductCard from "../../../components/ProductCard";
import RecentlyViewed from "../../../components/RecentlyViewed";
import PurchaseControls from "../../../components/PurchaseControls";
import ProductGallery from "../../../components/ProductGallery";
import PriceReduction from "../../../components/PriceReduction";
import PageContent from "../../../components/PageContent";
import { TextureButton } from "@/components/templates/essentials/ui/texture-button";
import { cn } from "@/lib/utils";

const label = (c: string) => c === "Dzieci" ? "Dla dzieci" : c;

export default function ProductDetail({ productId }: { productId: number }) {
  const store = useStore();
  const product = store.products.find(p => p.id === productId);
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  if (!product) {
    if (store.status === "ready") notFound();
    return <div className="container py-10"><div className="empty-state"><h1>{store.status === "error" ? "Produkt chwilowo niedostępny" : "Wczytujemy produkt…"}</h1>{store.status === "error" && <><p>{store.error}</p><TextureButton onClick={store.refresh}>Spróbuj ponownie <ArrowDottedRotateAnticlockwise size={16}/></TextureButton></>}</div></div>;
  }
  const liked = store.favorites.includes(product.id);
  const related = [...store.products.filter(p => p.id !== product.id && p.category === product.category), ...store.products.filter(p => p.id !== product.id && p.category !== product.category)].slice(0, 4);
  const availability = product.verified ? (product.sizes ? (() => { const ok = product.variants.filter(v => v.stock > 0).map(v => v.size); return ok.length ? `Od ręki w rozmiarach: ${ok.join(", ")}` : "Chwilowo wyprzedane we wszystkich rozmiarach"; })() : product.stock > 0 ? `W magazynie: ${product.stock} szt.` : "Chwilowo niedostępny") : "Sprawdzamy stan magazynu…";
  return <div className="container pb-8">
    <div className="breadcrumbs"><Link href="/">Strona główna</Link><ChevronRight size={12}/><Link href="/sklep">Sklep</Link><ChevronRight size={12}/><Link href={"/sklep?category=" + encodeURIComponent(product.category)}>{label(product.category)}</Link><ChevronRight size={12}/><span className="truncate">{product.name}</span></div>
    <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
      <ProductGallery key={product.id} product={product}/>
      <div className="flex flex-col gap-6">
        <div>
          <div className="flex items-center justify-between gap-3 text-xs"><Link href={"/sklep?category=" + encodeURIComponent(product.category)} className="eyebrow">{label(product.category)}</Link><span className="text-muted-foreground">SKU: {product.sku}</span></div>
          <h1 className="mt-3 text-3xl font-medium leading-[1.08] tracking-tight sm:text-4xl">{product.name}</h1>
          {product.subtitle && <p className="mt-2 text-muted-foreground">{product.subtitle}</p>}
        </div>
        <div className="product-price-row flex items-start justify-between gap-4 border-y border-border py-4">
          <div><strong className="block text-2xl font-medium">{product.verified ? fmt(selectedPrice ?? product.price + (product.personalization_required ? product.personalization_fee || 0 : 0)) : "Sprawdzanie ceny…"}</strong><small className="text-xs text-muted-foreground">{store.sales.checkoutEnabled ? "Cena brutto · zawiera VAT" : "Cena produktu"}</small><PriceReduction product={product}/></div>
          <button className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-background transition-colors hover:bg-muted disabled:opacity-50", liked && "border-orange text-orange")} onClick={() => store.favorite(product.id)} disabled={!store.hydrated} aria-label={liked ? "Usuń produkt z ulubionych" : "Dodaj produkt do ulubionych"} aria-pressed={liked}><Heart size={18} weight={liked ? "Filled" : "Outline"}/></button>
        </div>
        {product.preorder && <div className="product-preorder-note flex items-start gap-3 rounded-xl border border-primary/30 bg-accent p-4 text-sm"><Clock size={18} className="mt-0.5 shrink-0 text-primary"/><div><strong className="font-medium">Przedsprzedaż</strong><p className="mt-0.5 text-muted-foreground">{product.preorder_note}{product.preorder_until ? " · planowana wysyłka od " + new Date(product.preorder_until + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }) : ""}</p></div></div>}
        <PurchaseControls key={product.id} product={product} onUnitPriceChange={setSelectedPrice}/>
        <div className="divide-y divide-border rounded-xl border border-border text-sm">
          <div className="flex items-start gap-3 p-4"><TruckFast size={18} className="mt-0.5 shrink-0 text-primary"/><span className="flex-1"><span className="block font-medium">Dostawa lub odbiór osobisty</span><small className="text-muted-foreground">{store.sales.checkoutEnabled ? store.sales.shipping.map(m => m.name + (shippingCost(m, 0) ? " " + fmt(shippingCost(m, 0)) : " bezpłatnie")).join(" · ") : "Szczegóły znajdziesz w informacjach o dostawie."}</small></span><Link href="/pomoc#dostawa" aria-label="Informacje o dostawie" className="text-muted-foreground hover:text-foreground"><ChevronRight size={16}/></Link></div>
          <div className="flex items-start gap-3 p-4"><Box size={18} className="mt-0.5 shrink-0 text-primary"/><span><span className="block font-medium">Dostępność</span><small className="text-muted-foreground">{availability}</small></span></div>
        </div>
        <div className="divide-y divide-border border-t border-border">
          <details open className="group py-4"><summary className="flex cursor-pointer list-none items-center justify-between text-base font-medium [&::-webkit-details-marker]:hidden">Opis produktu <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span></summary><div className="mt-3 text-sm text-foreground/80 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-medium [&_h2]:text-foreground [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">{product.description ? <PageContent content={product.description} className="product-description"/> : <p>{product.subtitle || "Wybierz rozmiar i sprawdź dostępne opcje personalizacji."}</p>}<dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4"><div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Kategoria</dt><dd className="text-foreground">{product.category}</dd></div><div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Kod produktu</dt><dd className="text-foreground">{product.sku}</dd></div><div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Rozmiary</dt><dd className="text-foreground">{product.sizes?.join(", ") || "Uniwersalny"}</dd></div>{product.personalization_enabled && <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Personalizacja</dt><dd className="text-foreground">{product.decoration_method_label}</dd></div>}</dl></div></details>
          <details className="group py-4"><summary className="flex cursor-pointer list-none items-center justify-between text-base font-medium [&::-webkit-details-marker]:hidden">Rozmiar i pielęgnacja <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span></summary><div className="mt-3 space-y-3 text-sm text-muted-foreground">{product.size_guide ? <pre className="product-size-guide overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-xs text-foreground">{product.size_guide}</pre> : <p>Przed zakupem sprawdź wybrany rozmiar. Jeśli na karcie produktu podano wymiary, porównaj je z odzieżą, którą nosisz.</p>}<p>Instrukcję prania i prasowania sprawdź na metce odzieży.</p><Link className="inline-link" href="/pomoc#rozmiary">Pomoc w wyborze rozmiaru <ArrowRight size={14}/></Link></div></details>
          <details className="group py-4"><summary className="flex cursor-pointer list-none items-center justify-between text-base font-medium [&::-webkit-details-marker]:hidden">Zamówienie i dostawa <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span></summary><div className="mt-3 space-y-3 text-sm text-muted-foreground">{store.sales.checkoutEnabled ? <><p>Zamówienie złożysz online z dostawą na terenie Polski lub odbiorem osobistym{store.sales.pickupAddress ? " (" + store.sales.pickupAddress + ")" : ""}. Płatność: {store.sales.payments.map(p => p.name).join(", ")}.</p>{store.sales.legal.returns && <a className="inline-link" href={store.sales.legal.returns} target="_blank" rel="noreferrer">Zwroty i odstąpienie od umowy <ArrowRight size={14}/></a>}</> : <><p>Dostępność dotyczy wybranego wariantu. Przy produktach z przedsprzedaży podajemy przewidywaną datę wysyłki. Sposób dostawy i jej koszt sprawdzisz przed potwierdzeniem zamówienia.</p><Link className="inline-link" href="/pomoc#zamowienia">Informacje o zamówieniach <ArrowRight size={14}/></Link></>}</div></details>
        </div>
      </div>
    </div>
    <section className="mt-20"><div className="section-heading"><h2>Zobacz też</h2><Link className="inline-link" href="/sklep">Cały sklep <ArrowRight size={16}/></Link></div><div className="product-grid">{related.map(p => <ProductCard product={p} key={p.id}/>)}</div></section>
    <RecentlyViewed currentId={product.id}/>
  </div>;
}
