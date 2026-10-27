"use client";
import { fmt } from "../lib/catalog";
import type { Product } from "../lib/commerce.mjs";
/** Omnibus notice: previous price and the lowest price from the 30 days before the reduction. */
export default function PriceReduction({ product, compact = false }: { product: Product; compact?: boolean }) {
  const r = product.price_reduction;
  if (!r || !product.verified) return null;
  return <span className={"price-reduction " + (compact ? "compact" : "")}><s>{fmt(r.previous)}</s><small>Najniższa cena z 30 dni przed obniżką: {fmt(r.lowest_30d)}</small></span>;
}
