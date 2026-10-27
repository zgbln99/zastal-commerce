"use client";
import { useState } from "react";
import { Gift } from "lucide-react";
import { fmt } from "../lib/catalog";
type View = { code: string; initial_value: number; balance: number; expires_at: string; state: "active" | "blocked" | "expired" | "used" };
const STATE: Record<View["state"], string> = { active: "Aktywna", blocked: "Zablokowana", expired: "Po terminie ważności", used: "Wykorzystana" };
/** Public balance check: the code is the only secret, no account needed. */
export default function GiftCardBalance() {
  const [code, setCode] = useState(""), [busy, setBusy] = useState(false), [view, setView] = useState<View | null>(null), [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(""); setView(null);
    try {
      const response = await fetch("/api/giftcards/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nie udało się sprawdzić karty.");
      setView(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Nie udało się sprawdzić karty."); } finally { setBusy(false); }
  };
  return <form className="gift-balance" onSubmit={submit}><h2><Gift size={18}/> Sprawdź saldo karty</h2><div className="gift-balance-fields"><input value={code} placeholder="ZG-XXXX-XXXX-XXXX" maxLength={24} aria-label="Kod karty podarunkowej" autoComplete="off" required onChange={e => setCode(e.target.value.toUpperCase())}/><button className="button button-dark" disabled={busy}>{busy ? "Sprawdzamy…" : "Sprawdź"}</button></div>
    {view && <dl className="gift-balance-result"><div><dt>Saldo</dt><dd>{fmt(view.balance)}</dd></div><div><dt>Wartość początkowa</dt><dd>{fmt(view.initial_value)}</dd></div><div><dt>Ważna do</dt><dd>{view.expires_at}</dd></div><div><dt>Status</dt><dd>{STATE[view.state]}</dd></div></dl>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </form>;
}
