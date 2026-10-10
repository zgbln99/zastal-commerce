"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { catalog } from "../lib/catalog";
import { availableQty, normalizeCart, normalizeFavorites, removePurchased as subtractPurchased, type CartLine, type Product, type Variant } from "../lib/commerce.mjs";

type Store = {
  products: Product[]; cart: CartLine[]; favorites: number[]; hydrated: boolean;
  status: "loading" | "ready" | "error"; error: string; storageError: boolean;
  refresh: () => Promise<void>; add: (id: number, size: string, quantity?: number) => boolean;
  update: (id: number, size: string, quantity: number) => void; clear: () => void; removePurchased: (items: CartLine[]) => void;
  favorite: (id: number) => void; count: number; subtotal: number;
  dialog: "cart" | "search" | "menu" | null; setDialog: (dialog: Store["dialog"]) => void;
  quickId: number | null; setQuickId: (id: number | null) => void;
  notice: string; setNotice: (text: string) => void;
};
const Context = createContext<Store | null>(null);
const CART = "zastal_store_cart_v2", FAVORITES = "zastal_store_favs";
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>(catalog.map(p => ({ ...p, stock: 0, variants: [], verified: false })));
  const [cart, setCart] = useState<CartLine[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<Store["status"]>("loading");
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [dialog, setDialog] = useState<Store["dialog"]>(null);
  const [quickId, setQuickId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      setCart(normalizeCart(localStorage.getItem(CART), catalog));
      setFavorites(normalizeFavorites(localStorage.getItem(FAVORITES), catalog));
    } catch { setStorageError(true); }
    setHydrated(true);
    const sync = (event: StorageEvent) => {
      if (event.key === CART) setCart(normalizeCart(event.newValue, catalog));
      if (event.key === FAVORITES) setFavorites(normalizeFavorites(event.newValue, catalog));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(CART, JSON.stringify(cart)); } catch { setStorageError(true); }
  }, [cart, hydrated]);
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(FAVORITES, JSON.stringify(favorites)); } catch { setStorageError(true); }
  }, [favorites, hydrated]);
  const refresh = useCallback(async (background = false) => {
    if (!background) setStatus("loading");
    try {
      const r = await fetch("/api/catalog", { cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error("Nie udało się odczytać magazynu.");
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows.length) throw new Error("Katalog jest chwilowo niedostępny.");
      setProducts(catalog.map(p => {
        const record = rows.find(r => r.id === p.id);
        const verified = record && Number.isInteger(record.price) && record.price >= 0 && Array.isArray(record.variants);
        const variants: Variant[] = verified ? record.variants.filter((v: Variant) => Number.isInteger(v.stock) && v.stock >= 0 && typeof v.size === "string" && (p.sizes || ["UNI"]).includes(v.size)) : [];
        return { ...p, ...(verified ? { price: record.price, name: record.name || p.name } : {}), stock: variants.reduce((sum, v) => sum + v.stock, 0), variants, verified: !!verified };
      }));
      setStatus("ready"); setError("");
    } catch { setStatus("error"); setError("Nie możemy teraz sprawdzić cen i dostępności. Spróbuj ponownie za chwilę."); }
  }, []);
  useEffect(() => {
    refresh();
    const onFocus = () => { refresh(true); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 5000); return () => clearTimeout(timer); }, [notice]);
  const add = (id: number, size: string, quantity = 1) => {
    const product = products.find(p => p.id === id);
    const normalizedSize = size || "UNI";
    const existing = cart.find(line => line.id === id && line.size === normalizedSize)?.quantity || 0;
    if (!hydrated || status !== "ready" || !product?.verified) { setNotice("Najpierw sprawdzimy dostępność produktu."); return false; }
    if (!Number.isInteger(quantity) || quantity < 1 || existing + quantity > Math.min(20, availableQty(product, normalizedSize))) {
      setNotice("Wybrany rozmiar nie jest dostępny w tej ilości."); return false;
    }
    if (cart.length >= 20 && !existing) { setNotice("Koszyk może zawierać maksymalnie 20 różnych pozycji."); return false; }
    setCart(old => existing ? old.map(line => line.id === id && line.size === normalizedSize ? { ...line, quantity: line.quantity + quantity } : line) : [...old, { id, size: normalizedSize, quantity }]);
    setQuickId(null); setDialog("cart"); return true;
  };
  const update = (id: number, size: string, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 0) return;
    setCart(old => old.map(line => line.id === id && line.size === size ? { ...line, quantity: Math.min(20, quantity) } : line).filter(line => line.quantity > 0));
  };
  const favorite = (id: number) => { if (hydrated) setFavorites(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]); };
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + (products.find(p => p.id === line.id)?.price || 0) * line.quantity, 0), [cart, products]);
  return <Context.Provider value={{ products, cart, favorites, hydrated, status, error, storageError, refresh: () => refresh(), add, update, clear: () => setCart([]), removePurchased: items => setCart(old => subtractPurchased(old, items)), favorite, count, subtotal, dialog, setDialog, quickId, setQuickId, notice, setNotice }}>{children}</Context.Provider>;
}
export function useStore() {
  const context = useContext(Context);
  if (!context) throw new Error("StoreProvider missing");
  return context;
}
