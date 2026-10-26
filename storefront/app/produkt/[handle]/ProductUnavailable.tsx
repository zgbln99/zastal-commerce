"use client";
import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import ProductDetail from "./ProductDetail";
import { useStore } from "../../../components/StoreProvider";

/** The API did not answer during server rendering: the browser resolves the handle from the catalogue it loads itself. */
export default function ProductUnavailable({ handle }: { handle: string }) {
  const store = useStore();
  const [missing, setMissing] = useState(false);
  const product = store.products.find(p => p.slug === handle || String(p.id) === handle);
  useEffect(() => { if (store.status === "ready" && !product) setMissing(true); }, [store.status, product]);
  if (missing) notFound();
  if (!product) return <div className="container py-16"><div className="empty-state"><h1>{store.status === "error" ? "Produkt chwilowo niedostępny" : "Wczytujemy produkt…"}</h1>{store.status === "error" && <p>{store.error}</p>}</div></div>;
  return <ProductDetail key={product.id} productId={product.id}/>;
}
