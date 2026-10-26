import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, At, Call, Location, Clock } from "reicon-react";
import ContactForm from "./ContactForm";
import { absolute } from "../../lib/site";

export const metadata: Metadata = { title: "Kontakt", description: "Napisz do sklepu Zastalu Zielona Góra: pytania o zamówienia, rozmiary, nadruki i odbiór osobisty.", alternates: { canonical: absolute("/kontakt") } };
export const dynamic = "force-dynamic";

const backend = () => process.env.ZASTAL_CMS_API || "http://127.0.0.1:8880";
async function seller() {
  try {
    const response = await fetch(backend() + "/api/store/status", { cache: "no-store", signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;
    const data = await response.json();
    const config = data?.config || {};
    return { name: String(config.seller?.name || ""), email: String(config.seller?.support_email || config.seller?.email || ""), phone: String(config.seller?.support_phone || config.seller?.phone || ""), address: String(config.pickup_address || ""), hours: String(config.pickup_hours || "") };
  } catch { return null; }
}

export default async function ContactPage() {
  const info = await seller();
  return <div className="container contact-page pb-16">
    <div className="breadcrumbs"><Link href="/">Strona główna</Link><ChevronRight size={12}/><span>Kontakt</span></div>
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div>
        <h1 className="text-3xl font-medium tracking-tight sm:text-4xl lg:text-5xl">Kontakt</h1>
        <p className="mt-4 max-w-md text-muted-foreground">Pytania o zamówienie, rozmiar, nadruk albo odbiór w klubie. Odpowiadamy e-mailem, zwykle w ciągu jednego dnia roboczego.</p>
        <ul className="mt-8 space-y-4 text-sm">
          {info?.email && <li className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary"><At size={18}/></span><a href={"mailto:" + info.email} className="hover:text-primary">{info.email}</a></li>}
          {info?.phone && <li className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary"><Call size={18}/></span><a href={"tel:" + info.phone.replace(/\s+/g, "")} className="hover:text-primary">{info.phone}</a></li>}
          {info?.address && <li className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Location size={18}/></span><span>{info.address}</span></li>}
          {info?.hours && <li className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Clock size={18}/></span><span>{info.hours}</span></li>}
        </ul>
        <p className="mt-8 text-sm text-muted-foreground">Status zamówienia sprawdzisz bez pisania: <Link href="/pomoc#zamowienia" className="inline-link">link do zamówienia</Link> albo <Link href="/konto" className="inline-link">konto klienta</Link>.</p>
      </div>
      <ContactForm/>
    </div>
  </div>;
}
