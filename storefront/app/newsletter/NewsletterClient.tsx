"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, ChevronRight } from "reicon-react";
import NewsletterForm from "../../components/NewsletterForm";
import { TextureButton } from "@/components/templates/essentials/ui/texture-button";

/** Landing for the e-mailed links: confirms the signup or removes the address, then shows the result. */
export default function NewsletterClient() {
  const params = useSearchParams();
  const token = params.get("token") || "", action = params.get("action") === "wypisz" ? "unsubscribe" : "confirm";
  const [state, setState] = useState<{ status: "idle" | "busy" | "ok" | "error"; message: string }>({ status: token ? "busy" : "idle", message: "" });
  useEffect(() => {
    if (!token) return;
    let active = true;
    fetch(`/api/store/newsletter/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async r => { const d = await r.json(); if (!active) return; setState(r.ok ? { status: "ok", message: d.message } : { status: "error", message: d.error || "Ten link nie działa." }); })
      .catch(() => { if (active) setState({ status: "error", message: "Nie udało się połączyć ze sklepem. Spróbuj ponownie." }); });
    return () => { active = false; };
  }, [token, action]);
  return <div className="container newsletter-page pb-16">
    <div className="breadcrumbs"><Link href="/">Strona główna</Link><ChevronRight size={12}/><span>Newsletter</span></div>
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">Newsletter sklepu Zastalu</h1>
      {state.status === "busy" && <p className="mt-4 text-muted-foreground" role="status">Sprawdzamy link…</p>}
      {state.status === "ok" && <div className="newsletter-result mt-6 rounded-xl border border-primary/30 bg-accent p-5" role="status"><p className="flex items-center gap-2 font-medium"><Check size={18} className="text-primary"/>{state.message}</p><div className="mt-4"><TextureButton render={<Link href="/sklep"/>}>Przejdź do sklepu</TextureButton></div></div>}
      {state.status === "error" && <div className="newsletter-result mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-5" role="alert"><p className="font-medium">{state.message}</p><p className="mt-2 text-sm text-muted-foreground">Możesz zapisać się ponownie poniżej, wyślemy nowy link.</p></div>}
      {(state.status === "idle" || state.status === "error") && <div className="mt-8"><p className="mb-4 text-muted-foreground">Nowości, premiery i promocje w sklepie klubowym. Piszemy rzadko, tylko gdy jest o czym.</p><NewsletterForm source="page"/></div>}
    </div>
  </div>;
}
