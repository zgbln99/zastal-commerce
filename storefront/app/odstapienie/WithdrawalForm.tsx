"use client";
import { useState } from "react";
import { ArrowRight, Check } from "reicon-react";
import { TextureButton } from "@/components/templates/essentials/ui/texture-button";

const empty = { order: "", email: "", name: "", scope: "all", note: "", website: "" };

/** Two steps: fill in, then confirm the statement. The server answers with the time it was recorded. */
export default function WithdrawalForm() {
  const [form, setForm] = useState(empty);
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [sentAt, setSentAt] = useState("");
  const field = (key: keyof typeof empty) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(current => ({ ...current, [key]: event.target.value }));
  const review = (event: React.FormEvent) => { event.preventDefault(); setError(""); setStep("confirm"); };
  const send = async () => {
    if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/store/withdrawal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, confirm: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Nie udało się złożyć oświadczenia.");
      setSentAt(result.created ? new Date(result.created).toLocaleString("pl-PL") : ""); setStep("done");
    } catch (e) { setError(e instanceof Error ? e.message : "Nie udało się złożyć oświadczenia."); setStep("form"); } finally { setBusy(false); }
  };
  if (step === "done") return <div className="mt-8 rounded-2xl border border-primary/30 bg-accent p-8 text-center" role="status"><span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check size={22}/></span><h2 className="mt-4 text-2xl font-medium tracking-tight">Oświadczenie złożone</h2><p className="mt-2 text-muted-foreground">{sentAt && <>Zapisaliśmy je {sentAt}. </>}Potwierdzenie wysłaliśmy na adres {form.email}. Odpowiemy e-mailem i wskażemy, jak odesłać towar.</p></div>;
  if (step === "confirm") return <div className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-6 sm:p-8">
    <h2 className="text-xl font-medium">Sprawdź i potwierdź</h2>
    <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]"><dt className="text-muted-foreground">Zamówienie</dt><dd>{form.order}</dd><dt className="text-muted-foreground">E-mail</dt><dd>{form.email}</dd><dt className="text-muted-foreground">Imię i nazwisko</dt><dd>{form.name}</dd><dt className="text-muted-foreground">Zakres</dt><dd>{form.scope === "all" ? "Całe zamówienie" : "Część zamówienia: " + form.note}</dd>{form.scope === "all" && form.note && <><dt className="text-muted-foreground">Uwagi</dt><dd>{form.note}</dd></>}</dl>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="flex flex-wrap gap-3"><TextureButton size="lg" type="button" disabled={busy} onClick={() => void send()} className="h-12">{busy ? "Wysyłanie…" : <>Potwierdzam odstąpienie od umowy <ArrowRight size={16}/></>}</TextureButton><button type="button" className="h-12 rounded-full border border-border px-5 text-sm font-medium" disabled={busy} onClick={() => setStep("form")}>Wróć i popraw</button></div>
  </div>;
  return <form onSubmit={review} className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-6 sm:p-8">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm">Numer zamówienia<input value={form.order} onChange={field("order")} required maxLength={20} placeholder="ZS-00012" className="mt-1"/></label>
      <label className="block text-sm">E-mail podany w zamówieniu<input type="email" value={form.email} onChange={field("email")} required autoComplete="email" className="mt-1"/></label>
    </div>
    <label className="block text-sm">Imię i nazwisko<input value={form.name} onChange={field("name")} required maxLength={120} autoComplete="name" className="mt-1"/></label>
    <label className="block text-sm">Czego dotyczy odstąpienie?<select value={form.scope} onChange={field("scope")} className="mt-1"><option value="all">Całe zamówienie</option><option value="part">Wybrane produkty</option></select></label>
    <label className="block text-sm">{form.scope === "part" ? "Wskaż produkty" : "Uwagi (opcjonalnie)"}<textarea value={form.note} onChange={field("note")} required={form.scope === "part"} maxLength={600} rows={4} className="mt-1"/></label>
    <label className="hidden" aria-hidden="true">Strona www<input tabIndex={-1} autoComplete="off" value={form.website} onChange={field("website")}/></label>
    {error && <p className="field-error" role="alert">{error}</p>}
    <TextureButton size="lg" type="submit" className="h-12">Dalej <ArrowRight size={16}/></TextureButton>
  </form>;
}
