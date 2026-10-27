"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Box, Ruler, User } from "reicon-react";
import ProductCard, { ProductImage, optimizable } from "./ProductCard";
import CampaignSection from "./CampaignSection";
import StoreHero from "./StoreHero";
import { useStore } from "./StoreProvider";
import { fmt } from "../lib/catalog";
import { productDisplayPrice, productPath } from "../lib/commerce.mjs";
import { type HomeConfig, type HomeSection, categories, text, num, bool, titleLines, kicker } from "../lib/home-layout";
import { TextureButton } from "@/components/templates/essentials/ui/texture-button";
import { cn } from "@/lib/utils";

const categoryDescriptions: Record<string, string> = { Koszulki: "Koszulki Zastalu", Bluzy: "Bluzy z kapturem", Dzieci: "Rozmiary dziecięce", Akcesoria: "Torby i drobne akcesoria" };
const categoryCovers: Record<string, number> = { Koszulki: 10, Bluzy: 1, Dzieci: 9, Akcesoria: 8 };
const categoryLabels: Record<string, string> = { Dzieci: "Dla dzieci" };
const plural = (n: number) => n === 1 ? "1 produkt" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? `${n} produkty` : `${n} produktów`;
const gridCols: Record<number, string> = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-3 lg:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5" };

function Heading({ id, title, eyebrow, link, linkText }: { id: string; title: string; eyebrow?: string; link?: string; linkText?: string }) {
  const lines = titleLines(title);
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div>{kicker(eyebrow || "") && <p className="mb-2 text-sm font-medium text-primary">{kicker(eyebrow || "")}</p>}<h2 id={id} className="text-2xl font-semibold tracking-tight sm:text-3xl">{lines.map((line, i) => <span key={i}>{line}{i < lines.length - 1 && <br/>}</span>)}</h2></div>
    {link && linkText && <Link className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline" href={link}>{linkText} <ArrowRight size={16}/></Link>}
  </div>;
}

function Block({ section }: { section: HomeSection }) {
  const { products, players } = useStore();
  const [filter, setFilter] = useState<string | null>(null);
  const s = section.settings, kind = section.type;
  const title = text(s, "title");
  const lines = titleLines(title);
  const active = filter ?? (text(s, "category") || "Wszystko");
  const links = (x: string) => "/sklep?category=" + encodeURIComponent(x);
  const chosen = products.find(p => p.id === num(s, "product_id"));
  if (kind === "campaign") return <CampaignSection section={section}/>;
  if (kind === "hero") return <StoreHero settings={s}/>;
  if (kind === "categories") {
    const cats = text(s, "categories").split(",").map(x => x.trim()).filter(Boolean);
    return <section className="container py-16 sm:py-20" aria-labelledby={section.id}>
      <Heading id={section.id} title={title} eyebrow={text(s, "eyebrow")} link="/sklep" linkText={text(s, "cta_text")}/>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cats.map((category, i) => {
          const cover = products.find(p => p.id === categoryCovers[category]) || products.find(p => p.category === category);
          const count = products.filter(p => p.category === category).length;
          const lead = i === 0;
          return <Link key={category} href={links(category)} className={cn("group relative overflow-hidden rounded-2xl bg-muted", lead ? "col-span-2 aspect-[4/3] md:row-span-2 md:aspect-auto" : "aspect-square")}>
            {cover && <ProductImage product={cover} eager={lead} sizes={lead ? "(min-width: 768px) 50vw, 100vw" : "(min-width: 768px) 25vw, 50vw"} className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"/>}
            <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" aria-hidden="true"/>
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white sm:p-5"><div><h3 className={cn("font-medium tracking-tight text-white", lead ? "text-2xl sm:text-3xl" : "text-lg")}>{categoryLabels[category] || category}</h3><p className="text-xs text-white/80 sm:text-sm">{plural(count)}{lead ? " · " + (categoryDescriptions[category] || "Zobacz kolekcję") : ""}</p></div><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition-colors group-hover:bg-white group-hover:text-foreground"><ArrowUpRight size={18}/></span></div>
          </Link>;
        })}
      </div>
    </section>;
  }
  if (kind === "products") {
    const selected = products.filter(p => active === "Wszystko" || p.category === active);
    const picks = text(s, "product_ids").split(",").map(x => Number(x.trim())).filter(Boolean);
    const sorted = picks.length ? [...picks.map(id => selected.find(p => p.id === id)).filter((p): p is typeof selected[number] => Boolean(p)), ...selected.filter(p => !picks.includes(p.id))] : selected;
    return <section className="container py-16 sm:py-20" aria-labelledby={section.id}>
      <Heading id={section.id} title={title} eyebrow={text(s, "eyebrow")} link="/sklep" linkText={text(s, "cta_text")}/>
      {bool(s, "show_filters") && <div className="mb-8 flex flex-wrap gap-2" aria-label="Filtruj produkty">{categories.map(x => <button key={x} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3.5 text-sm font-medium transition-colors hover:bg-muted", x === active && "border-primary bg-primary text-primary-foreground hover:bg-primary")} aria-pressed={x === active} onClick={() => setFilter(x)}>{categoryLabels[x] || x}<span className={cn("text-xs", x === active ? "text-primary-foreground/70" : "text-muted-foreground")}>{x === "Wszystko" ? products.length : products.filter(p => p.category === x).length}</span></button>)}</div>}
      <div className={cn("grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10", gridCols[num(s, "columns", 4)] || gridCols[4])}>
        {sorted.slice(0, num(s, "count", 8)).map((p, i) => <ProductCard key={p.id} product={p} eager={i < 4}/>)}
      </div>
      {!sorted.length && <p className="text-sm text-muted-foreground">Brak produktów w wybranej kategorii.</p>}
      <div className="mt-10 flex justify-center"><TextureButton variant="secondary" render={<Link href={active === "Wszystko" ? "/sklep" : links(active)}/>}>Zobacz wszystkie produkty <ArrowRight size={16}/></TextureButton></div>
    </section>;
  }
  if (kind === "personalization") {
    if (!chosen || !chosen.personalization_enabled) return null;
    return <section className="container py-8" aria-labelledby={section.id}>
      <div className="grid overflow-hidden rounded-2xl bg-primary text-primary-foreground md:grid-cols-2">
        <div className="flex flex-col justify-center gap-5 p-8 sm:p-12">
          {kicker(text(s, "eyebrow")) && <p className="text-sm font-medium text-primary-foreground/75">{kicker(text(s, "eyebrow"))}</p>}
          <h2 id={section.id} className="text-3xl font-medium leading-[1.08] tracking-tight text-primary-foreground sm:text-4xl lg:text-5xl">{lines.map((line, i) => <span key={i}>{line}{i < lines.length - 1 && <br/>}</span>)}</h2>
          <p className="max-w-md text-base text-primary-foreground/85">{text(s, "description")}</p>
          {players.length > 0 && <div className="text-sm">
            <p className="mb-2 flex items-center gap-2 text-primary-foreground/70"><User size={16}/> Kadra w tym sezonie</p>
            <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0">{players.map(player => <li key={player.id}><Link href={`${productPath(chosen)}?zawodnik=${player.id}`} className="font-medium text-white hover:underline underline-offset-4">{player.name} <span className="text-primary-foreground/70">{player.number}</span></Link></li>)}</ul>
            <p className="mt-3 text-primary-foreground/70">Albo wpisz własne nazwisko i numer.</p>
          </div>}
          <div><TextureButton variant="inverse" size="lg" render={<Link href={productPath(chosen)}/>}>{text(s, "button_text")} <ArrowRight size={18}/></TextureButton></div>
        </div>
        <Link href={productPath(chosen)} className="group relative min-h-72 bg-muted"><ProductImage product={chosen} sizes="(min-width: 768px) 50vw, 100vw" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"/><span className="absolute bottom-4 left-4 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm">{chosen.name}{chosen.verified ? " · " + fmt(productDisplayPrice(chosen)) : ""}</span></Link>
      </div>
    </section>;
  }
  if (kind === "retro") {
    if (!chosen) return null;
    const image = text(s, "image");
    return <section className="container py-8" aria-labelledby={section.id}>
      <div className="grid overflow-hidden rounded-2xl border border-border bg-card md:grid-cols-2">
        <Link href={productPath(chosen)} className="group relative min-h-72 bg-muted md:order-2">{image ? <Image src={image} alt={chosen.name} fill sizes="(min-width: 768px) 50vw, 100vw" unoptimized={!optimizable(image)} className="object-cover transition-transform duration-500 group-hover:scale-105"/> : <ProductImage product={chosen} sizes="(min-width: 768px) 50vw, 100vw" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"/>}</Link>
        <div className="flex flex-col justify-center gap-5 p-8 sm:p-12">
          {kicker(text(s, "eyebrow")) && <p className="text-sm font-medium text-primary">{kicker(text(s, "eyebrow"))}</p>}
          <h2 id={section.id} className="text-3xl font-medium leading-[1.08] tracking-tight sm:text-4xl">{lines.map((line, i) => <span key={i}>{line}{i < lines.length - 1 && <br/>}</span>)}</h2>
          <p className="max-w-md text-muted-foreground">{text(s, "description")}</p>
          <p className="text-sm"><span className="font-medium">{chosen.name}</span>{chosen.verified && <span className="text-muted-foreground"> · {fmt(productDisplayPrice(chosen))}</span>}</p>
          <div><TextureButton size="lg" render={<Link href={productPath(chosen)}/>}>{text(s, "button_text")} <ArrowRight size={18}/></TextureButton></div>
        </div>
      </div>
    </section>;
  }
  if (kind === "accessories") {
    const chosenItems = products.filter(p => p.category === "Akcesoria").slice(0, num(s, "count", 3));
    if (!chosenItems.length) return null;
    return <section className="container py-16 sm:py-20" aria-labelledby={section.id}>
      <Heading id={section.id} title={title} eyebrow={text(s, "eyebrow")} link={links("Akcesoria")} linkText="Zobacz akcesoria"/>
      {text(s, "description") && <p className="-mt-4 mb-8 max-w-xl text-muted-foreground">{text(s, "description")}</p>}
      <div className="grid gap-4 sm:grid-cols-3">{chosenItems.map(p => <Link key={p.id} href={productPath(p)} className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"><span className="aspect-square overflow-hidden rounded-lg bg-muted"><ProductImage product={p} sizes="(min-width: 640px) 33vw, 100vw" className="size-full object-cover transition-transform duration-500 group-hover:scale-105"/></span><span className="mt-4 flex items-start justify-between gap-3"><span><span className="block text-sm font-medium">{p.name}</span><span className="block text-xs text-muted-foreground">{p.subtitle || "Akcesoria"}</span></span><span className="text-sm font-medium">{p.verified ? fmt(productDisplayPrice(p)) : "…"}</span></span></Link>)}</div>
    </section>;
  }
  if (kind === "banner") {
    const image = text(s, "image");
    const alignment = text(s, "alignment");
    return <section className="container py-8" aria-labelledby={section.id}>
      <div className={cn("relative flex min-h-80 overflow-hidden rounded-2xl p-8 sm:min-h-96 sm:p-12", alignment === "center" ? "items-center justify-center text-center" : alignment === "right" ? "items-end justify-end text-right" : "items-end")} style={{ backgroundColor: text(s, "background") || undefined, color: text(s, "text_color") || undefined }}>
        {image && <Image src={image} alt="" fill sizes="100vw" unoptimized={!optimizable(image)} className="object-cover"/>}
        {image && <div className="absolute inset-0 bg-linear-to-t from-foreground/90 via-foreground/55 to-foreground/15" aria-hidden="true"/>}
        <div className={cn("relative z-10 max-w-xl", image && "text-white")}>
          {kicker(text(s, "eyebrow")) && <p className="mb-3 text-sm font-medium opacity-80">{kicker(text(s, "eyebrow"))}</p>}
          <h2 id={section.id} className={cn("text-3xl font-medium leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl", image ? "text-white" : "text-foreground")}>{lines.map((line, i) => <span key={i}>{line}{i < lines.length - 1 && <br/>}</span>)}</h2>
          {text(s, "description") && <p className="mt-4 text-base opacity-90">{text(s, "description")}</p>}
          {text(s, "cta_text") && <div className="mt-6"><TextureButton variant={image ? "inverse" : "primary"} size="lg" render={<Link href={text(s, "cta_url") || "/sklep"}/>}>{text(s, "cta_text")} <ArrowRight size={18}/></TextureButton></div>}
        </div>
      </div>
    </section>;
  }
  if (kind === "ticker") {
    const items = text(s, "items").split("|").map(x => x.trim()).filter(Boolean);
    const group = (hidden: boolean) => <div className="ticker-group" aria-hidden={hidden || undefined}>{items.map((item, i) => <span key={i} className="flex items-center whitespace-nowrap px-6 text-sm font-medium tracking-wide">{item}<span className="ml-12 inline-block size-1.5 rounded-full bg-current opacity-40" aria-hidden="true"/></span>)}</div>;
    return <section className="ticker py-3" aria-label="Komunikaty sklepu" style={{ backgroundColor: text(s, "background") || undefined, color: text(s, "text_color") || undefined, ["--ticker-speed" as string]: Math.max(10, num(s, "speed") || 30) + "s" }}>
      <div className="ticker-track">{group(false)}{group(true)}{group(true)}{group(true)}</div>
    </section>;
  }
  if (kind === "text") {
    const alignment = text(s, "alignment");
    return <section className={cn("container py-12", alignment === "center" && "text-center", alignment === "right" && "text-right")} aria-labelledby={section.id}>
      <div className={cn("max-w-2xl rounded-2xl p-8 sm:p-10", alignment === "center" && "mx-auto", alignment === "right" && "ml-auto")} style={{ backgroundColor: text(s, "background") || undefined, color: text(s, "text_color") || undefined }}>
        {kicker(text(s, "eyebrow")) && <p className="mb-3 text-sm font-medium text-primary">{kicker(text(s, "eyebrow"))}</p>}
        <h2 id={section.id} className="text-3xl font-medium leading-[1.1] tracking-tight sm:text-4xl">{lines.map((line, i) => <span key={i}>{line}{i < lines.length - 1 && <br/>}</span>)}</h2>
        <p className="mt-4 text-base opacity-85">{text(s, "description")}</p>
      </div>
    </section>;
  }
  if (kind === "services") {
    const blocks = [
      { title: text(s, "first_title"), description: text(s, "first_text"), href: "/pomoc#dostawa", icon: <Box size={18}/> },
      { title: text(s, "second_title"), description: text(s, "second_text"), href: "/konto", icon: <User size={18}/> },
      { title: text(s, "third_title"), description: text(s, "third_text"), href: "/pomoc#rozmiary", icon: <Ruler size={18}/> }
    ];
    return <section className="container py-16 sm:py-20" aria-label={text(s, "title")}>
      <h2 className="mb-8 text-2xl font-semibold tracking-tight sm:text-3xl">{text(s, "title")}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{blocks.map((entry, i) => <Link key={i} href={entry.href} className="group flex flex-col gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"><span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">{entry.icon}</span><span><strong className="block text-base font-medium">{entry.title}</strong><span className="mt-1 block text-sm text-muted-foreground">{entry.description}</span></span><span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">Więcej <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5"/></span></Link>)}</div>
    </section>;
  }
  return null;
}

/** `editing` wraps every section in a marker box so the editor can pick and highlight it; the public page renders without it. */
export default function HomeCanvas({ config, editing, selectedId }: { config: HomeConfig; editing?: boolean; selectedId?: string }) {
  const enabled = config.sections.filter(section => section.enabled);
  const startsWithHero = enabled[0]?.type === "hero";
  return <div className={cn("cms-home", !startsWithHero && !editing && "pt-16")}>
    {enabled.map(section => editing
      ? <div key={section.id} data-section-id={section.id} className={cn("home-pick", selectedId === section.id && "home-pick-on")}><Block section={section}/></div>
      : <Block key={section.id} section={section}/>)}
  </div>;
}
