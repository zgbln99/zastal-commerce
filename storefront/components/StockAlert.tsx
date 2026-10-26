"use client";
import { useState } from "react";
import { BellRing } from "lucide-react";
import type { Product } from "../lib/commerce.mjs";
/** "Tell me when it is back": one e-mail per size, sent once stock returns. */
export default function StockAlert({ product, size }: { product: Product; size: string }) {
  const [email, setEmail] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const chosen = size || (product.sizes ? "" : "UNI");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/stock-alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: product.id, size: chosen, email }), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nie udało się zapisać powiadomienia.");
      setMessage(data.message || "Damy znać, gdy rozmiar wróci."); setEmail("");
    } catch (e) { setError(e instanceof Error ? e.message : "Nie udało się zapisać powiadomienia."); } finally { setBusy(false); }
  };
  return <form className="stock-alert" onSubmit={submit}><h3><BellRing size={16}/> Daj znać, gdy wróci</h3>
    {chosen ? <><p>Wyślemy jedną wiadomość, gdy {product.sizes ? `rozmiar ${chosen}` : "produkt"} będzie znów dostępny.</p><div className="stock-alert-fields"><input type="email" value={email} required maxLength={254} placeholder="Twój e-mail" aria-label="E-mail do powiadomienia o dostępności" onChange={e => setEmail(e.target.value)}/><button className="button button-outline" disabled={busy}>{busy ? "Zapisywanie…" : "Powiadom mnie"}</button></div></> : <p>Wybierz rozmiar, a zapiszemy Cię na powiadomienie o jego dostępności.</p>}
    {message && <p className="account-success" role="status">{message}</p>}{error && <p className="field-error" role="alert">{error}</p>}
  </form>;
}
