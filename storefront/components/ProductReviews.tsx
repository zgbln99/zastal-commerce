"use client";
import { useEffect, useState } from "react";
import { Check, ShieldCheck, Star } from "reicon-react";
import Stars from "./Stars";
import { TextureButton } from "@/components/templates/essentials/ui/texture-button";
import { cn } from "@/lib/utils";

type Review = { id: number; author: string; rating: number; content: string; created: string; verified: boolean; reply: string };
type Summary = { count: number; average: number; distribution: Record<string, number> };
const plural = (n: number) => n === 1 ? "1 opinia" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? `${n} opinie` : `${n} opinii`;

function StarInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [hover, setHover] = useState(0);
  return <div className="flex gap-1" role="radiogroup" aria-label="Ocena">
    {Array.from({ length: 5 }, (_, i) => { const star = i + 1; const on = star <= (hover || value); return <button key={star} type="button" role="radio" aria-checked={value === star} aria-label={`${star} ${star === 1 ? "gwiazdka" : star < 5 ? "gwiazdki" : "gwiazdek"}`} onMouseEnter={() => setHover(star)} onMouseLeave={() => setHover(0)} onClick={() => onChange(star)} className="rounded-full p-0.5 transition-transform hover:scale-110"><Star size={26} weight={on ? "Filled" : "Outline"} className={on ? "text-orange" : "text-muted-foreground/50"}/></button>; })}
  </div>;
}

/** Approved reviews with a summary, and the form that sends a new one to moderation. */
export default function ProductReviews({ productId, productName }: { productId: number; productName: string }) {
  const [data, setData] = useState<{ summary: Summary; reviews: Review[] } | null>(null);
  const [rating, setRating] = useState(0), [author, setAuthor] = useState(""), [email, setEmail] = useState(""), [content, setContent] = useState(""), [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false), [done, setDone] = useState(""), [error, setError] = useState(""), [formOpen, setFormOpen] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/store/products/${productId}/reviews`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(d => { if (active && d?.summary) setData(d); }).catch(() => {});
    return () => { active = false; };
  }, [productId]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    if (!rating) { setError("Wybierz ocenę od 1 do 5 gwiazdek."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/store/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: productId, author, email, rating, content, website }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Nie udało się wysłać opinii.");
      setDone(result.message); setFormOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Nie udało się wysłać opinii."); } finally { setBusy(false); }
  };
  const summary = data?.summary;
  return <section id="opinie" className="product-reviews mt-20 scroll-mt-32 border-t border-border pt-12" aria-labelledby="reviews-heading">
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 id="reviews-heading" className="text-2xl font-medium tracking-tight sm:text-3xl">Opinie klientów</h2><p className="mt-1 text-sm text-muted-foreground">{summary && summary.count > 0 ? `${plural(summary.count)} o produkcie ${productName}.` : "Jeszcze nikt nie ocenił tego produktu."}</p></div>
      {summary && summary.count > 0 && <div className="flex items-center gap-3"><Stars rating={summary.average} size={18}/><span className="text-2xl font-medium">{summary.average.toFixed(1).replace(".", ",")}</span><span className="text-sm text-muted-foreground">/ 5</span></div>}
    </div>
    {summary && summary.count > 0 && <div className="mb-8 grid max-w-sm gap-1.5" aria-label="Rozkład ocen">{[5, 4, 3, 2, 1].map(star => { const n = summary.distribution[String(star)] || 0; return <div key={star} className="flex items-center gap-3 text-xs"><span className="w-12 text-muted-foreground">{star} gw.</span><span className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-orange" style={{ width: `${summary.count ? (n / summary.count) * 100 : 0}%` }}/></span><span className="w-6 text-right tabular-nums text-muted-foreground">{n}</span></div>; })}</div>}
    <div className="grid gap-10 lg:grid-cols-[1fr_minmax(20rem,24rem)]">
      <div className="space-y-6">
        {data?.reviews.map(review => <article key={review.id} className="review border-b border-border pb-6 last:border-0">
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-3"><Stars rating={review.rating}/><span className="text-sm font-medium">{review.author}</span>{review.verified && <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground"><ShieldCheck size={12}/> Potwierdzony zakup</span>}</div><time className="text-xs text-muted-foreground" dateTime={review.created}>{new Date(review.created).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })}</time></div>
          <p className="mt-3 text-sm leading-relaxed text-foreground/85 whitespace-pre-line">{review.content}</p>
          {review.reply && <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">Odpowiedź sklepu: </span>{review.reply}</p>}
        </article>)}
        {data && !data.reviews.length && <p className="text-sm text-muted-foreground">Kupiłeś ten produkt? Twoja opinia pomoże innym kibicom wybrać rozmiar i wersję.</p>}
      </div>
      <div>
        {done ? <div className="review-sent rounded-xl border border-primary/30 bg-accent p-5 text-sm" role="status"><p className="flex items-center gap-2 font-medium"><Check size={16} className="text-primary"/> Opinia wysłana</p><p className="mt-1 text-muted-foreground">{done}</p></div>
        : !formOpen ? <TextureButton variant="secondary" onClick={() => setFormOpen(true)}>Napisz opinię</TextureButton>
        : <form onSubmit={submit} className="review-form space-y-4 rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-medium">Twoja opinia</h3>
          <div><span className="mb-1.5 block text-sm">Ocena</span><StarInput value={rating} onChange={setRating}/></div>
          <label className="block text-sm">Imię<input value={author} onChange={e => setAuthor(e.target.value)} required maxLength={60} autoComplete="given-name" className="mt-1"/></label>
          <label className="block text-sm">E-mail (nie pokazujemy go)<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" className="mt-1"/><span className="mt-1 block text-xs text-muted-foreground">Jeśli kupiłeś ten produkt na ten adres, opinia dostanie znaczek potwierdzonego zakupu.</span></label>
          <label className="block text-sm">Opinia<textarea value={content} onChange={e => setContent(e.target.value)} required minLength={10} maxLength={2000} rows={4} placeholder="Jak sprawdza się produkt, czy rozmiar pasuje?" className="mt-1"/></label>
          <label className="hidden" aria-hidden="true">Strona www<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)}/></label>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="flex flex-wrap gap-2"><TextureButton type="submit" disabled={busy}>{busy ? "Wysyłanie…" : "Wyślij opinię"}</TextureButton><button type="button" className={cn("text-sm text-muted-foreground hover:text-foreground")} onClick={() => setFormOpen(false)}>Anuluj</button></div>
          <p className="text-xs text-muted-foreground">Opinie publikujemy po sprawdzeniu przez obsługę sklepu.</p>
        </form>}
      </div>
    </div>
  </section>;
}
