"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Gift } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { fmt } from "../lib/catalog";
type Card = { id: number; code: string; initial_value: number; balance: number; expires_at: string; state: "active" | "blocked" | "expired" | "used"; transactions: { kind: string; amount: number; order_id: number | null; created: string }[] };
const STATE: Record<Card["state"], string> = { active: "aktywna", blocked: "zablokowana", expired: "po terminie", used: "wykorzystana" };
const KIND: Record<string, string> = { issue: "wydanie", redeem: "zapłata", release: "zwrot po anulowaniu" };
/** "Moje karty": attach a card by its code, see balances and where it was used. */
export default function AccountGiftCards() {
  const auth = useAuth();
  const [cards, setCards] = useState<Card[]>([]), [code, setCode] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const load = useCallback(async () => { try { setCards(await auth.request<Card[]>("/api/account/giftcards")); } catch (e) { setError(e instanceof Error ? e.message : "Nie można pobrać kart."); } }, [auth]);
  useEffect(() => { void load(); }, [load]);
  const attach = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(""); setMessage("");
    try { const card = await auth.request<Card>("/api/account/giftcards", { method: "POST", body: JSON.stringify({ code }) }); setMessage(`Karta …${card.code.slice(-4)} jest przypisana do Twojego konta. Saldo: ${fmt(card.balance)}.`); setCode(""); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Nie udało się przypisać karty."); } finally { setBusy(false); }
  };
  return <section className="account-panel"><h2>Karty podarunkowe</h2><p>Przypisz kartę do konta, a przy składaniu zamówienia wybierzesz ją jednym kliknięciem i zawsze zobaczysz saldo.</p>
    <form className="account-form account-gift-form" onSubmit={attach}><label>Kod karty<input value={code} placeholder="ZG-XXXX-XXXX-XXXX" maxLength={24} autoComplete="off" required onChange={e => setCode(e.target.value.toUpperCase())}/></label><button className="button button-dark" disabled={busy}>{busy ? "Sprawdzamy…" : "Przypisz kartę"}</button></form>
    {message && <p className="account-success" role="status">{message}</p>}{error && <p className="account-error" role="alert">{error}</p>}
    {cards.length ? <ul className="account-gift-list">{cards.map(card => <li key={card.id}><div className="account-gift-head"><Gift size={16}/><strong>{card.code}</strong><span className={"account-gift-state " + card.state}>{STATE[card.state]}</span></div><div className="account-gift-balance"><span>Saldo</span><strong>{fmt(card.balance)}</strong><small>z {fmt(card.initial_value)}, ważna do {card.expires_at}</small></div><ul className="account-gift-history">{card.transactions.map((t, i) => <li key={i}><span>{new Date(t.created).toLocaleDateString("pl-PL")}</span><span>{KIND[t.kind] || t.kind}{t.order_id ? ` · ZS-${String(t.order_id).padStart(5, "0")}` : ""}</span><strong>{t.amount > 0 ? "+" : ""}{fmt(t.amount)}</strong></li>)}</ul></li>)}</ul> : <p className="account-empty">Nie masz jeszcze przypisanej karty. <Link href="/karta-podarunkowa" className="inline-link">Jak działa karta podarunkowa <ArrowRight size={14}/></Link></p>}
  </section>;
}
