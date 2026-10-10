"use client";
import { useState } from "react";
import { Check, Minus, Plus, ShoppingBag } from "lucide-react";
import { availableQty, type Product } from "../lib/commerce.mjs";
import { useStore } from "./StoreProvider";
export default function PurchaseControls({ product }: { product: Product }) {
  const store = useStore();
  const [size, setSize] = useState(product.sizes ? "" : "UNI");
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const stock = availableQty(product, size);
  const inCart = store.cart.find(line => line.id === product.id && line.size === size)?.quantity || 0;
  const remaining = Math.max(0, Math.min(20 - inCart, stock - inCart));
  const anyAvailable = product.variants.some(v => v.stock > 0);
  const select = (value: string) => { setSize(value); setQuantity(1); setError(""); };
  return <div className="purchase-controls">
    {product.sizes && <><div className="size-label"><strong>Rozmiar {size && <span> / {size}</span>}</strong><a href="/pomoc#rozmiary">Jak wybrać rozmiar?</a></div><div className="size-buttons" role="group" aria-label="Wybierz rozmiar">{product.sizes.map(s => <button key={s} type="button" aria-pressed={size === s} aria-label={s + (product.verified && !availableQty(product, s) ? ", niedostępny" : "")} disabled={store.status !== "ready" || !product.verified || availableQty(product, s) === 0} className={size === s ? "selected" : ""} onClick={() => select(s)}>{s}</button>)}</div>{!size && anyAvailable && <p className="input-hint">Wybierz rozmiar, aby sprawdzić dostępność.</p>}</>}
    <div className="availability-note">{store.status === "loading" ? "Sprawdzamy dostępność…" : store.status === "error" ? "Dostępność chwilowo nieznana" : !anyAvailable ? "Produkt chwilowo niedostępny" : size ? <><span className="availability-dot"/>{remaining > 0 ? (stock <= 3 ? "Ostatnie " + stock + " szt. w tym rozmiarze" : "Dostępny w magazynie") : "Dostępne sztuki masz już w koszyku"}</> : <><Check size={15}/> Produkt dostępny — wybierz rozmiar</>}</div>
    <div className="purchase-actions"><div className="quantity-control" aria-label="Ilość"><button type="button" onClick={() => setQuantity(n => Math.max(1, n - 1))} disabled={quantity <= 1} aria-label="Zmniejsz ilość"><Minus size={15}/></button><span aria-live="polite">{quantity}</span><button type="button" onClick={() => setQuantity(n => Math.min(remaining, n + 1))} disabled={!size || quantity >= remaining} aria-label="Zwiększ ilość"><Plus size={15}/></button></div><button className="button button-dark" disabled={!store.hydrated || store.status !== "ready" || !product.verified || !anyAvailable || (!!size && remaining === 0)} onClick={() => { if (!size) { setError("Wybierz rozmiar koszulki lub bluzy."); return; } if (store.add(product.id, size, quantity)) setError(""); }}><ShoppingBag size={18}/>{!anyAvailable && product.verified ? "Chwilowo niedostępny" : "Dodaj do koszyka"}</button></div>
    {error && <p role="alert" className="field-error">{error}</p>}
  </div>;
}
