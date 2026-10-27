"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CONSENT_KEY, allowedTrackers, optionalCategories, parseConsent, serializeConsent, type Consent } from "../lib/consent.mjs";
import { useStore } from "./StoreProvider";
import Modal from "./Modal";
import { cn } from "@/lib/utils";

export const COOKIE_SETTINGS_EVENT = "zastal:cookie-settings";
const choiceButton = "inline-flex h-11 flex-1 items-center justify-center rounded-full border border-foreground/25 bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

declare global { interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown }; _fbq?: unknown } }

const load = (src: string) => { if (document.querySelector(`script[src="${src}"]`)) return; const el = document.createElement("script"); el.async = true; el.src = src; document.head.append(el); };
function startGoogle(id: string) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer!.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", id, { anonymize_ip: true });
  load("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id));
}
function startMeta(id: string) {
  if (!window.fbq) {
    const stub = function (...args: unknown[]) { if (stub.callMethod) stub.callMethod(...args); else (stub.queue as unknown[]).push(args); } as NonNullable<Window["fbq"]>;
    stub.queue = []; stub.loaded = true; stub.version = "2.0"; window.fbq = stub; window._fbq = stub;
  }
  window.fbq!("init", id);
  window.fbq!("track", "PageView");
  load("https://connect.facebook.net/en_US/fbevents.js");
}
/** Tools the visitor refused or withdrew leave no cookies behind (the page reloads without their scripts). */
function clearMeasurementCookies() {
  for (const name of document.cookie.split(";").map(x => x.split("=")[0].trim())) {
    if (!/^(_ga|_gid|_gat|_fbp|_fbc)/.test(name)) continue;
    for (const domain of [location.hostname, "." + location.hostname.split(".").slice(-2).join(".")]) document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${domain}`;
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

export default function CookieConsent() {
  const store = useStore();
  const tracking = store.sales.tracking;
  const categories = optionalCategories(tracking);
  const optional = categories.statistics || categories.marketing;
  const [consent, setConsent] = useState<Consent | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ statistics: false, marketing: false });
  const [started, setStarted] = useState({ ga4: "", metaPixel: "" });

  useEffect(() => {
    try { setConsent(parseConsent(localStorage.getItem(CONSENT_KEY))); } catch { setConsent(null); }
    setReady(true);
  }, []);
  useEffect(() => {
    const show = () => { setDraft({ statistics: consent?.statistics === true, marketing: consent?.marketing === true }); setOpen(true); };
    window.addEventListener(COOKIE_SETTINGS_EVENT, show);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, show);
  }, [consent]);
  // Measurement scripts start only after the matching consent and only for tools configured by the seller.
  useEffect(() => {
    if (!store.sales.loaded) return;
    const allowed = allowedTrackers(consent, tracking);
    if (allowed.ga4 && started.ga4 !== allowed.ga4) { startGoogle(allowed.ga4); setStarted(s => ({ ...s, ga4: allowed.ga4 })); }
    if (allowed.metaPixel && started.metaPixel !== allowed.metaPixel) { startMeta(allowed.metaPixel); setStarted(s => ({ ...s, metaPixel: allowed.metaPixel })); }
  }, [consent, tracking.ga4, tracking.metaPixel, store.sales.loaded]);

  const save = (choice: { statistics: boolean; marketing: boolean }) => {
    const next = { statistics: choice.statistics && categories.statistics, marketing: choice.marketing && categories.marketing, at: Date.now() };
    const withdrew = (started.ga4 && !next.statistics) || (started.metaPixel && !next.marketing);
    try { localStorage.setItem(CONSENT_KEY, serializeConsent(next, next.at)); } catch { /* the choice then applies to this visit only */ }
    setConsent(next); setOpen(false);
    if (withdrew) { clearMeasurementCookies(); window.location.reload(); }
  };
  const policy = store.sales.pages.some(p => p.slug === "polityka-cookies") ? "/informacje/polityka-cookies" : store.sales.legal.privacy;
  const policyLink = policy ? (policy.startsWith("/") ? <Link href={policy} className="underline underline-offset-2">Polityka cookies</Link> : <a href={policy} className="underline underline-offset-2" target="_blank" rel="noreferrer">Polityka prywatności</a>) : null;

  const banner = ready && store.sales.loaded && consent === null && !open;
  return <>
    {banner && <section className="cookie-banner fixed inset-x-3 bottom-3 z-[160] mx-auto max-w-lg rounded-2xl border border-border bg-background p-5 text-foreground shadow-2xl sm:inset-x-auto sm:bottom-5 sm:left-5 sm:mx-0" aria-label="Pliki cookies" role="region">
      <h2 className="text-base font-semibold">Pliki cookies w sklepie</h2>
      <p className="mt-2 text-sm text-muted-foreground">{optional
        ? <>Niezbędne pliki (logowanie, koszyk, zabezpieczenia) działają zawsze. {categories.statistics && "Statystyki "}{categories.statistics && categories.marketing && "i "}{categories.marketing && "marketing "}włączymy tylko za Twoją zgodą. Możesz ją zmienić w każdej chwili w stopce. </>
        : <>Sklep używa wyłącznie plików niezbędnych do działania: logowania, koszyka i zabezpieczeń. Nie wymagają one zgody i nie służą do śledzenia. </>}{policyLink}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {optional ? <>
          <button type="button" className={choiceButton} onClick={() => save({ statistics: false, marketing: false })}>Odrzucam opcjonalne</button>
          <button type="button" className={choiceButton} onClick={() => save({ statistics: true, marketing: true })}>Akceptuję wszystkie</button>
          <button type="button" className="inline-flex h-10 w-full items-center justify-center text-sm font-medium underline underline-offset-4" onClick={() => { setDraft({ statistics: false, marketing: false }); setOpen(true); }}>Ustawienia</button>
        </> : <button type="button" className={choiceButton} onClick={() => save({ statistics: false, marketing: false })}>Rozumiem</button>}
      </div>
    </section>}
    {open && <Modal title="Ustawienia cookies" onClose={() => setOpen(false)}>
      <div className="modal-title"><div><h2>Ustawienia cookies</h2><p>Decyzję możesz zmienić w każdej chwili. Zgoda obowiązuje 12 miesięcy.</p></div><button type="button" className="icon-btn" aria-label="Zamknij" onClick={() => setOpen(false)}>×</button></div>
      <div className="space-y-3 px-1 py-2">
        <Row title="Niezbędne" text="Sesja konta (__Host-zastal_session), koszyk i ulubione w pamięci przeglądarki, zapamiętanie tego wyboru. Bez nich sklep nie działa, dlatego nie można ich wyłączyć." on disabled />
        {categories.statistics && <Row title="Statystyki" text="Google Analytics 4 mierzy, które strony są odwiedzane. Włączamy je tylko po Twojej zgodzie." on={draft.statistics} onChange={v => setDraft(d => ({ ...d, statistics: v }))} />}
        {categories.marketing && <Row title="Marketing" text="Piksel Meta pozwala mierzyć skuteczność reklam. Włączamy go tylko po Twojej zgodzie." on={draft.marketing} onChange={v => setDraft(d => ({ ...d, marketing: v }))} />}
        {!optional && <p className="text-sm text-muted-foreground">Sklep nie korzysta obecnie z plików statystycznych ani marketingowych.</p>}
        <p className="text-sm text-muted-foreground">{policyLink}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {optional ? <>
          <button type="button" className={choiceButton} onClick={() => save({ statistics: false, marketing: false })}>Odrzucam opcjonalne</button>
          <button type="button" className={choiceButton} onClick={() => save(draft)}>Zapisz wybór</button>
          <button type="button" className={choiceButton} onClick={() => save({ statistics: true, marketing: true })}>Akceptuję wszystkie</button>
        </> : <button type="button" className={choiceButton} onClick={() => save({ statistics: false, marketing: false })}>Zamknij</button>}
      </div>
    </Modal>}
  </>;
}

function Row({ title, text, on, disabled, onChange }: { title: string; text: string; on: boolean; disabled?: boolean; onChange?: (value: boolean) => void }) {
  return <label className={cn("flex items-start justify-between gap-4 rounded-xl border border-border p-4", !disabled && "cursor-pointer")}>
    <span><strong className="block text-sm font-semibold">{title}</strong><span className="mt-1 block text-sm text-muted-foreground">{text}</span></span>
    <input type="checkbox" role="switch" className="mt-1 size-5 shrink-0 accent-[var(--primary)]" checked={on} disabled={disabled} onChange={e => onChange?.(e.target.checked)} aria-label={title} />
  </label>;
}
