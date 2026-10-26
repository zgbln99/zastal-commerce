"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ChevronRight, Filter, Search, X } from "reicon-react";
import { filterProducts } from "../../lib/commerce.mjs";
import { useStore } from "../../components/StoreProvider";
import ProductCard from "../../components/ProductCard";
import Modal from "../../components/Modal";
import ListingPagination, { PAGE_SIZE } from "../../components/ListingPagination";
import { CATEGORY_SLUGS, categoryPath, categorySlug } from "../../lib/site";
import { TextureButton } from "@/components/templates/essentials/ui/texture-button";
import { cn } from "@/lib/utils";

const CATEGORIES = ["Koszulki", "Bluzy", "Akcesoria", "Dzieci"];
const SIZES = ["S", "M", "L", "XL", "XXL", "116", "128", "140", "152", "164"];
const label = (c: string) => c === "Dzieci" ? "Dla dzieci" : c;
const intro: Record<string, string> = { Bluzy: "Klasyczna bluza z logo lub powrót do kolekcji Retro.", Koszulki: "Koszulki klubowe, kolekcje sezonowe i nadruki zawodnicze.", Akcesoria: "Worek sportowy, brelok czy magnes: mały klubowy akcent.", Dzieci: "Klubowe koszulki w rozmiarach dla najmłodszych kibiców." };
const pill = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50";
const pillActive = "border-primary bg-primary text-primary-foreground hover:bg-primary";
const chip = "inline-flex h-8 items-center gap-1 rounded-full bg-accent px-3 text-xs font-medium text-accent-foreground hover:bg-accent/70";

