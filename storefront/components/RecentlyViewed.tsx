"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import ProductCard from "./ProductCard";
import { useStore } from "./StoreProvider";

const KEY = "zastal_recent_products_v1";
const MAX = 8;
const CONSENT_KEY = "zastal_history_consent_v1";
function ids(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is number => Number.isSafeInteger(id) && typeof id === "number" && id > 0))].slice(0, MAX);
}
export default function RecentlyViewed({ currentId }: { currentId: number }) {
  const store = useStore();
  const [seen, setSeen] = useState<number[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const allowed = localStorage.getItem(CONSENT_KEY) === "yes";
      if (!allowed) localStorage.removeItem(KEY);
      setEnabled(allowed);
    } catch {}
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key !== CONSENT_KEY && event.key !== null) return;
      try {
        const allowed = localStorage.getItem(CONSENT_KEY) === "yes";
        setEnabled(allowed);
        if (!allowed) { localStorage.removeItem(KEY); setSeen([]); }
      } catch { setEnabled(false); setSeen([]); }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!ready || !enabled) return;
    try {
      if (localStorage.getItem(CONSENT_KEY) !== "yes") {
        localStorage.removeItem(KEY); setSeen([]); setEnabled(false); return;
      }
      const before = ids(JSON.parse(localStorage.getItem(KEY) || "[]"));
      const previous = before.filter(id => id !== currentId);
      setSeen(previous.slice(0, 4));
      localStorage.setItem(KEY, JSON.stringify([currentId, ...previous].slice(0, MAX)));
    } catch {
      // Storage may be disabled; browsing and purchases still work.
      setSeen([]);
    }
  }, [currentId, ready, enabled]);
  const products = seen.map(id => store.products.find(p => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const toggle = () => {
    const next = !enabled;
    try {
      if (next) localStorage.setItem(CONSENT_KEY, "yes");
      else { localStorage.removeItem(CONSENT_KEY); localStorage.removeItem(KEY); }
      setSeen([]); setEnabled(next);
    } catch {}
  };
  if (!ready) return null;
  if (!enabled) return <section className="recent-products"><p>Chcesz wracać do oglądanych produktów? Możesz zapisywać ich historię na tym urządzeniu.</p><button type="button" className="inline-link" onClick={toggle}>Włącz historię oglądania</button></section>;
  return <section className="recent-products" aria-labelledby="recent-products-heading">
    <div className="section-heading recent-products-heading">
      <div><h2 id="recent-products-heading">Ostatnio oglądane</h2><span className="eyebrow">Zapisane na tym urządzeniu</span></div>
      <Link className="inline-link" href="/sklep">Powrót do sklepu <ArrowUpRight size={17}/></Link>
    </div>
    <button type="button" className="inline-link" onClick={toggle}>Wyłącz historię i usuń zapisane produkty</button>
    <div className="product-grid recent-products-grid">{products.map(p => <ProductCard product={p} key={p.id}/>)}</div>
  </section>;
}
