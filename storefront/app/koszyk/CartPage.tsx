"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronRight, Minus, Plus, ShoppingCart, Trash, TruckFast } from "reicon-react";
import { fmt } from "../../lib/catalog";
import { availableQty, canCheckout, cartLineKey, lineUnitPrice, personalizationLabel, productPath, variantCartQuantity } from "../../lib/commerce.mjs";
import { useStore } from "../../components/StoreProvider";
import { ProductImage } from "../../components/ProductCard";
import FreeShipping from "../../components/FreeShipping";
import PromoField from "../../components/PromoField";
import { TextureButton } from "@/components/templates/essentials/ui/texture-button";

/** Full cart page (the drawer's big sibling): the same lines, quantities, discount code and totals on their own address. */
export default function CartPage() {
  const store = useStore(); const router = useRouter();
  const checkedPlayers = store.playersStatus === "ready" ? store.players : [];
  const valid = store.status === "ready" && canCheckout(store.cart, store.products, checkedPlayers);
  const prices = store.status === "ready" && store.cart.every(line => store.products.find(p => p.id === line.id)?.verified);
  return <div className="container cart-page pb-16">
    <div className="breadcrumbs"><Link href="/">Strona główna</Link><ChevronRight size={12}/><span>Koszyk</span></div>
    <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">Koszyk <span className="text-muted-foreground">({store.count})</span></h1>
    {!store.cart.length ? <div className="empty-state mt-8"><ShoppingCart size={32}/><h2>Koszyk jest pusty</h2><p>Zacznij od koszulek, bluz lub klubowych akcesoriów.</p><TextureButton render={<Link href="/sklep"/>}>Przejdź do sklepu <ArrowRight size={16}/></TextureButton></div>
    : <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_22rem]">
      <div className="divide-y divide-border">{store.cart.map(line => {
        const p = store.products.find(x => x.id === line.id);
        const name = p?.name || "Produkt #" + line.id;
        const stock = availableQty(p, line.size), combined = variantCartQuantity(store.cart, line.id, line.size);
        const printLabel = personalizationLabel(line, store.players);
        return <article className="cart-item flex gap-4 py-5" key={cartLineKey(line)}>
          <Link href={productPath(p || { id: line.id })} className="size-28 shrink-0 overflow-hidden rounded-xl bg-muted"><ProductImage product={p || { name, image: "/assets/product-unavailable.svg" }} className="size-full object-cover"/></Link>
          <div className="min-w-0 flex-1">
            <Link href={productPath(p || { id: line.id })} className="font-medium hover:text-primary">{name}</Link>
            <p className="text-sm text-muted-foreground">{line.size === "UNI" ? "Rozmiar uniwersalny" : "Rozmiar: " + line.size}{printLabel ? " · " + printLabel : ""}</p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="inline-flex h-10 items-center rounded-full border border-border"><button className="inline-flex size-10 items-center justify-center rounded-full hover:bg-muted" aria-label={"Zmniejsz ilość: " + name} onClick={() => store.update(line.id, line.size, line.quantity - 1, line.personalization)}><Minus size={14}/></button><span className="min-w-7 text-center text-sm font-medium">{line.quantity}</span><button className="inline-flex size-10 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" aria-label={"Zwiększ ilość: " + name} onClick={() => store.update(line.id, line.size, line.quantity + 1, line.personalization)} disabled={store.status !== "ready" || !p?.verified || line.quantity >= 20 || combined >= stock}><Plus size={14}/></button></div>
              <strong className="font-medium">{prices ? fmt(lineUnitPrice(p, line) * line.quantity) : "…"}</strong>
              <button className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive" onClick={() => store.update(line.id, line.size, 0, line.personalization)}><Trash size={14}/> Usuń</button>
            </div>
            {p && store.status === "ready" && combined > stock && <p className="field-error mt-2">Dostępne: {stock} szt. Zmniejsz ilość.</p>}
          </div>
        </article>; })}</div>
      <aside className="h-fit rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-medium">Podsumowanie</h2>
        <div className="mt-4 flex items-center justify-between text-sm"><span className="text-muted-foreground">Produkty</span><strong className="font-medium">{prices ? fmt(store.subtotal) : "…"}</strong></div>
        <div className="mt-4"><PromoField subtotal={store.subtotal} enabled={store.sales.checkoutEnabled && prices}/></div>
        <div className="mt-4"><FreeShipping subtotal={store.subtotal} methods={store.sales.shipping} enabled={store.sales.checkoutEnabled && prices}/></div>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><TruckFast size={14} className="mt-0.5 shrink-0"/>Koszt dostawy i płatność wybierzesz w następnym kroku.</p>
        {store.error && <p className="field-error mt-2">{store.error}</p>}
        <TextureButton size="lg" className="mt-5 w-full" disabled={!valid} onClick={() => router.push("/zamowienie")}>{store.sales.checkoutEnabled ? "Przejdź do zamówienia" : "Informacje o zamówieniach"} <ArrowRight size={18}/></TextureButton>
        <Link href="/sklep" className="mt-3 block text-center text-sm text-muted-foreground hover:text-foreground">Kontynuuj zakupy</Link>
      </aside>
    </div>}
  </div>;
}
