"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Heart, Menu, Minus, Plus, Search, ShoppingBag, Trash2, Truck, UserRound, X } from "lucide-react";
import { fmt } from "../lib/catalog";
import { availableQty, canCheckout, cartLineKey, filterProducts, lineUnitPrice, personalizationLabel, productDisplayPrice, variantCartQuantity } from "../lib/commerce.mjs";
import { useStore } from "./StoreProvider";
import { ProductImage } from "./ProductCard";
import PurchaseControls from "./PurchaseControls";
import Modal from "./Modal";
import YnsHeader from "./YnsHeader";
import {useAuth} from "./AuthProvider";
import PriceReduction from "./PriceReduction";
import FreeShipping from "./FreeShipping";

const CATEGORIES = ["Koszulki", "Bluzy", "Akcesoria", "Dzieci"];
const categoryUrl = (c: string) => "/sklep?category=" + encodeURIComponent(c);
function SearchDialog() {
  const store = useStore(); const router = useRouter();
  const [query, setQuery] = useState("");
  const results = filterProducts(store.products, { query });
  return <Modal title="Szukaj produktów" onClose={() => store.setDialog(null)} className="search-modal"><div className="modal-title"><h2>Szukaj w sklepie</h2><button className="icon-btn" aria-label="Zamknij wyszukiwarkę" onClick={() => store.setDialog(null)}><X size={22}/></button></div><form className="search-form" onSubmit={e => { e.preventDefault(); store.setDialog(null); router.push("/sklep?q=" + encodeURIComponent(query)); }}><Search size={21}/><input data-autofocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Nazwa produktu lub kolekcja" aria-label="Wyszukaj produkt"/><button className="icon-btn" aria-label="Pokaż wszystkie wyniki" type="submit"><ArrowRight size={20}/></button></form><div className="search-results-heading">{query ? "Wyniki wyszukiwania: " + results.length : "Produkty w sklepie"}</div>{results.length ? <div className="search-results">{results.slice(0, 5).map(p => <Link href={"/produkt/" + p.id} key={p.id} onClick={() => store.setDialog(null)}><span className="search-result-image"><ProductImage product={p}/></span><span><strong>{p.name}</strong><small>{p.category}</small></span><b>{p.verified ? fmt(productDisplayPrice(p)) : "…"}</b><ChevronRight size={16}/></Link>)}</div> : <div className="search-no-results"><Search size={28}/><p>Brak wyników dla „{query}”.</p><span>Spróbuj nazwy kategorii: koszulki, bluzy lub akcesoria.</span></div>}<Link href={"/sklep" + (query ? "?q=" + encodeURIComponent(query) : "")} className="search-all" onClick={() => store.setDialog(null)}>Zobacz wszystkie wyniki <ArrowRight size={17}/></Link></Modal>;
}
function CartDialog() {
  const store = useStore(); const router = useRouter();
  const checkedPlayers = store.playersStatus === "ready" ? store.players : [];
  const valid = store.status === "ready" && canCheckout(store.cart, store.products, checkedPlayers);
  const prices = store.status === "ready" && store.cart.every(line => store.products.find(p => p.id === line.id)?.verified);
  return <Modal title="Twój koszyk" onClose={() => store.setDialog(null)} drawer className="cart-modal"><div className="modal-title"><div><h2>Twój koszyk <span>({store.count})</span></h2><p>{store.cart.length ? "Sprawdź produkty przed zamówieniem." : "Tutaj pojawią się wybrane produkty."}</p></div><button className="icon-btn" aria-label="Zamknij koszyk" onClick={() => store.setDialog(null)}><X size={22}/></button></div>{store.cart.length ? <>{store.sales.checkoutEnabled ? <div className="shipping-progress"><Truck size={19}/><div><strong>{store.sales.shipping.some(m => m.free_from != null && store.subtotal >= m.free_from) ? "Masz bezpłatną dostawę" : store.sales.shipping.find(m => m.free_from != null) ? "Bezpłatna dostawa od " + fmt(Math.min(...store.sales.shipping.filter(m => m.free_from != null).map(m => m.free_from as number))) : "Dostawa lub odbiór osobisty"}</strong><p style={{margin:"5px 0 0",fontSize:11,lineHeight:1.6}}>Koszt dostawy i płatność wybierzesz w podsumowaniu zamówienia.</p></div></div> : <div className="shipping-progress"><Truck size={19}/><div><strong>Zamówienia online chwilowo niedostępne</strong><p style={{margin:"5px 0 0",fontSize:11,lineHeight:1.6}}>Informacje o dostawie i płatnościach znajdziesz w pomocy.</p></div></div>}<div className="cart-items">{store.cart.map(line => {
    const p = store.products.find(x => x.id === line.id);
    const name = p?.name || "Produkt #" + line.id;
    const stock = availableQty(p, line.size);
    const combined = variantCartQuantity(store.cart, line.id, line.size);
    const insufficient = store.status === "ready" && combined > stock;
    const playerId = line.personalization?.mode === "player" ? line.personalization.player_id : null;
    const printInvalid = store.status === "ready" && p && ((!p.personalization_enabled && !!line.personalization) || (p.personalization_required && !line.personalization) || (playerId != null && store.playersStatus === "ready" && !store.players.some(player => player.id === playerId)));
    const printPending = line.personalization?.mode === "player" && store.playersStatus !== "ready";
    const printLabel = personalizationLabel(line, store.players);
    const fee = p?.personalization_enabled ? p.personalization_fee || 0 : 0;
    return <article className="cart-item" key={cartLineKey(line)}><Link href={"/produkt/" + line.id} onClick={() => store.setDialog(null)} className="cart-item-image"><ProductImage product={p || { name, image: "/assets/product-unavailable.svg" }}/></Link><div className="cart-item-body"><Link href={"/produkt/" + line.id} onClick={() => store.setDialog(null)}>{name}</Link><small>{line.size === "UNI" ? "Rozmiar uniwersalny" : "Rozmiar: " + line.size}</small>{printLabel && <small className="line-print">{printLabel}<span>{prices ? fee ? "+" + fmt(fee) + " / szt." : "Bez dopłaty" : "Sprawdzanie opłaty za nadruk…"}</span></small>}<strong>{prices ? fmt(lineUnitPrice(p, line) * line.quantity) : "…"}</strong><div className="cart-item-tools"><div className="quantity-control"><button aria-label={"Zmniejsz ilość: " + name} onClick={() => store.update(line.id, line.size, line.quantity - 1, line.personalization)}><Minus size={14}/></button><span>{line.quantity}</span><button aria-label={"Zwiększ ilość: " + name} onClick={() => store.update(line.id, line.size, line.quantity + 1, line.personalization)} disabled={store.status !== "ready" || !p?.verified || line.quantity >= 20 || combined >= stock}><Plus size={14}/></button></div><button className="remove-item" onClick={() => store.update(line.id, line.size, 0, line.personalization)} aria-label={"Usuń: " + name}><Trash2 size={16}/></button></div>{!p && store.status === "ready" && <p className="field-error">Produkt nie jest już dostępny w katalogu. Usuń tę pozycję.</p>}{p && insufficient && <p className="field-error">Dostępne: {stock} szt. Łącznie w tym rozmiarze masz {combined} szt. Zmniejsz ilość.</p>}{printInvalid && <p className="field-error">Opcje personalizacji tego produktu się zmieniły. Usuń go z koszyka i wybierz ponownie.</p>}{printPending && <p className="input-hint">{store.playersStatus === "loading" ? "Sprawdzamy wybranego zawodnika…" : "Nie udało się pobrać listy zawodników. Spróbuj ponownie."}{store.playersStatus === "error" && <button className="inline-link" onClick={() => void store.refreshPlayers()}>Odśwież kadrę</button>}</p>}</div></article>;
  })}</div><div className="cart-summary"><div><span>Produkty</span><strong>{prices ? fmt(store.subtotal) : "…"}</strong></div><FreeShipping subtotal={store.subtotal} methods={store.sales.shipping} enabled={store.sales.checkoutEnabled && prices}/><p>Koszt dostawy wybierzesz w następnym kroku.</p>{store.error && <p className="field-error">{store.error}</p>}<button className="button button-dark" disabled={!valid} onClick={() => { store.setDialog(null); router.push("/zamowienie"); }}>{store.sales.checkoutEnabled ? "Przejdź do zamówienia" : "Informacje o zamówieniach"} <ArrowRight size={18}/></button><button className="continue-shopping" onClick={() => store.setDialog(null)}>Kontynuuj zakupy</button><small>{store.sales.checkoutEnabled ? "Ceny brutto w złotych. Dostawę wybierzesz w następnym kroku." : "Zamówienia online są obecnie wstrzymane."}</small></div></> : <div className="empty-cart"><ShoppingBag size={45} strokeWidth={1.2}/><h3>Koszyk jest pusty</h3><p>Zacznij od koszulek, bluz lub klubowych akcesoriów.</p><Link className="button button-dark" href="/sklep" onClick={() => store.setDialog(null)}>Przejdź do sklepu <ArrowRight size={18}/></Link></div>}</Modal>;
}
function QuickProduct() {
  const store = useStore(); const p = store.products.find(x => x.id === store.quickId);
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  if (!p) return null;
  return <Modal title={p.name} onClose={() => store.setQuickId(null)} className="quick-modal"><button className="quick-close icon-btn" aria-label="Zamknij produkt" onClick={() => store.setQuickId(null)}><X size={22}/></button><div className="quick-image"><ProductImage product={p}/></div><div className="quick-content"><span className="eyebrow">{p.category}</span><h2>{p.name}</h2><p>{p.subtitle}</p><div className="quick-price">{p.verified ? fmt(selectedPrice ?? p.price + (p.personalization_required ? p.personalization_fee || 0 : 0)) : "Sprawdzanie ceny…"}<PriceReduction product={p}/></div><PurchaseControls product={p} onUnitPriceChange={setSelectedPrice}/><Link className="inline-link" href={"/produkt/" + p.id} onClick={() => store.setQuickId(null)}>Pełny opis produktu <ArrowUpRight size={16}/></Link>{!store.sales.checkoutEnabled && <p className="quiet-note">Zamówienia online są obecnie niedostępne.</p>}</div></Modal>;
}
export default function StoreShell({ children }: { children: React.ReactNode }) {
  const store = useStore(); const pathname = usePathname();const auth=useAuth();const router=useRouter();
  useEffect(() => { store.setDialog(null); store.setQuickId(null); }, [pathname]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); store.setQuickId(null); store.setDialog("search"); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);
  return <div className="store-site"><a href="#main-content" className="skip-link">Przejdź do treści</a><YnsHeader pathname={pathname} count={store.count} favorites={store.favorites.length} signedIn={Boolean(auth.user)} checkoutEnabled={store.sales.checkoutEnabled} openCart={() => store.setDialog("cart")} openSearch={() => store.setDialog("search")} openMenu={() => store.setDialog("menu")}/>
    {store.status === "error" && <div className="catalog-error"><div className="container"><span>{store.error}</span><button onClick={store.refresh}>Spróbuj ponownie</button></div></div>}
    <main id="main-content">{children}</main>
    <footer className="store-footer yns-footer">
      <div className="container yns-footer-main">
        <div className="yns-footer-brand">
          <Link href="/" className="yns-footer-wordmark"><img src="/assets/zastal-logo.svg" alt="Zastal Zielona Góra"/><span>STORE</span></Link>
          <p>Koszulki, bluzy i akcesoria w barwach Zastalu.</p>
          <a href="mailto:office@basketzg.pl">office@basketzg.pl</a>
        </div>
        <nav aria-label="Produkty" className="yns-footer-column"><h2>Sklep</h2><Link href="/sklep">Wszystkie produkty</Link>{CATEGORIES.map(c => <Link key={c} href={categoryUrl(c)}>{c === "Dzieci" ? "Dla dzieci" : c}</Link>)}</nav>
        <nav aria-label="Zakupy i konto" className="yns-footer-column"><h2>Zakupy</h2><Link href="/pomoc#dostawa">Dostawa i odbiór</Link><Link href="/pomoc#zamowienia">Płatności</Link><Link href="/informacje/zwroty">Zwroty i reklamacje</Link><Link href="/konto">Moje konto</Link><Link href="/pomoc">Pomoc</Link></nav>
        <nav aria-label="Informacje o sklepie" className="yns-footer-column"><h2>Informacje</h2>{store.sales.pages.filter(page => page.slug !== "zwroty").map(page => <Link key={page.slug} href={"/informacje/" + page.slug}>{page.title}</Link>)}<a href="https://basketzg.pl/" target="_blank" rel="noreferrer">Strona klubu <ArrowUpRight size={14}/></a></nav>
      </div>
      <div className="container yns-footer-bottom"><span>© {new Date().getFullYear()} Zastal Store</span><span>Zastal Zielona Góra</span></div>
    </footer>
    {store.dialog === "menu" && <Modal title="Menu sklepu" onClose={() => store.setDialog(null)} drawer className="menu-modal"><div className="modal-title"><h2>Sklep Zastalu</h2><button className="icon-btn" aria-label="Zamknij menu" onClick={() => store.setDialog(null)}><X/></button></div><nav><Link href="/sklep" onClick={() => store.setDialog(null)}>Wszystkie produkty <ArrowRight size={19}/></Link>{CATEGORIES.map(c => <Link href={categoryUrl(c)} key={c} onClick={() => store.setDialog(null)}>{c === "Dzieci" ? "Dla dzieci" : c}<ArrowRight size={19}/></Link>)}<Link href="/konto" onClick={()=>store.setDialog(null)}>Moje konto <UserRound size={18}/></Link><Link href="/ulubione" onClick={() => store.setDialog(null)}>Ulubione <Heart size={18}/></Link><Link href="/pomoc" onClick={() => store.setDialog(null)}>Pomoc i dostawa <ArrowRight size={19}/></Link></nav></Modal>}
    {store.dialog === "search" && <SearchDialog/>}{store.dialog === "cart" && <CartDialog/>}{store.quickId != null && <QuickProduct key={store.quickId}/>}
    {store.notice && <div className="store-toast" role="status"><span>{store.notice}</span><button aria-label="Zamknij powiadomienie" onClick={() => store.setNotice("")}><X size={17}/></button></div>}
    {store.storageError && <div className="storage-note" role="status">Ta przeglądarka nie zapisuje koszyka. Wybór zachowamy do końca tej wizyty.</div>}
  </div>;
}
