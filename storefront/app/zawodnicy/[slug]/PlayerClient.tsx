"use client";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "reicon-react";
import { useStore } from "../../../components/StoreProvider";
import { ProductImage, optimizable } from "../../../components/ProductCard";
import { fmt } from "../../../lib/catalog";
import { productDisplayPrice, productPath, type Player } from "../../../lib/commerce.mjs";
import { TextureButton } from "@/components/templates/essentials/ui/texture-button";

export default function PlayerClient({ player, source }: { player: Player; origin: string; source: string }) {
  const store = useStore();
  const live = store.players.find(p => p.id === player.id) || player;
  const printable = store.products.filter(p => p.personalization_enabled && p.verified && p.released !== false);
  return <div className="container player-page pb-16">
    <div className="breadcrumbs"><Link href="/">Strona główna</Link><ChevronRight size={12}/><Link href="/zawodnicy">Zawodnicy</Link><ChevronRight size={12}/><span>{live.name}</span></div>
    <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-12">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-primary text-primary-foreground">
        {live.photo ? <Image src={live.photo} alt={live.name} fill sizes="(min-width: 768px) 40vw, 100vw" priority unoptimized={!optimizable(live.photo)} className="object-cover"/> : <span className="absolute inset-0 flex items-center justify-center text-[9rem] font-medium leading-none tracking-tight text-white/90" aria-hidden="true">{live.number}</span>}
        <span className="absolute left-4 top-4 rounded-full bg-background/90 px-3 py-1 text-sm font-medium text-foreground">#{live.number}</span>
      </div>
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Zastal Zielona Góra{live.position ? " · " + live.position : ""}</p>
          <h1 className="mt-2 text-4xl font-medium tracking-tight sm:text-5xl">{live.name}</h1>
          <p className="mt-3 text-muted-foreground">Nadruk na koszulce: <strong className="text-foreground">{live.print_name} {live.number}</strong>. Nazwisko i numer trafiają na produkt dokładnie w tej formie.</p>
        </div>
        {printable.length ? <div className="grid gap-4 sm:grid-cols-2">{printable.slice(0, 4).map(p => <Link key={p.id} href={`${productPath(p)}?zawodnik=${live.id}`} className="group flex gap-4 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
          <span className="size-24 shrink-0 overflow-hidden rounded-lg bg-muted"><ProductImage product={p} sizes="96px" className="size-full object-cover transition-transform duration-500 group-hover:scale-105"/></span>
          <span className="flex min-w-0 flex-col justify-center"><strong className="truncate font-medium">{p.name}</strong><small className="text-muted-foreground">z nadrukiem {live.print_name} {live.number}</small><span className="mt-1 text-sm font-medium">{fmt(productDisplayPrice(p) + (p.personalization_required ? 0 : p.personalization_fee || 0))}</span><span className="mt-1 inline-flex items-center gap-1 text-sm text-primary">Wybierz rozmiar <ArrowRight size={14}/></span></span>
        </Link>)}</div> : <p className="quiet-note">{store.status === "ready" ? "Produkty z nadrukiem wkrótce." : "Wczytujemy produkty…"}</p>}
        {printable.length > 0 && <div><TextureButton size="lg" render={<Link href={`${productPath(printable[0])}?zawodnik=${live.id}`}/>}>Koszulka {live.print_name} {live.number} <ArrowRight size={18}/></TextureButton></div>}
        <p className="text-xs text-muted-foreground">Kadra według oficjalnej strony klubu: <a href={source} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">basketzg.pl</a>.</p>
      </div>
    </div>
  </div>;
}
