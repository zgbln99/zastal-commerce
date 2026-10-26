"use client";
import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
/** Lets a guest get the private order link again by e-mail; the API never reveals whether the order exists. */
export default function OrderLookup() {
  const [order, setOrder] = useState(""), [email, setEmail] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/orders/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order, email }), cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nie udało się wysłać prośby.");
      setMessage(data.message || "Jeśli dane się zgadzają, link do zamówienia trafi na podany adres.");
    } catch (e) { setError(e instanceof Error ? e.message : "Nie udało się wysłać prośby."); } finally { setBusy(false); }
  };
  return <form className="order-lookup" onSubmit={submit}><h3><Search size={16}/> Nie masz linku do zamówienia?</h3><div className="order-lookup-fields"><label>Numer zamówienia<input value={order} placeholder="ZS-00012" maxLength={16} required onChange={e => setOrder(e.target.value)}/></label><label>E-mail z zamówienia<input type="email" value={email} maxLength={254} required onChange={e => setEmail(e.target.value)}/></label><button className="button button-dark" disabled={busy}>{busy ? "Wysyłanie…" : "Wyślij link"}<ArrowRight size={15}/></button></div>{message && <p className="account-success" role="status">{message}</p>}{error && <p className="account-error" role="alert">{error}</p>}</form>;
}
