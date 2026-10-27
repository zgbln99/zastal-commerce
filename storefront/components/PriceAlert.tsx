"use client";
import { useState } from "react";
import { BellRing } from "lucide-react";
import type { Product } from "../lib/commerce.mjs";
import { useAuth } from "./AuthProvider";

/** "Tell me when it gets cheaper": one e-mail per address and product, sent once the price drops below today's. */
export default function PriceAlert({ product }: { product: Product }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false), [email, setEmail] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const address = email || (auth.user?.role === "customer" ? auth.user.identifier : "");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/price-alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: product.id, email: address }), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nie udało się zapisać powiadomienia.");
      setMessage(data.message || "Damy znać, gdy cena spadnie."); setEmail("");
    } catch (e) { setError(e instanceof Error ? e.message : "Nie udało się zapisać powiadomienia."); } finally { setBusy(false); }
  };
  if (message) return <p className="price-alert-done text-sm text-primary" role="status">{message}</p>;
  if (!open) return <button type="button" className="price-alert-link inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" onClick={() => setOpen(true)}><BellRing size={14}/> Powiadom mnie o obniżce ceny</button>;
  return <form className="price-alert flex flex-wrap items-center gap-2" onSubmit={submit} aria-label="Powiadomienie o obniżce ceny">
    <input type="email" className="h-10 min-w-56 flex-1 rounded-lg border border-border bg-background px-3 text-sm" required maxLength={254} placeholder="Twój e-mail" aria-label="E-mail do powiadomienia o obniżce" value={address} onChange={e => setEmail(e.target.value)}/>
    <button type="submit" className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60" disabled={busy}>{busy ? "Zapisujemy…" : "Powiadom o obniżce"}</button>
    {error && <p className="field-error w-full" role="alert">{error}</p>}
  </form>;
}
