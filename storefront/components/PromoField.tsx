"use client";
import { useEffect, useState } from "react";
import { Check, Tag, X } from "reicon-react";
import { fmt } from "../lib/catalog";
import { TextureButton } from "@/components/templates/essentials/ui/texture-button";

export const PROMO_KEY = "zastal_promo_v1";
export type PromoPreview = { code: string; discount: number; label: string };

/** Remembers the code chosen in the cart so the checkout starts with it applied. */
export function readStoredPromo(): string {
  try { return localStorage.getItem(PROMO_KEY) || ""; } catch { return ""; }
}
export function storePromo(code: string) {
  try { if (code) localStorage.setItem(PROMO_KEY, code); else localStorage.removeItem(PROMO_KEY); } catch {}
}

/** Discount code field for the cart: checks the code against the current subtotal and keeps it for the checkout. */
export default function PromoField({ subtotal, enabled, onChange }: { subtotal: number; enabled: boolean; onChange?: (promo: PromoPreview | null) => void }) {
  const [code, setCode] = useState(""), [applied, setApplied] = useState<PromoPreview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [open, setOpen] = useState(false);
  const check = async (value: string, quiet = false) => {
    if (!value.trim()) return;
    setBusy(true); if (!quiet) setError("");
    try {
      const response = await fetch("/api/promo/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: value.trim(), subtotal }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ten kod nie działa.");
      const next = { code: data.code, discount: data.discount, label: data.label };
      setApplied(next); storePromo(next.code); onChange?.(next); setCode("");
    } catch (e) { setApplied(null); storePromo(""); onChange?.(null); if (!quiet) setError(e instanceof Error ? e.message : "Ten kod nie działa."); } finally { setBusy(false); }
  };
  // A code remembered from an earlier visit is re-checked against the current subtotal.
  useEffect(() => { const stored = readStoredPromo(); if (stored && enabled && subtotal > 0) void check(stored, true); }, [enabled, subtotal]);
  if (!enabled) return null;
  if (applied) return <div className="promo-applied flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-accent px-3 py-2 text-sm" role="status"><span className="flex items-center gap-2"><Check size={16} className="text-primary"/><span><strong className="font-medium">{applied.code}</strong> · {applied.label} · −{fmt(applied.discount)}</span></span><button type="button" className="inline-flex size-8 items-center justify-center rounded-full hover:bg-background" aria-label={`Usuń kod ${applied.code}`} onClick={() => { setApplied(null); storePromo(""); onChange?.(null); }}><X size={14}/></button></div>;
  if (!open) return <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline" onClick={() => setOpen(true)}><Tag size={14}/> Mam kod rabatowy</button>;
  return <form className="promo-form space-y-2" onSubmit={e => { e.preventDefault(); void check(code); }}>
    <div className="flex gap-2"><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} aria-label="Kod rabatowy" placeholder="np. KIBIC10" maxLength={24} className="h-10 flex-1" autoComplete="off"/><TextureButton size="sm" type="submit" disabled={busy || !code.trim()} className="h-10">Zastosuj</TextureButton></div>
    {error && <p className="field-error" role="alert">{error}</p>}
  </form>;
}
