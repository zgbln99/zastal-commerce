"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { catalog } from "../lib/catalog";
import { extendCartLine, updateCartLine, mergeCatalog, lineUnitPrice, normalizeCart, normalizeFavorites, normalizePersonalization, normalizeStoreStatus, PRELAUNCH_STATUS, removePurchased as subtractPurchased, type CartLine, type Product, type Personalization, type Player, type PrintDisplay, type StoreStatus } from "../lib/commerce.mjs";

type Store = {
  products: Product[]; cart: CartLine[]; favorites: number[]; hydrated: boolean;
  status: "loading" | "ready" | "error"; error: string; storageError: boolean;
  players: Player[]; playersStatus: "loading" | "ready" | "error"; playersError: string; refreshPlayers: () => Promise<void>;
  refresh: () => Promise<void>; add: (id: number, size: string, quantity?: number, personalization?: Personalization, display?: PrintDisplay) => boolean;
  update: (id: number, size: string, quantity: number, personalization?: Personalization) => void; clear: () => void; removePurchased: (items: CartLine[]) => void;
  favorite: (id: number) => void; count: number; subtotal: number;
  dialog: "cart" | "search" | "menu" | null; setDialog: (dialog: Store["dialog"]) => void;
  quickId: number | null; setQuickId: (id: number | null) => void;
  notice: string; setNotice: (text: string) => void;
  sales: StoreStatus; refreshSales: () => Promise<void>;
};
const Context = createContext<Store | null>(null);
const CART = "zastal_store_cart_v2", FAVORITES = "zastal_store_favs";
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>(catalog.map(p => ({ ...p, stock: 0, variants: [], verified: false })));
  const [players, setPlayers] = useState<Player[]>([]);
  const [playersStatus, setPlayersStatus] = useState<Store["playersStatus"]>("loading");
  const [playersError, setPlayersError] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<Store["status"]>("loading");
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [dialog, setDialog] = useState<Store["dialog"]>(null);
  const [quickId, setQuickId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [sales, setSales] = useState<StoreStatus>(PRELAUNCH_STATUS);
  const refreshSales = useCallback(async () => {
    try {
      const response = await fetch("/api/store/status", { cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error();
      setSales(normalizeStoreStatus(await response.json()));
    } catch { setSales(old => ({ ...old, loaded: true })); }
  }, []);
  useEffect(() => { void refreshSales(); }, [refreshSales]);
  useEffect(() => {
    try {
      setCart(normalizeCart(localStorage.getItem(CART)));
      setFavorites(normalizeFavorites(localStorage.getItem(FAVORITES)));
    } catch { setStorageError(true); }
    setHydrated(true);
    const sync = (event: StorageEvent) => {
      if (event.key === CART) setCart(normalizeCart(event.newValue));
      if (event.key === FAVORITES) setFavorites(normalizeFavorites(event.newValue));
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
      if (!Array.isArray(rows)) throw new Error("Katalog jest chwilowo niedostępny.");
      setProducts(mergeCatalog(rows, catalog));
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
  const refreshPlayers = useCallback(async () => {
    setPlayersStatus("loading"); setPlayersError("");
    try {
      const response = await fetch("/api/players", { cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!Array.isArray(data.players)) throw new Error();
      setPlayers(data.players.filter((p: Player) => Number.isSafeInteger(p.id) && p.id > 0 && typeof p.name === "string" && normalizePersonalization({ mode: "custom", name: p.print_name, number: p.number })));
      setPlayersStatus("ready");
    } catch { setPlayers([]); setPlayersStatus("error"); setPlayersError("Nie można pobrać aktualnej kadry."); }
  }, []);
  useEffect(() => {
    void refreshPlayers();
    const onFocus = () => { void refreshPlayers(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshPlayers]);
  const add = (id: number, size: string, quantity = 1, personalization?: Personalization, display?: PrintDisplay) => {
    const product = products.find(p => p.id === id);
    if (!hydrated || status !== "ready" || !product?.verified) { setNotice("Najpierw sprawdzimy dostępność produktu."); return false; }
    const print = normalizePersonalization(personalization);
    if (print === null) { setNotice("Sprawdź nazwisko i numer na nadruku."); return false; }
    const player = print?.mode === "player" ? players.find(player => player.id === print.player_id) : undefined;
    if (print?.mode === "player" && (playersStatus !== "ready" || !player)) { setNotice("Wybierz zawodnika z aktualnej kadry."); return false; }
    const printDisplay: PrintDisplay | undefined = print?.mode === "custom" ? { name: print.name, number: print.number, fee: product.personalization_fee || 0 } : player ? { name: player.print_name, number: player.number, fee: product.personalization_fee || 0 } : undefined;
    const line: CartLine = { id, size: size || "UNI", quantity, ...(print ? { personalization: print } : {}), ...(printDisplay ? { personalization_display: printDisplay } : {}) };
    if (!extendCartLine(cart, line, products)) { setNotice("Sprawdź nadruk, rozmiar i dostępną ilość. Koszyk mieści 20 pozycji."); return false; }
    setCart(old => extendCartLine(old, line, products) || old);
    setQuickId(null); setDialog("cart"); return true;
  };
  const update = (id: number, size: string, quantity: number, personalization?: Personalization) => {
    setCart(old => updateCartLine(old, id, size, quantity, personalization, products));
  };
  const favorite = (id: number) => { if (hydrated) setFavorites(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]); };
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + lineUnitPrice(products.find(p => p.id === line.id), line) * line.quantity, 0), [cart, products]);
  return <Context.Provider value={{ products, cart, favorites, hydrated, status, error, storageError, players, playersStatus, playersError, refreshPlayers, refresh: () => refresh(), add, update, clear: () => setCart([]), removePurchased: items => setCart(old => subtractPurchased(old, items)), favorite, count, subtotal, dialog, setDialog, quickId, setQuickId, notice, setNotice, sales, refreshSales }}>{children}</Context.Provider>;
}
export function useStore() {
  const context = useContext(Context);
  if (!context) throw new Error("StoreProvider missing");
  return context;
}
