"use client";
import { useState } from "react";
import { ArrowRight, Check } from "reicon-react";
import { TextureButton } from "@/components/templates/essentials/ui/texture-button";
import { cn } from "@/lib/utils";

/** Newsletter signup with explicit consent; the address joins the list only after the e-mailed confirmation. */
export default function NewsletterForm({ source = "footer", className = "", inverse = false }: { source?: string; className?: string; inverse?: boolean }) {
  const [email, setEmail] = useState(""), [consent, setConsent] = useState(false), [website, setWebsite] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(""), [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    if (!consent) { setError("Zaznacz zgodę, żebyśmy mogli wysyłać wiadomości."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/store/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, consent, website, source }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Nie udało się zapisać adresu.");
      setDone(result.message); setEmail("");
    } catch (e) { setError(e instanceof Error ? e.message : "Nie udało się zapisać adresu."); } finally { setBusy(false); }
  };
  if (done) return <p className={cn("newsletter-done flex items-start gap-2 text-sm", className)} role="status"><Check size={16} className="mt-0.5 shrink-0 text-primary"/>{done}</p>;
  return <form onSubmit={submit} className={cn("newsletter-form space-y-3", className)}>
    <div className={cn("flex items-center gap-2 rounded-full border border-border py-1 pl-4 pr-1", inverse ? "bg-background" : "bg-background")}>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="Twój e-mail" aria-label="Adres e-mail do newslettera" className="h-9 min-w-0 flex-1 bg-transparent px-1 text-base outline-none sm:text-sm placeholder:text-muted-foreground" style={{ border: 0, boxShadow: "none", background: "transparent" }}/>
      <TextureButton size="sm" type="submit" disabled={busy} aria-label="Zapisz się do newslettera">{busy ? "…" : <>Zapisz <ArrowRight size={14}/></>}</TextureButton>
    </div>
    <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="m-0 mt-0.5 size-4 shrink-0"/><span>Chcę otrzymywać e-maile o nowościach, premierach i promocjach sklepu Zastalu. Zgodę można cofnąć linkiem w każdej wiadomości.</span></label>
    <label className="hidden" aria-hidden="true">Strona www<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)}/></label>
    {error && <p className="field-error" role="alert">{error}</p>}
  </form>;
}
