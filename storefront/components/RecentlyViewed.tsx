"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import ProductCard from "./ProductCard";
import { useStore } from "./StoreProvider";

const KEY = "zastal_recent_products_v1";
const MAX = 8;
function ids(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is number => Number.isSafeInteger(id) && typeof id === "number" && id > 0))].slice(0, MAX);
}
export default function RecentlyViewed({ currentId }: { currentId: number }) {
  const store = useStore();
  const [seen, setSeen] = useState<number[]>([]);
  useEffect(() => {
    try {
      const before = ids(JSON.parse(localStorage.getItem(KEY) || "[]"));
      const previous = before.filter(id => id !== currentId);
      setSeen(previous.slice(0, 4));
      localStorage.setItem(KEY, JSON.stringify([currentId, ...previous].slice(0, MAX)));
    } catch {
      // Storage may be disabled; browsing and purchases still work.
      setSeen([]);
    }
  }, [currentId]);
  const products = seen.map(id => store.products.find(p => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (!products.length) return null;
  return <section className="recent-products" aria-labelledby="recent-products-heading">
    <div className="section-heading recent-products-heading">
      <div><span className="eyebrow">HISTORIA PRZEGLĄDANIA / NA TYM URZĄDZENIU</span><h2 id="recent-products-heading">Ostatnio oglądane</h2></div>
      <Link className="inline-link" href="/sklep">Powrót do sklepu <ArrowUpRight size={17}/></Link>
    </div>
    <div className="product-grid recent-products-grid">{products.map(p => <ProductCard product={p} key={p.id}/>)}</div>
  </section>;
}
