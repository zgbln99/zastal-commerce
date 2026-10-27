"use client";
import { useState } from "react";
import { ArrowRight, Check } from "reicon-react";
import { TextureButton } from "@/components/templates/essentials/ui/texture-button";

const TOPICS = ["Zamówienie i dostawa", "Rozmiar i wymiana", "Nadruk i personalizacja", "Karta podarunkowa", "Zwrot lub reklamacja", "Inna sprawa"];

export default function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", topic: TOPICS[0], order: "", message: "", website: "" });
  const [busy, setBusy] = useState(false), [done, setDone] = useState(""), [error, setError] = useState("");
  const field = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(current => ({ ...current, [key]: event.target.value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/store/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Nie udało się wysłać wiadomości.");
      setDone(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : "Nie udało się wysłać wiadomości."); } finally { setBusy(false); }
  };
  if (done) return <div className="contact-done rounded-2xl border border-primary/30 bg-accent p-8 text-center" role="status"><span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check size={22}/></span><h2 className="mt-4 text-2xl font-medium tracking-tight">Wiadomość wysłana</h2><p className="mt-2 text-muted-foreground">{done}</p></div>;
  return <form onSubmit={submit} className="contact-form space-y-4 rounded-2xl border border-border bg-card p-6 sm:p-8">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm">Imię i nazwisko<input value={form.name} onChange={field("name")} required maxLength={80} autoComplete="name" className="mt-1"/></label>
      <label className="block text-sm">E-mail<input type="email" value={form.email} onChange={field("email")} required autoComplete="email" className="mt-1"/></label>
      <label className="block text-sm">Temat<select value={form.topic} onChange={field("topic")} className="mt-1">{TOPICS.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      <label className="block text-sm">Numer zamówienia (opcjonalnie)<input value={form.order} onChange={field("order")} maxLength={20} placeholder="ZS-00012" className="mt-1"/></label>
    </div>
    <label className="block text-sm">Wiadomość<textarea value={form.message} onChange={field("message")} required minLength={10} maxLength={4000} rows={6} placeholder="Jak możemy pomóc?" className="mt-1"/></label>
    <label className="hidden" aria-hidden="true">Strona www<input tabIndex={-1} autoComplete="off" value={form.website} onChange={field("website")}/></label>
    {error && <p className="field-error" role="alert">{error}</p>}
    <TextureButton size="lg" type="submit" disabled={busy} className="h-12">{busy ? "Wysyłanie…" : <>Wyślij wiadomość <ArrowRight size={16}/></>}</TextureButton>
    <p className="text-xs text-muted-foreground">Dane z formularza służą tylko do odpowiedzi na wiadomość.</p>
  </form>;
}