type Props = { fixedCategory?: string; searchMode?: boolean };
/** Catalogue listing: /sklep (all), /kategoria/[slug] (fixed category, own address for SEO) and /szukaj (search results). */
export default function ShopClient({ fixedCategory = "", searchMode = false }: Props) {
  const store = useStore(); const params = useSearchParams(); const router = useRouter();
  const basePath = fixedCategory ? categoryPath(fixedCategory) : searchMode ? "/szukaj" : "/sklep";
  const category = fixedCategory || (CATEGORIES.includes(params.get("category") || "") ? params.get("category") || "" : "");
  const page = Math.max(1, Number(params.get("page")) || 1);
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
    if (!("page" in values)) next.delete("page");
    router.replace(basePath + (next.toString() ? "?" + next.toString() : ""), { scroll: false });
  }
  // Category pills are real addresses on the category pages; on /sklep they stay a query filter for the old links.
  const goCategory = (next: string) => { if (fixedCategory || searchMode) router.push(next ? categoryPath(next) + (query ? "?q=" + encodeURIComponent(query) : "") : "/sklep" + (query ? "?q=" + encodeURIComponent(query) : "")); else update({ category: next, q: query }); };
  useEffect(() => {
    if (query === urlQuery) return;
    const timer = setTimeout(() => update({ q: query }), 300);
    return () => clearTimeout(timer);
  }, [query, urlQuery]);
  const value = (text: string) => text.trim() && Number.isFinite(Number(text)) && Number(text) >= 0 ? Math.round(Number(text) * 100) : undefined;
  const rows = filterProducts(store.products, { category, query, size, available, sort, minPrice: value(params.get("min") || ""), maxPrice: value(params.get("max") || "") });
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const shown = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const activeCount = [fixedCategory ? "" : category, size, available, params.get("min"), params.get("max")].filter(Boolean).length;
  const clear = () => { setQuery(""); setMin(""); setMax(""); router.replace(basePath, { scroll: false }); };
  const heading = searchMode ? (urlQuery ? `Wyniki dla „${urlQuery}”` : "Szukaj w sklepie") : category ? label(category) : "Wszystkie produkty";
  const sizesFor = SIZES.filter(s => category === "Dzieci" ? /^\d/.test(s) : category === "Bluzy" || category === "Koszulki" ? !/^\d/.test(s) : true);
  const details = (mobile = false) => <div className="flex flex-col gap-6">
    <fieldset className="border-0 p-0"><legend className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Rozmiar</legend><div className="flex flex-wrap gap-2">{sizesFor.map(s => <button key={s} className={cn(pill, "min-w-11 justify-center px-3", size === s && pillActive)} aria-pressed={size === s} onClick={() => update({ size: size === s ? "" : s, q: query })}>{s}</button>)}</div></fieldset>
    <fieldset className="border-0 p-0"><legend className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Cena (zł)</legend><form onSubmit={e => { e.preventDefault(); update({ min, max, q: query }); }} className="flex flex-wrap items-end gap-3"><label className="flex flex-col gap-1 text-xs text-muted-foreground"><span>Od</span><input type="number" min="0" max="10000" step="1" value={min} onChange={e => setMin(e.target.value)} aria-label={mobile ? "Cena minimalna, telefon" : "Cena minimalna"} placeholder="0" className="w-24"/></label><label className="flex flex-col gap-1 text-xs text-muted-foreground"><span>Do</span><input type="number" min="0" max="10000" step="1" value={max} onChange={e => setMax(e.target.value)} aria-label={mobile ? "Cena maksymalna, telefon" : "Cena maksymalna"} placeholder="200" className="w-24"/></label><TextureButton variant="secondary" size="sm" className="h-10" type="submit">Zastosuj zakres</TextureButton></form></fieldset>
    <fieldset className="border-0 p-0"><legend className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Dostępność</legend><label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={available} onChange={e => update({ available: e.target.checked ? "1" : "", q: query })}/><span>Tylko dostępne produkty</span></label><p className="mt-2 text-xs text-muted-foreground">Dostępność jest sprawdzana dla wybranego rozmiaru.</p></fieldset>
    <div className="rounded-xl border border-border bg-muted/60 p-4 text-sm"><strong className="font-medium">Potrzebujesz pomocy?</strong><p className="mt-1 text-muted-foreground">Sprawdź rozmiary, dostawę i sposób składania zamówienia.</p><Link href="/pomoc" className="mt-2 inline-flex items-center gap-1 font-medium text-primary hover:underline" onClick={() => setMobileFilters(false)}>Pomoc w zakupach <ArrowRight size={14}/></Link></div>
  </div>;
  return <div className="container pb-8">
    <div className="breadcrumbs"><Link href="/">Strona główna</Link><ChevronRight size={12}/>{category || searchMode ? <Link href="/sklep">Sklep</Link> : <span>Sklep</span>}{category && <><ChevronRight size={12}/><span>{label(category)}</span></>}{searchMode && <><ChevronRight size={12}/><span>Wyszukiwanie</span></>}</div>
    <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl"><h1 className="text-3xl font-medium leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">{heading}</h1><p className="mt-3 text-muted-foreground">{searchMode ? (urlQuery ? `${rows.length} ${rows.length === 1 ? "produkt" : rows.length >= 2 && rows.length <= 4 ? "produkty" : "produktów"} w sklepie Zastalu.` : "Wpisz nazwę produktu, kolekcję albo kategorię.") : intro[category] || "Odzież i akcesoria Zastalu. Wybierz kategorię lub znajdź swój rozmiar."}</p></div>
      <form className="flex w-full max-w-sm items-center gap-2 rounded-full border border-border bg-muted py-1 pl-4 pr-1" role="search" onSubmit={e => { e.preventDefault(); update({ q: query }); }} action={basePath}><Search size={18} className="shrink-0 text-muted-foreground"/><input aria-label="Szukaj w katalogu" placeholder="Szukaj produktu…" value={query} onChange={e => setQuery(e.target.value)} className="h-9 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground" style={{ border: 0, boxShadow: "none", background: "transparent" }}/>{query && <button type="button" className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-background" aria-label="Wyczyść wyszukiwanie" onClick={() => setQuery("")}><X size={15}/></button>}</form>
    </div>
    <div className="sticky top-16 z-30 -mx-4 flex flex-wrap items-center gap-2 border-y border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:top-34 lg:-mx-8 lg:px-8">
      <nav className="flex flex-1 items-center gap-2 overflow-x-auto" aria-label="Kategorie">
        <button className={cn(pill, !category && pillActive)} aria-pressed={!category} onClick={() => goCategory("")}>Wszystkie <span className={cn("text-xs", !category ? "text-primary-foreground/70" : "text-muted-foreground")}>{store.products.length}</span></button>
        {CATEGORIES.map(c => <button key={c} className={cn(pill, category === c && pillActive)} aria-pressed={category === c} onClick={() => goCategory(category === c ? "" : c)}>{label(c)} <span className={cn("text-xs", category === c ? "text-primary-foreground/70" : "text-muted-foreground")}>{store.products.filter(p => p.category === c).length}</span></button>)}
      </nav>
      <button className={cn(pill, "lg:hidden", (size || available || params.get("min") || params.get("max")) && "border-primary")} onClick={() => setMobileFilters(true)}><Filter size={16}/> Filtry{activeCount > 0 && <b className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">{activeCount}</b>}</button>
      <label className="flex items-center gap-2 text-sm text-muted-foreground"><span className="hidden sm:inline">Sortuj</span><select aria-label="Sortuj produkty" value={sort} onChange={e => update({ sort: e.target.value === "recommended" ? "" : e.target.value, q: query })} className="h-9 w-auto rounded-full border-border bg-background py-0 pl-3 pr-8 text-sm font-medium text-foreground"><option value="recommended">Domyślnie</option><option value="price-asc">Cena rosnąco</option><option value="price-desc">Cena malejąco</option><option value="name">Nazwa A–Z</option></select></label>
    </div>
    {(activeCount > 0 || query) && <div className="mt-4 flex flex-wrap items-center gap-2">{category && !fixedCategory && <button className={chip} onClick={() => update({ category: "" })}>{label(category)} <X size={12}/></button>}{size && <button className={chip} onClick={() => update({ size: "" })}>Rozmiar {size} <X size={12}/></button>}{available && <button className={chip} onClick={() => update({ available: "" })}>Dostępne <X size={12}/></button>}{(params.get("min") || params.get("max")) && <button className={chip} onClick={() => update({ min: "", max: "" })}>{params.get("min") || "0"}–{params.get("max") || "∞"} zł <X size={12}/></button>}{query && <button className={chip} onClick={() => setQuery("")}>„{query}” <X size={12}/></button>}<button className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline" onClick={clear}>Wyczyść wszystko</button></div>}
    <div className="mt-8 grid gap-10 lg:grid-cols-[16rem_1fr]">
      <aside className="hidden lg:block" aria-label="Filtry produktów"><div className="sticky top-44">{details()}</div></aside>
      <div>
        <p className="mb-5 text-sm text-muted-foreground">Produkty: <strong className="font-medium text-foreground">{rows.length}</strong></p>
        {rows.length ? <div className="product-grid grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10">{shown.map((p, index) => <ProductCard key={p.id} product={p} eager={index < 6}/>)}</div>
          : <div className="empty-state"><Search size={30}/><h2>Brak pasujących produktów</h2><p>{store.status === "loading" ? "Jeszcze sprawdzamy dostępność. Wyniki pojawią się za chwilę." : "Zmień rozmiar, kategorię lub zakres cen, aby zobaczyć inne produkty."}</p><TextureButton onClick={clear}>Wyczyść filtry <ArrowRight size={16}/></TextureButton></div>}
        <ListingPagination page={current} total={totalPages} onPage={next => { update({ page: next > 1 ? String(next) : "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}/>
        <div className="mt-12 flex flex-wrap justify-between gap-2 border-t border-border pt-5 text-xs text-muted-foreground"><span>Wszystkie ceny podano w PLN.</span>{!store.sales.checkoutEnabled && <span>Stany magazynowe i zamówienia przed uruchomieniem sprzedaży internetowej.</span>}</div>
      </div>
    </div>
    {mobileFilters && <Modal title="Filtry produktów" drawer onClose={() => setMobileFilters(false)} className="filter-drawer"><div className="modal-title"><h2>Filtry produktów</h2><button className="inline-flex size-10 items-center justify-center rounded-full border border-border hover:bg-muted" aria-label="Zamknij filtry" onClick={() => setMobileFilters(false)}><X size={20}/></button></div>{details(true)}<div className="mt-auto border-t border-border pt-4"><TextureButton size="lg" className="w-full" onClick={() => { update({ min, max, q: query }); setMobileFilters(false); }}>Pokaż produkty ({rows.length}) <ArrowRight size={17}/></TextureButton></div></Modal>}
  </div>;
}
