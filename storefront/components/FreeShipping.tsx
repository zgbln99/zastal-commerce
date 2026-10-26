"use client";
import { Truck } from "lucide-react";
import { fmt } from "../lib/catalog";
import type { ShippingMethod } from "../lib/commerce.mjs";
/** Shows how far the cart is from the lowest free-delivery threshold in the published configuration. */
export default function FreeShipping({ subtotal, methods, enabled }: { subtotal: number; methods: ShippingMethod[]; enabled: boolean }) {
  if (!enabled) return null;
  const candidates = methods.filter(m => m.kind !== "pickup" && m.price > 0 && Number.isSafeInteger(m.free_from) && (m.free_from as number) > 0);
  if (!candidates.length) return null;
  const best = candidates.reduce((a, b) => ((a.free_from as number) <= (b.free_from as number) ? a : b));
  const threshold = best.free_from as number, missing = threshold - subtotal, ratio = Math.min(1, subtotal / threshold);
  return <div className={"free-shipping " + (missing <= 0 ? "reached" : "")}><Truck size={16}/><div><span>{missing <= 0 ? `Masz bezpłatną dostawę: ${best.name}` : `Do bezpłatnej dostawy (${best.name}) brakuje ${fmt(missing)}`}</span><div className="free-shipping-bar" aria-hidden="true"><i style={{ width: `${Math.round(ratio * 100)}%` }}/></div></div></div>;
}
