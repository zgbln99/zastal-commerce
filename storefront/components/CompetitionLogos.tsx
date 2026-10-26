"use client";
import type { Competition } from "../lib/commerce.mjs";
import { cn } from "@/lib/utils";

/** The competitions the club plays in, as uploaded in the admin panel; a name-only chip until a logo is uploaded. */
export default function CompetitionLogos({ items, tone = "light", size = "sm", className = "" }: { items: Competition[]; tone?: "light" | "dark"; size?: "sm" | "lg"; className?: string }) {
  if (!items.length) return null;
  const chip = cn("inline-flex items-center gap-2 rounded-full border px-3 font-medium transition-colors", size === "lg" ? "h-12 text-sm" : "h-9 text-xs", tone === "dark" ? "border-white/20 bg-white/10 text-white hover:bg-white/20" : "border-border bg-background text-foreground hover:bg-muted");
  return <ul className={cn("m-0 flex list-none flex-wrap items-center gap-2 p-0", className)} aria-label="Rozgrywki, w których gra Zastal">
    {items.map(item => { const inner = <>{item.image && <img src={item.image} alt="" className={cn("object-contain", size === "lg" ? "h-8 max-w-28" : "h-6 max-w-20")} loading="lazy"/>}<span className={cn(item.image && size === "sm" && "sr-only")}>{item.name}</span></>;
      return <li key={item.key}>{item.url ? <a href={item.url} target="_blank" rel="noreferrer" className={chip} title={item.name}>{inner}</a> : <span className={chip} title={item.name}>{inner}</span>}</li>; })}
  </ul>;
}
