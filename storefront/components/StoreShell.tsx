"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, At, Call, Check, ChevronDown, ChevronRight, Heart, Location, Menu2, Minus, Plus, Search, ShoppingCart, Trash, TruckFast, User, X } from "reicon-react";
import { fmt } from "../lib/catalog";
import { availableQty, canCheckout, cartLineKey, filterProducts, lineUnitPrice, personalizationLabel, productDisplayPrice, productPath, variantCartQuantity } from "../lib/commerce.mjs";
import { useStore } from "./StoreProvider";
import { ProductImage } from "./ProductCard";
import PurchaseControls from "./PurchaseControls";
import Modal from "./Modal";
import { useAuth } from "./AuthProvider";
import PriceReduction from "./PriceReduction";
import FreeShipping from "./FreeShipping";
import SearchBox from "./search/SearchBox";
import PromoField, { storePromo, type PromoPreview } from "./PromoField";
import NewsletterForm from "./NewsletterForm";
import CompetitionLogos from "./CompetitionLogos";
import { TextureButton } from "@/components/templates/essentials/ui/texture-button";
import { cn } from "@/lib/utils";
import { categoryPath, categorySlug } from "../lib/site";

const CATEGORIES = ["Koszulki", "Bluzy", "Akcesoria", "Dzieci"];
const label = (c: string) => c === "Dzieci" ? "Dla dzieci" : c;
const categoryUrl = (c: string) => categoryPath(c);
const pill = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted";
const pillActive = "border-primary bg-primary text-primary-foreground hover:bg-primary";
const iconButton = "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:opacity-50";

function SearchDialog() {
  const store = useStore();
  return <Modal title="Szukaj produktów" onClose={() => store.setDialog(null)} className="search-modal">
    <div className="modal-title"><h2>Szukaj w sklepie</h2><button className={iconButton} aria-label="Zamknij wyszukiwarkę" onClick={() => store.setDialog(null)}><X size={20}/></button></div>
    <SearchBox products={store.products} autoFocus onNavigate={() => store.setDialog(null)}/>
    <p className="mt-4 text-xs text-muted-foreground">Wpisz nazwę produktu, kolekcję albo kategorię: koszulki, bluzy, akcesoria.</p>
  </Modal>;
}

