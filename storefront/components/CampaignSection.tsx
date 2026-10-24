"use client";
import Link from "next/link";
import { ArrowRight } from "reicon-react";
import { useStore } from "./StoreProvider";
import ProductCard from "./ProductCard";
import { type HomeSection, text, kicker } from "../lib/home-layout";
import { campaignReady } from "../lib/product-media.mjs";
import { cn } from "@/lib/utils";

/** CMS campaign: a photo panel next to copy and the products it promotes. */
export default function CampaignSection({ section }: { section: HomeSection }) {
  const { products } = useStore(), s = section.settings;
  if (!campaignReady(s, products)) return null;
  const ids = text(s, "product_ids").split(",").map(Number);
  const associated = ids.map(id => products.find(p => p.id === id)).filter((p): p is typeof products[number] => !!p);
  const right = text(s, "alignment") === "right";
  return <section className="container py-12" aria-labelledby={section.id}>
    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-12">
      <figure className={cn("relative min-h-80 overflow-hidden rounded-2xl bg-muted", right && "lg:order-2")}><img src={text(s, "image")} alt={text(s, "image_alt")} loading="lazy" className="absolute inset-0 size-full object-cover" onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = "/assets/product-unavailable.svg"; e.currentTarget.alt = "Zdjęcie kampanii niedostępne"; }}/></figure>
      <div className="flex flex-col gap-5">
        {kicker(text(s, "eyebrow")) && <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">{kicker(text(s, "eyebrow"))}</p>}
        <h2 id={section.id} className="text-3xl font-medium leading-[1.08] tracking-tight sm:text-4xl">{text(s, "title")}</h2>
        <p className="max-w-xl text-muted-foreground">{text(s, "description")}</p>
        {text(s, "cta_text") && <Link className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline" href={text(s, "cta_url") || "/sklep"}>{text(s, "cta_text")} <ArrowRight size={16}/></Link>}
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">{associated.map(p => <ProductCard key={p.id} product={p}/>)}</div>
      </div>
    </div>
  </section>;
}
