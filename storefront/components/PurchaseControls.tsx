"use client";
import { useEffect, useState } from "react";
import { Check, Minus, Plus, ShoppingCart } from "reicon-react";
import { TextureButton } from "@/components/templates/essentials/ui/texture-button";
import { cn } from "@/lib/utils";
import { availableQty, normalizePersonalization, variantCartQuantity, type Personalization, type Product } from "../lib/commerce.mjs";
import { useStore } from "./StoreProvider";
import { fmt } from "../lib/catalog";
import PersonalizationControls, { type PrintSelection } from "./PersonalizationControls";
import StockAlert from "./StockAlert";
import ReleaseCountdown from "./ReleaseCountdown";
export default function PurchaseControls({ product, onUnitPriceChange }: { product: Product; onUnitPriceChange?: (amount: number) => void }) {
  const store = useStore();
  const [size, setSize] = useState(product.sizes ? "" : "UNI");
  const [print, setPrint] = useState<PrintSelection>({ mode: product.personalization_required ? "player" : "none", playerId: "", name: "", number: "" });
  const printMode = product.personalization_enabled ? (product.personalization_required && print.mode === "none" ? "player" : print.mode) : "none";
  const selectedPlayer = store.playersStatus === "ready" ? store.players.find(p => String(p.id) === print.playerId) : undefined;
  const personalization: Personalization | null | undefined = printMode === "player" ? selectedPlayer ? { mode: "player", player_id: selectedPlayer.id } : null : printMode === "custom" ? normalizePersonalization({ mode: "custom", name: print.name, number: print.number }) : undefined;
  const unitPrice = product.price + (printMode !== "none" ? product.personalization_fee || 0 : 0);
  useEffect(() => { onUnitPriceChange?.(unitPrice); }, [unitPrice, onUnitPriceChange]);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const stock = availableQty(product, size);
  const inCart = variantCartQuantity(store.cart, product.id, size);
  const remaining = Math.max(0, Math.min(20, stock - inCart));
  const anyAvailable = product.variants.some(v => v.stock > 0);
  const released = product.released !== false;
  const soldOutSize = product.verified && !!size && stock === 0;
  // Link from the players page: /produkt/ID?zawodnik=PLAYER preselects that player.
  useEffect(() => {
    if (!product.personalization_enabled) return;
    try { const chosen = new URLSearchParams(window.location.search).get("zawodnik"); if (chosen && /^[0-9]{1,6}$/.test(chosen)) setPrint(current => ({ ...current, mode: "player", playerId: chosen })); } catch {}
  }, [product.id, product.personalization_enabled]);
  const select = (value: string) => { setSize(value); setQuantity(1); setError(""); };
  return <div className="flex flex-col gap-4">
    {product.sizes && <><div className="flex items-center justify-between text-sm"><strong className="font-medium">Rozmiar{size && <span className="text-muted-foreground"> / {size}</span>}</strong><a href="/pomoc#rozmiary" className="text-xs text-muted-foreground underline-offset-4 hover:underline">Jak wybrać rozmiar?</a></div><div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Wybierz rozmiar">{product.sizes.map(s => { const left = availableQty(product, s); const out = product.verified && store.status === "ready" && left === 0; const low = product.verified && left > 0 && left <= 3; return <button key={s} type="button" aria-pressed={size === s} aria-label={s + (out ? ", brak, zapisz się na powiadomienie" : low ? `, ostatnie ${left} szt.` : "")} disabled={store.status !== "ready" || !product.verified} className={cn("relative inline-flex h-11 min-w-12 items-center justify-center rounded-full border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50", size === s && "border-primary bg-primary text-primary-foreground hover:bg-primary", out && "text-muted-foreground line-through decoration-muted-foreground/60", low && size !== s && "border-orange/60")} onClick={() => select(s)}>{s}{low && <small aria-hidden="true" className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-orange text-[10px] font-semibold text-white no-underline">{left}</small>}</button>; })}</div>{product.verified && store.status === "ready" && <p className="size-legend mt-2 flex flex-wrap gap-x-3 text-xs text-muted-foreground">{(() => { const inStock = product.sizes.filter(s => availableQty(product, s) > 0); const out = product.sizes.filter(s => availableQty(product, s) === 0); return <>{inStock.length ? <span>Od ręki: <b>{inStock.join(", ")}</b></span> : <span>Wszystkie rozmiary chwilowo wyprzedane</span>}{out.length > 0 && inStock.length > 0 && <span className="size-legend-out">Brak: {out.join(", ")}</span>}</>; })()}</p>}{!size && anyAvailable && <p className="input-hint mt-2">Wybierz rozmiar, aby sprawdzić dostępność.</p>}</>}
    <div className="flex items-center gap-2 text-sm">{store.status === "loading" ? "Sprawdzamy dostępność…" : store.status === "error" ? "Dostępność chwilowo nieznana" : !anyAvailable ? "Produkt chwilowo niedostępny" : size ? <><span className={cn("availability-dot size-2 rounded-full", stock === 0 ? "bg-destructive" : stock <= 3 ? "bg-orange" : "bg-primary")}/>{remaining > 0 ? (stock <= 3 ? (product.sizes ? "Ostatnie " + stock + " szt. w tym rozmiarze" : "Ostatnie " + stock + " szt.") : stock <= 10 ? "W magazynie: " + stock + " szt." : "Dostępny od ręki") : stock === 0 ? "Brak w tym rozmiarze. Zostaw e-mail, a damy znać, gdy wróci." : "Dostępne sztuki masz już w koszyku"}</> : <><Check size={15} className="text-primary"/> Produkt dostępny, wybierz rozmiar</>}</div>
    {product.personalization_enabled && <><PersonalizationControls product={product} value={{ ...print, mode: printMode }} onChange={value => { setPrint(value); setError(""); }} players={store.players} status={store.playersStatus} error={store.playersError} retry={store.refreshPlayers}/><p className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Cena za sztukę{printMode !== "none" ? " z nadrukiem" : ""}</span><strong className="font-medium">{product.verified ? fmt(unitPrice) : "-"}</strong></p></>}
    {!released && <ReleaseCountdown epoch={product.release_epoch} label={product.badge_info?.label}/>}
    <div className="flex items-stretch gap-3"><div className="inline-flex h-12 shrink-0 items-center rounded-lg border border-border" aria-label="Ilość"><button type="button" className="inline-flex size-12 items-center justify-center rounded-l-lg hover:bg-muted disabled:opacity-40" onClick={() => setQuantity(n => Math.max(1, n - 1))} disabled={quantity <= 1} aria-label="Zmniejsz ilość"><Minus size={15}/></button><span aria-live="polite" className="min-w-8 text-center text-sm font-medium">{quantity}</span><button type="button" className="inline-flex size-12 items-center justify-center rounded-r-lg hover:bg-muted disabled:opacity-40" onClick={() => setQuantity(n => Math.min(remaining, n + 1))} disabled={!size || quantity >= remaining} aria-label="Zwiększ ilość"><Plus size={15}/></button></div><TextureButton size="lg" className="h-12 flex-1" disabled={!store.hydrated || store.status !== "ready" || !product.verified || !anyAvailable || !released || (!!size && remaining === 0)} onClick={() => { if (!size) { setError("Wybierz rozmiar koszulki lub bluzy."); return; } if (printMode !== "none" && !personalization) { setError(printMode === "player" ? "Wybierz zawodnika z aktualnej kadry." : "Wpisz nazwisko (1–20 znaków) i numer (1–2 cyfry)."); return; } if (store.add(product.id, size, quantity, personalization || undefined, selectedPlayer && printMode === "player" ? { name: selectedPlayer.print_name, number: selectedPlayer.number } : undefined)) setError(""); }}><ShoppingCart size={18}/>{!anyAvailable && product.verified ? "Chwilowo niedostępny" : "Dodaj do koszyka"}</TextureButton></div>
    {product.verified && released && store.status === "ready" && (!anyAvailable || soldOutSize) && <StockAlert product={product} size={size}/>}
    {error && <p role="alert" className="field-error">{error}</p>}
  </div>;
}
