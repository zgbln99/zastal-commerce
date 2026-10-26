"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { filterProducts } from "../../lib/commerce.mjs";
import { useStore } from "../../components/StoreProvider";
import ProductCard from "../../components/ProductCard";
import ShopCategoryRail from "../../components/ShopCategoryRail";
import Modal from "../../components/Modal";
import "./shop.css";

import { categoryFromPath, shopUrl } from "../../lib/urls.mjs";

const CATEGORIES = ["Koszulki", "Bluzy", "Akcesoria", "Dzieci"];
const SIZES = ["S", "M", "L", "XL", "XXL", "116", "128", "140", "152", "164"];
export default function ShopClient() {
  const store = useStore(); const params = useSearchParams(); const router = useRouter();
  const pathCategory=categoryFromPath(usePathname());
  const category = pathCategory || (CATEGORIES.includes(params.get("category") || "") ? params.get("category") || "" : "");
  const size = SIZES.includes(params.get("size") || "") ? params.get("size") || "" : "";
  const sort = params.get("sort") || "recommended";
  const available = params.get("available") === "1";
  const urlQuery = params.get("q") || "";
  const [query, setQuery] = useState(urlQuery);
  const [min, setMin] = useState(params.get("min") || "");
  const [max, setMax] = useState(params.get("max") || "");
  const [mobileFilters, setMobileFilters] = useState(false);
  useEffect(() => { setQuery(urlQuery); }, [urlQuery]);
  useEffect(() => { setMin(params.get("min") || ""); setMax(params.get("max") || ""); }, [params]);
  function update(values: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    router.replace(shopUrl(Object.hasOwn(values,"category")?values.category:category,next), { scroll: false });
  }
  useEffect(() => {
    if (query === urlQuery) return;
    const timer = setTimeout(() => update({ q: query }), 300);
    return () => clearTimeout(timer);
  }, [query, urlQuery]);
  const value = (text: string) => text.trim() && Number.isFinite(Number(text)) && Number(text) >= 0 ? Math.round(Number(text) * 100) : undefined;
  const rows = filterProducts(store.products, { category, query, size, available, sort, minPrice: value(params.get("min") || ""), maxPrice: value(params.get("max") || "") });
  const activeCount = [category, size, available, params.get("min"), params.get("max")].filter(Boolean).length;
  const clear = () => { setQuery(""); setMin(""); setMax(""); router.replace("/sklep", { scroll: false }); };
  const filters = (mobile = false) => <div className="filter-panel"><div className="filter-panel-heading"><h2>Filtry</h2>{activeCount > 0 && <button onClick={clear}>Wyczyść</button>}</div><fieldset><legend>Kategoria</legend><button className={"category-filter " + (!category ? "selected" : "")} onClick={() => update({ category: "", q: query })}><span>Wszystkie produkty</span><span>{store.products.length}</span></button>{CATEGORIES.map(c => <button key={c} className={"category-filter " + (category === c ? "selected" : "")} onClick={() => update({ category: c, q: query })}><span>{c === "Dzieci" ? "Dla dzieci" : c}</span><span>{store.products.filter(p => p.category === c).length}</span></button>)}</fieldset><fieldset><legend>Rozmiar</legend><div className="filter-sizes">{SIZES.filter(s => category === "Dzieci" ? /^\d/.test(s) : category === "Bluzy" || category === "Koszulki" ? !/^\d/.test(s) : true).map(s => <button key={s} className={size === s ? "selected" : ""} aria-pressed={size === s} onClick={() => update({ size: size === s ? "" : s, q: query })}>{s}</button>)}</div></fieldset><fieldset><legend>Cena (zł)</legend><form onSubmit={e => { e.preventDefault(); update({ min, max, q: query }); }}><div className="price-filter-inputs"><label><span>Od</span><input type="number" min="0" max="10000" step="1" value={min} onChange={e => setMin(e.target.value)} aria-label={mobile ? "Cena minimalna, telefon" : "Cena minimalna"} placeholder="0"/></label><span aria-hidden="true"/><label><span>Do</span><input type="number" min="0" max="10000" step="1" value={max} onChange={e => setMax(e.target.value)} aria-label={mobile ? "Cena maksymalna, telefon" : "Cena maksymalna"} placeholder="200"/></label></div><button className="apply-price" type="submit">Zastosuj zakres <ArrowRight size={13}/></button></form></fieldset><fieldset><legend>Dostępność</legend><label className="availability-filter"><input type="checkbox" checked={available} onChange={e => update({ available: e.target.checked ? "1" : "", q: query })}/><span>Tylko dostępne produkty</span></label><p>Dostępność jest sprawdzana dla wybranego rozmiaru.</p></fieldset><div className="filter-help"><strong>Potrzebujesz pomocy?</strong><p>Sprawdź rozmiary, dostawę i sposób składania zamówienia.</p><Link href="/pomoc" onClick={() => setMobileFilters(false)}>Pomoc w zakupach <ArrowRight size={13}/></Link></div></div>;
  return <div className="container catalog-page"><div className="breadcrumbs"><Link href="/">Strona główna</Link><ChevronRight size={11}/><span>Sklep</span>{category && <><ChevronRight size={11}/><span>{category === "Dzieci" ? "Dla dzieci" : category}</span></>}</div><div className="catalog-page-heading"><div className="page-heading"><h1>{category === "Dzieci" ? "Dla dzieci" : category || "Wszystkie produkty"}</h1><p>{category === "Bluzy" ? "Klasyczna bluza z logo lub powrót do kolekcji Retro." : category === "Koszulki" ? "Koszulki klubowe, kolekcje sezonowe i nadruki zawodnicze." : category === "Akcesoria" ? "Worek sportowy, brelok czy magnes: mały klubowy akcent." : category === "Dzieci" ? "Klubowe koszulki w rozmiarach dla najmłodszych kibiców." : "Odzież i akcesoria Zastalu. Wybierz kategorię lub znajdź swój rozmiar."}</p></div><div className="catalog-search"><Search size={17}/><input aria-label="Szukaj w katalogu" placeholder="Szukaj produktu…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Wyczyść wyszukiwanie" onClick={() => setQuery("")}><X size={15}/></button>}</div></div><ShopCategoryRail category={category} products={store.products} onChoose={next => update({ category: next, q: query })}/><div className="catalog-layout"><aside className="catalog-sidebar" aria-label="Filtry produktów">{filters()}</aside><div className="catalog-results"><div className="catalog-toolbar"><button className="mobile-filter-toggle" onClick={() => setMobileFilters(true)}><SlidersHorizontal size={16}/> Filtry {activeCount > 0 && <b>{activeCount}</b>}</button><span className="catalog-count">Produkty: <strong>{rows.length}</strong></span><label className="catalog-sort"><span>Sortuj:</span><select aria-label="Sortuj produkty" value={sort} onChange={e => update({ sort: e.target.value === "recommended" ? "" : e.target.value, q: query })}><option value="recommended">Domyślnie</option><option value="price-asc">Cena rosnąco</option><option value="price-desc">Cena malejąco</option><option value="name">Nazwa A–Z</option></select></label></div>{(activeCount > 0 || query) && <div className="active-filters">{category && <button onClick={() => update({ category: "" })}>{category} <X size={12}/></button>}{size && <button onClick={() => update({ size: "" })}>Rozmiar {size} <X size={12}/></button>}{available && <button onClick={() => update({ available: "" })}>Dostępne <X size={12}/></button>}{(params.get("min") || params.get("max")) && <button onClick={() => update({ min: "", max: "" })}>{params.get("min") || "0"}–{params.get("max") || "∞"} zł <X size={12}/></button>}{query && <button onClick={() => setQuery("")}>„{query}” <X size={12}/></button>}<button className="clear-all" onClick={clear}>Wyczyść wszystko</button></div>}{rows.length ? <div className="product-grid">{rows.map((p,index) => <ProductCard key={p.id} product={p} eager={index<6}/>)}</div> : <div className="empty-state"><Search size={33} strokeWidth={1.2}/><h2>Brak pasujących produktów</h2><p>{store.status === "loading" ? "Jeszcze sprawdzamy dostępność. Wyniki pojawią się za chwilę." : "Zmień rozmiar, kategorię lub zakres cen, aby zobaczyć inne produkty."}</p><button className="button button-dark" onClick={clear}>Wyczyść filtry <ArrowRight size={16}/></button></div>}<div className="catalog-bottom-note"><span>Wszystkie ceny podano w PLN.</span><span>Stany magazynowe i zamówienia przed uruchomieniem sprzedaży internetowej.</span></div></div></div>{mobileFilters && <Modal title="Filtry produktów" drawer onClose={() => setMobileFilters(false)} className="filter-drawer"><div className="modal-title"><h2>Filtry produktów</h2><button className="icon-btn" aria-label="Zamknij filtry" onClick={() => setMobileFilters(false)}><X size={22}/></button></div>{filters(true)}<div className="filter-drawer-bottom"><button className="button button-dark" onClick={() => { update({ min, max, q: query }); setMobileFilters(false); }}>Pokaż produkty ({rows.length}) <ArrowRight size={17}/></button></div></Modal>}</div>;
}