function CartDialog() {
  const [promo, setPromo] = useState<PromoPreview | null>(null);
  const store = useStore(); const router = useRouter();
  const checkedPlayers = store.playersStatus === "ready" ? store.players : [];
  const valid = store.status === "ready" && canCheckout(store.cart, store.products, checkedPlayers);
  const prices = store.status === "ready" && store.cart.every(line => store.products.find(p => p.id === line.id)?.verified);
  const freeFrom = store.sales.shipping.filter(m => m.free_from != null).map(m => m.free_from as number);
  return <Modal title="Twój koszyk" onClose={() => store.setDialog(null)} drawer className="cart-modal">
    <div className="modal-title"><div><h2>Twój koszyk <span className="text-muted-foreground">({store.count})</span></h2><p>{store.cart.length ? "Sprawdź produkty przed zamówieniem." : "Tutaj pojawią się wybrane produkty."}</p></div><button className={iconButton} aria-label="Zamknij koszyk" onClick={() => store.setDialog(null)}><X size={20}/></button></div>
    {store.cart.length ? <>
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted p-3 text-sm"><TruckFast size={18} className="mt-0.5 shrink-0 text-primary"/><div><strong className="font-medium">{store.sales.checkoutEnabled ? (freeFrom.length && store.subtotal >= Math.min(...freeFrom) ? "Masz bezpłatną dostawę" : freeFrom.length ? "Bezpłatna dostawa od " + fmt(Math.min(...freeFrom)) : "Dostawa lub odbiór osobisty") : "Zamówienia online chwilowo niedostępne"}</strong><p className="mt-0.5 text-xs text-muted-foreground">{store.sales.checkoutEnabled ? "Koszt dostawy i płatność wybierzesz w podsumowaniu zamówienia." : "Informacje o dostawie i płatnościach znajdziesz w pomocy."}</p></div></div>
      <div className="mt-4 flex-1 divide-y divide-border">{store.cart.map(line => {
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
        return <article className="cart-item flex gap-4 py-4" key={cartLineKey(line)}>
          <Link href={productPath(p || { id: line.id })} onClick={() => store.setDialog(null)} className="size-24 shrink-0 overflow-hidden rounded-xl bg-muted"><ProductImage product={p || { name, image: "/assets/product-unavailable.svg" }} sizes="96px" className="size-full object-cover"/></Link>
          <div className="min-w-0 flex-1 text-sm">
            <Link href={productPath(p || { id: line.id })} onClick={() => store.setDialog(null)} className="block font-medium hover:text-primary">{name}</Link>
            <small className="block text-xs text-muted-foreground">{line.size === "UNI" ? "Rozmiar uniwersalny" : "Rozmiar: " + line.size}</small>
            {printLabel && <small className="block text-xs text-muted-foreground">{printLabel} <span>· {prices ? fee ? "+" + fmt(fee) + " / szt." : "Bez dopłaty" : "Sprawdzanie opłaty za nadruk…"}</span></small>}
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="inline-flex h-9 items-center rounded-full border border-border"><button className="inline-flex size-9 items-center justify-center rounded-full hover:bg-muted" aria-label={"Zmniejsz ilość: " + name} onClick={() => store.update(line.id, line.size, line.quantity - 1, line.personalization)}><Minus size={14}/></button><span className="min-w-6 text-center text-sm font-medium">{line.quantity}</span><button className="inline-flex size-9 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40" aria-label={"Zwiększ ilość: " + name} onClick={() => store.update(line.id, line.size, line.quantity + 1, line.personalization)} disabled={store.status !== "ready" || !p?.verified || line.quantity >= 20 || combined >= stock}><Plus size={14}/></button></div>
              <strong className="font-medium">{prices ? fmt(lineUnitPrice(p, line) * line.quantity) : "…"}</strong>
              <button className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive" onClick={() => store.update(line.id, line.size, 0, line.personalization)} aria-label={"Usuń: " + name}><Trash size={16}/></button>
            </div>
            {!p && store.status === "ready" && <p className="field-error mt-2">Produkt nie jest już dostępny w katalogu. Usuń tę pozycję.</p>}
            {p && insufficient && <p className="field-error mt-2">Dostępne: {stock} szt. Łącznie w tym rozmiarze masz {combined} szt. Zmniejsz ilość.</p>}
            {printInvalid && <p className="field-error mt-2">Opcje personalizacji tego produktu się zmieniły. Usuń go z koszyka i wybierz ponownie.</p>}
            {printPending && <p className="input-hint mt-2">{store.playersStatus === "loading" ? "Sprawdzamy wybranego zawodnika…" : "Nie udało się pobrać listy zawodników. Spróbuj ponownie."}{store.playersStatus === "error" && <button className="inline-link ml-1" onClick={() => void store.refreshPlayers()}>Odśwież kadrę</button>}</p>}
          </div>
        </article>;
      })}</div>
      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Produkty</span><strong className="text-base font-medium">{prices ? fmt(store.subtotal) : "…"}</strong></div>
        <div className="mt-3"><PromoField subtotal={store.subtotal} enabled={store.sales.checkoutEnabled && prices} onChange={setPromo}/></div>
        <FreeShipping subtotal={Math.max(0, store.subtotal - (promo?.discount || 0))} methods={store.sales.shipping} enabled={store.sales.checkoutEnabled && prices}/>
        <p className="mt-2 text-xs text-muted-foreground">Koszt dostawy wybierzesz w następnym kroku. <Link href="/koszyk" onClick={() => store.setDialog(null)} className="underline underline-offset-2 hover:text-foreground">Pełny koszyk</Link></p>
        {store.error && <p className="field-error mt-2">{store.error}</p>}
        <TextureButton size="lg" className="mt-4 w-full" disabled={!valid} onClick={() => { store.setDialog(null); router.push("/zamowienie"); }}>{store.sales.checkoutEnabled ? "Przejdź do zamówienia" : "Informacje o zamówieniach"} <ArrowRight size={18}/></TextureButton>
        <button className="mt-3 w-full text-center text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => store.setDialog(null)}>Kontynuuj zakupy</button>
        <small className="mt-3 block text-center text-xs text-muted-foreground">{store.sales.checkoutEnabled ? "Ceny brutto w złotych. Dostawę wybierzesz w następnym kroku." : "Zamówienia online są obecnie wstrzymane."}</small>
      </div>
    </> : <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center"><span className="flex size-16 items-center justify-center rounded-full bg-muted text-primary"><ShoppingCart size={28}/></span><h3 className="text-lg font-medium">Koszyk jest pusty</h3><p className="text-sm text-muted-foreground">Zacznij od koszulek, bluz lub klubowych akcesoriów.</p><TextureButton className="mt-2" render={<Link href="/sklep" onClick={() => store.setDialog(null)}/>}>Przejdź do sklepu <ArrowRight size={16}/></TextureButton></div>}
  </Modal>;
}

function QuickProduct() {
  const store = useStore(); const p = store.products.find(x => x.id === store.quickId);
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  if (!p) return null;
  return <Modal title={p.name} onClose={() => store.setQuickId(null)} className="sm:max-w-3xl">
    <button className={cn(iconButton, "absolute right-4 top-4 z-10")} aria-label="Zamknij produkt" onClick={() => store.setQuickId(null)}><X size={20}/></button>
    <div className="grid gap-6 sm:grid-cols-[1fr_1.1fr]">
      <div className="aspect-[4/5] overflow-hidden rounded-xl bg-muted"><ProductImage product={p} sizes="(min-width: 640px) 40vw, 100vw" className="size-full object-cover"/></div>
      <div className="flex flex-col gap-3">
        <span className="eyebrow">{label(p.category)}</span>
        <h2 className="text-2xl font-medium leading-tight">{p.name}</h2>
        <p className="text-sm text-muted-foreground">{p.subtitle}</p>
        <div className="text-xl font-medium">{p.verified ? fmt(selectedPrice ?? p.price + (p.personalization_required ? p.personalization_fee || 0 : 0)) : "Sprawdzanie ceny…"}<PriceReduction product={p}/></div>
        <PurchaseControls product={p} onUnitPriceChange={setSelectedPrice}/>
        <Link className="inline-link" href={productPath(p)} onClick={() => store.setQuickId(null)}>Pełny opis produktu <ArrowUpRight size={16}/></Link>
        {!store.sales.checkoutEnabled && <p className="quiet-note">Zamówienia online są obecnie niedostępne.</p>}
      </div>
    </div>
  </Modal>;
}

export default function StoreShell({ children }: { children: React.ReactNode }) {
  const store = useStore(); const pathname = usePathname(); const auth = useAuth(); const router = useRouter();
  useEffect(() => { store.setDialog(null); store.setQuickId(null); }, [pathname]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); store.setQuickId(null); store.setDialog("search"); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);
  const params = useSearchParams();
  const activeCategory = pathname === "/sklep" ? params?.get("category") || "" : pathname?.startsWith("/kategoria/") ? CATEGORIES.find(c => "/kategoria/" + categorySlug(c) === pathname) || "" : "";
  const notice = !store.sales.checkoutEnabled;
  const seller = store.sales.seller;
  const year = new Date().getFullYear();
  const brand = store.sales.brand;
  const [shopOpen, setShopOpen] = useState(false);
  useEffect(() => { setShopOpen(false); }, [pathname]);
  // A scanned poster (/sklep?kod=MECZ2410) keeps the code for the cart; the shopper sees it was picked up.
  const [scannedCode, setScannedCode] = useState("");
  useEffect(() => {
    const code = (params?.get("kod") || "").trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{2,23}$/.test(code)) return;
    storePromo(code); setScannedCode(code);
    const timer = window.setTimeout(() => setScannedCode(""), 9000);
    return () => window.clearTimeout(timer);
  }, [params]);
  // The header is fixed: 64 px top bar on phones, 88 px bar + 48 px menu on desktop, plus 32 px for the pre-launch notice.
  const offset = pathname === "/" ? "" : notice ? "pt-24 md:pt-42" : "pt-16 md:pt-34";
  const menuLink = "inline-flex h-12 items-center gap-1 border-b-2 border-transparent px-3.5 text-[15px] font-medium text-white/90 transition-colors hover:border-orange hover:text-white";
  const menuActive = "border-orange text-white";
  const coverFor = (category: string) => store.products.find(p => p.category === category);
  return <div className={cn("store-site flex min-h-dvh flex-col bg-background text-foreground", offset)}>
    <a href="#main-content" className="skip-link">Przejdź do treści</a>
    <header className="fixed inset-x-0 top-0 z-40 bg-background shadow-[0_1px_0_0_var(--border)]" onMouseLeave={() => setShopOpen(false)}>
      {notice && <div className="bg-orange text-white"><div className="container flex h-8 items-center justify-between gap-4 text-xs"><span className="font-semibold">Zastal Zielona Góra</span><Link href="/pomoc" className="truncate hover:underline">Zamówienia online chwilowo niedostępne</Link></div></div>}
      <div className="container flex h-16 items-center gap-3 md:h-22 md:gap-6">
        <button className={cn(iconButton, "md:hidden")} aria-label="Otwórz menu" onClick={() => store.setDialog("menu")}><Menu2 size={20}/></button>
        <Link href="/" className="flex shrink-0 items-center" aria-label="Zastal Store, strona główna">
          <img src="/assets/zastal-logo.svg" alt="Zastal Zielona Góra" className="h-9 w-auto sm:h-10 md:h-[60px]" width={212} height={60}/>
        </Link>
        <SearchBox products={store.products} className="mx-auto hidden w-full max-w-lg md:block"/>
        <div className="ml-auto flex items-center gap-1.5 md:gap-2">
          <button className={cn(iconButton, "md:hidden")} aria-label="Szukaj produktów" onClick={() => store.setDialog("search")}><Search size={20}/></button>
          <Link className={cn(iconButton, "relative hidden sm:inline-flex md:size-12")} href="/ulubione" aria-label={"Ulubione: " + store.favorites.length}><Heart size={22}/>{store.favorites.length > 0 && <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-orange text-[11px] font-semibold text-white">{store.favorites.length}</span>}</Link>
          <Link className={cn(iconButton, "hidden sm:inline-flex md:size-12")} href="/konto" aria-label={auth.user ? "Moje konto" : "Konto"} title={auth.user ? "Moje konto" : "Zaloguj się"}><User size={22}/></Link>
          <button className="inline-flex h-10 items-center gap-2 rounded-full bg-primary pl-3 pr-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 md:h-12 md:pl-4 md:pr-2.5" onClick={() => store.setDialog("cart")} aria-label={"Otwórz koszyk (" + store.count + ")"}><ShoppingCart size={20}/><span className="hidden sm:inline">Koszyk</span><b className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-primary">{store.count}</b></button>
        </div>
      </div>
      <div className="hidden bg-primary text-primary-foreground md:block"><div className="container flex h-12 items-center">
        <nav className="flex h-12 items-center" aria-label="Nawigacja główna">
          <div className="relative h-12" onMouseEnter={() => setShopOpen(true)}>
            <button type="button" className={cn(menuLink, (shopOpen || pathname === "/sklep" || pathname?.startsWith("/kategoria/")) && menuActive)} aria-expanded={shopOpen} aria-haspopup="true" onClick={() => setShopOpen(open => !open)} onKeyDown={e => { if (e.key === "Escape") setShopOpen(false); }}>Sklep <ChevronDown size={14} className={cn("transition-transform", shopOpen && "rotate-180")}/></button>
            {shopOpen && <div className="absolute left-0 top-full z-50 w-[44rem] rounded-b-2xl border border-t-0 border-border bg-background p-5 text-foreground shadow-xl" onKeyDown={e => { if (e.key === "Escape") setShopOpen(false); }}>
              <div className="grid grid-cols-4 gap-3">{CATEGORIES.map(c => { const cover = coverFor(c); return <Link key={c} href={categoryUrl(c)} className="group rounded-xl border border-border p-2 transition-colors hover:border-primary/40" onClick={() => setShopOpen(false)}><span className="block aspect-square overflow-hidden rounded-lg bg-muted">{cover && <ProductImage product={cover} sizes="220px" className="size-full object-cover transition-transform duration-500 group-hover:scale-105"/>}</span><span className="mt-2 block text-sm font-semibold">{label(c)}</span><span className="block text-xs text-muted-foreground">{store.products.filter(p => p.category === c).length} produktów</span></Link>; })}</div>
              <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-4 text-sm"><Link href="/sklep" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline" onClick={() => setShopOpen(false)}>Wszystkie produkty <ArrowRight size={14}/></Link><Link href="/sklep?q=retro" className="text-muted-foreground hover:text-foreground" onClick={() => setShopOpen(false)}>Kolekcja Retro</Link><Link href="/zawodnicy" className="text-muted-foreground hover:text-foreground" onClick={() => setShopOpen(false)}>Koszulki zawodników</Link><Link href="/karta-podarunkowa" className="text-muted-foreground hover:text-foreground" onClick={() => setShopOpen(false)}>Karta podarunkowa</Link></div>
            </div>}
          </div>
          {CATEGORIES.map(c => <Link key={c} href={categoryUrl(c)} className={cn(menuLink, activeCategory === c && menuActive)} aria-current={activeCategory === c ? "page" : undefined} onMouseEnter={() => setShopOpen(false)}>{label(c)}</Link>)}
          <Link href="/zawodnicy" className={cn(menuLink, pathname === "/zawodnicy" && menuActive)} onMouseEnter={() => setShopOpen(false)}>Zawodnicy</Link>
          <Link href="/karta-podarunkowa" className={cn(menuLink, pathname === "/karta-podarunkowa" && menuActive)} onMouseEnter={() => setShopOpen(false)}>Karta podarunkowa</Link>
          <Link href="/kontakt" className={cn(menuLink, pathname === "/kontakt" && menuActive)} onMouseEnter={() => setShopOpen(false)}>Kontakt</Link>
        </nav>
        <div className="ml-auto flex items-center"><CompetitionLogos items={brand.competitions} tone="dark"/></div>
      </div></div>
    </header>
    {store.status === "error" && <div className="catalog-error border-b border-destructive/30 bg-destructive/10"><div className="container flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{store.error}</span><button className={pill} onClick={store.refresh}>Spróbuj ponownie</button></div></div>}
    {scannedCode && <div className="promo-toast fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-primary/30 bg-background p-3 text-sm shadow-lg" role="status"><Check size={18} className="shrink-0 text-primary"/><span>Kod rabatowy <strong>{scannedCode}</strong> zapisany. Naliczy się w koszyku przy zamówieniu.</span><Link href="/koszyk" className="ml-auto shrink-0 font-medium text-primary hover:underline" onClick={() => setScannedCode("")}>Koszyk</Link><button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Zamknij" onClick={() => setScannedCode("")}><X size={16}/></button></div>}
    <main id="main-content" className="flex-1">{children}</main>
    <footer className="mt-24 border-t border-border bg-muted/60">
      <div className="container grid gap-10 py-16 md:grid-cols-4 md:gap-8">
        <div className="footer-about space-y-4">
          <Link href="/" className="inline-flex"><img src="/assets/zastal-logo.svg" alt="Zastal Zielona Góra" className="h-14 w-auto" width={198} height={56}/></Link>
          <p className="text-sm text-muted-foreground">{brand.tagline}</p>
          {brand.competitions.some(c => c.image) && <CompetitionLogos items={brand.competitions} size="lg" className="pt-1"/>}
          <ul className="m-0 list-none space-y-2 p-0 text-sm text-muted-foreground">
            {seller.email && <li className="flex items-center gap-2"><At size={16} className="text-primary"/><a href={"mailto:" + seller.email} className="hover:text-foreground">{seller.email}</a></li>}
            {seller.phone && <li className="flex items-center gap-2"><Call size={16} className="text-primary"/><a href={"tel:" + seller.phone.replace(/\s+/g, "")} className="hover:text-foreground">{seller.phone}</a></li>}
            {store.sales.pickupAddress && <li className="flex items-start gap-2"><Location size={16} className="mt-0.5 shrink-0 text-primary"/><span>{store.sales.pickupAddress}{store.sales.pickupHours ? " · " + store.sales.pickupHours : ""}</span></li>}
          </ul>
        </div>
        <FooterColumn title="Produkty"><Link href="/sklep">Cały sklep</Link>{CATEGORIES.map(c => <Link key={c} href={categoryUrl(c)}>{label(c)}</Link>)}<Link href="/zawodnicy">Koszulki zawodników</Link></FooterColumn>
        <FooterColumn title="Zakupy i pomoc"><Link href="/pomoc#dostawa">Dostawa i odbiór</Link><Link href="/karta-podarunkowa">Karta podarunkowa</Link><Link href="/pomoc#rozmiary">Wybór rozmiaru</Link><Link href="/pomoc#zamowienia">Zamówienia i płatności</Link><Link href="/konto">Moje konto</Link><Link href="/konto?mode=register">Utwórz konto</Link><Link href="/ulubione">Moje ulubione</Link><Link href="/pomoc#prywatnosc">Konto i prywatność</Link></FooterColumn>
        <FooterColumn title="Klub"><Link href="/kontakt">Kontakt</Link>{store.sales.pages.map(page => <Link key={page.slug} href={"/informacje/" + page.slug}>{page.title}</Link>)}<a href="https://basketzg.pl/" target="_blank" rel="noreferrer">Strona Zastalu <ArrowUpRight size={13} className="inline"/></a><a href="https://zastal.store/" target="_blank" rel="noreferrer">Aktualny sklep klubowy <ArrowUpRight size={13} className="inline"/></a>{store.sales.checkoutEnabled && store.sales.legal.terms && <a href={store.sales.legal.terms} target="_blank" rel="noreferrer">Regulamin</a>}{store.sales.checkoutEnabled && store.sales.legal.privacy && <a href={store.sales.legal.privacy} target="_blank" rel="noreferrer">Polityka prywatności</a>}{store.sales.checkoutEnabled && store.sales.legal.returns && <a href={store.sales.legal.returns} target="_blank" rel="noreferrer">Zwroty i reklamacje</a>}</FooterColumn>
      </div>
      <div className="border-t border-border"><div className="container grid gap-6 py-10 md:grid-cols-[1fr_minmax(0,24rem)] md:items-center"><div><h3 className="text-base font-medium">Newsletter sklepu</h3><p className="mt-1 text-sm text-muted-foreground">Nowości, premiery i promocje. Piszemy rzadko, tylko gdy jest o czym.</p></div><NewsletterForm source="footer"/></div></div>
      <div className="border-t border-border"><div className="container flex flex-wrap items-center justify-between gap-3 py-5 text-xs text-muted-foreground"><span>© {year} Zastal Store</span><span>Polska · PLN · ceny brutto</span><Link href="/pomoc" className="hover:text-foreground">Informacje o sklepie</Link></div></div>
    </footer>
    {store.dialog === "menu" && <Modal title="Menu sklepu" onClose={() => store.setDialog(null)} drawer className="max-w-xs">
      <div className="modal-title"><h2>Sklep Zastalu</h2><button className={iconButton} aria-label="Zamknij menu" onClick={() => store.setDialog(null)}><X size={20}/></button></div>
      <nav className="flex flex-col gap-1 text-base" aria-label="Menu">
        {[["/sklep", "Wszystkie produkty"], ...CATEGORIES.map(c => [categoryUrl(c), label(c)]), ["/sklep?q=retro", "Retro"], ["/zawodnicy", "Zawodnicy"], ["/karta-podarunkowa", "Karta podarunkowa"]].map(([href, text]) => <Link key={href} href={href} onClick={() => store.setDialog(null)} className="flex items-center justify-between rounded-lg px-3 py-2.5 font-medium hover:bg-muted">{text}<ChevronRight size={18} className="text-muted-foreground"/></Link>)}
        <div className="my-3 border-t border-border"/>
        <Link href="/konto" onClick={() => store.setDialog(null)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><User size={18}/>Moje konto</Link>
        <Link href="/ulubione" onClick={() => store.setDialog(null)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><Heart size={18}/>Ulubione</Link>
        <Link href="/pomoc" onClick={() => store.setDialog(null)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><TruckFast size={18}/>Pomoc i dostawa</Link>
        <Link href="/kontakt" onClick={() => store.setDialog(null)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><At size={18}/>Kontakt</Link>
      </nav>
      {brand.competitions.some(c => c.image) && <div className="mt-6 border-t border-border pt-5"><CompetitionLogos items={brand.competitions} size="lg"/></div>}
    </Modal>}
    {store.dialog === "search" && <SearchDialog/>}{store.dialog === "cart" && <CartDialog/>}{store.quickId != null && <QuickProduct key={store.quickId}/>}
    {store.notice && <div className="store-toast" role="status"><Check size={16} className="text-orange"/><span>{store.notice}</span><button className="inline-flex size-7 items-center justify-center rounded-full hover:bg-background/20" aria-label="Zamknij powiadomienie" onClick={() => store.setNotice("")}><X size={16}/></button></div>}
    {store.storageError && <div className="storage-note" role="status">Ta przeglądarka nie zapisuje koszyka. Wybór zachowamy do końca tej wizyty.</div>}
  </div>;
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-foreground">{title}</h3><div className="flex flex-col gap-2.5 text-sm text-muted-foreground [&_a:hover]:text-foreground">{children}</div></div>;
}
