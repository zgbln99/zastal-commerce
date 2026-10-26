"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Search } from "reicon-react";
import { filterProducts, productDisplayPrice, productPath, type Product } from "../../lib/commerce.mjs";
import { fmt } from "../../lib/catalog";
import { ProductImage } from "../ProductCard";
import HighlightedText from "./HighlightedText";
import { TextureButton } from "@/components/templates/essentials/ui/texture-button";
import { cn } from "@/lib/utils";

const MIN_CHARS = 2, LIMIT = 6, DEBOUNCE_MS = 120;

/** Search field with product suggestions (combobox): the catalogue is already in memory, so suggestions never hit the API. */
export default function SearchBox({ products, initial = "", autoFocus = false, onNavigate, className = "", compact = false }: { products: Product[]; initial?: string; autoFocus?: boolean; onNavigate?: () => void; className?: string; compact?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState(initial), [debounced, setDebounced] = useState(initial), [open, setOpen] = useState(false), [highlight, setHighlight] = useState(-1);
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trimmed = debounced.trim();
  const enough = trimmed.length >= MIN_CHARS;
  const suggestions = enough ? filterProducts(products, { query: trimmed }).slice(0, LIMIT) : [];
  const seeAll = suggestions.length;
  const last = enough ? seeAll : -1;
  useEffect(() => { const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { setHighlight(-1); }, [trimmed]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close);
  }, []);
  const go = (href: string) => { setOpen(false); onNavigate?.(); router.push(href); };
  const submit = () => { const value = query.trim(); if (value) go("/szukaj?q=" + encodeURIComponent(value)); };
  const panelOpen = open && enough;
  const optionId = (index: number) => `${listId}-${index}`;
  return <div ref={root} className={cn("relative", className)}>
    <form role="search" action="/szukaj" className={cn("flex items-center gap-2 rounded-full border border-border bg-muted py-1 pl-4 pr-1", compact && "pl-3")} onSubmit={e => { e.preventDefault(); submit(); }}>
      <Search size={18} className="shrink-0 text-muted-foreground"/>
      <input name="q" type="search" value={query} autoFocus={autoFocus} data-autofocus={autoFocus ? "" : undefined} onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === "Escape") { setOpen(false); return; }
          if (!panelOpen || last < 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => (h >= last ? 0 : h + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(h => (h <= 0 ? last : h - 1)); }
          else if (e.key === "Enter" && highlight >= 0) { e.preventDefault(); if (highlight === seeAll) submit(); else go(productPath(suggestions[highlight])); }
        }}
        placeholder="Szukaj produktu…" aria-label="Szukaj w sklepie" role="combobox" aria-expanded={panelOpen} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={panelOpen && highlight >= 0 ? optionId(highlight) : undefined} autoComplete="off"
        className="h-9 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden" style={{ border: 0, boxShadow: "none", background: "transparent" }}/>
      <TextureButton size="sm" type="submit">Szukaj</TextureButton>
    </form>
    {panelOpen && <div id={listId} role="listbox" aria-label="Podpowiedzi" className="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-lg">
      {suggestions.map((p, index) => <Link key={p.id} href={productPath(p)} role="option" id={optionId(index)} aria-selected={highlight === index} onMouseEnter={() => setHighlight(index)} onClick={event => { event.preventDefault(); go(productPath(p)); }} className={cn("flex items-center gap-3 rounded-lg px-2 py-2", highlight === index ? "bg-muted" : "hover:bg-muted")}>
        <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted"><ProductImage product={p} className="size-full object-cover"/></span>
        <span className="min-w-0 flex-1"><HighlightedText text={p.name} query={trimmed} className="block truncate text-sm font-medium"/><span className="block truncate text-xs text-muted-foreground">{p.category}{p.subtitle ? " · " + p.subtitle : ""}</span></span>
        <span className="text-sm font-medium">{p.verified ? fmt(productDisplayPrice(p)) : "…"}</span>
      </Link>)}
      {!suggestions.length && <p className="px-3 py-4 text-sm text-muted-foreground">Nic nie pasuje do „{trimmed}”. Spróbuj krótszego słowa.</p>}
      <button type="button" role="option" id={optionId(seeAll)} aria-selected={highlight === seeAll} onMouseEnter={() => setHighlight(seeAll)} onClick={submit} className={cn("mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground", highlight === seeAll ? "bg-muted text-foreground" : "hover:bg-muted")}>
        <span>Wszystkie wyniki dla <span className="normal-case tracking-normal text-foreground">{trimmed}</span></span><ArrowRight size={14}/>
      </button>
    </div>}
  </div>;
}
