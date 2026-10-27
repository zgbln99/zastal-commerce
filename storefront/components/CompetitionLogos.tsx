"use client";
import type { Competition } from "../lib/commerce.mjs";
import { cn } from "@/lib/utils";

/** Logotypes of the competitions the club plays in, uploaded in the admin panel. Entries without a file are not shown. */
export default function CompetitionLogos({ items, tone = "light", size = "sm", className = "" }: { items: Competition[]; tone?: "light" | "dark"; size?: "sm" | "lg"; className?: string }) {
  const shown = items.filter(item => item.image);
  if (!shown.length) return null;
  const box = cn("inline-flex items-center justify-center rounded-md", tone === "dark" ? "bg-white/95 px-2.5 py-1.5" : "", size === "lg" ? "h-14" : "h-9");
  return <ul className={cn("m-0 flex list-none flex-wrap items-center gap-3 p-0", className)} aria-label="Rozgrywki Zastalu">
    {shown.map(item => { const img = <img src={item.image} alt={item.name} title={item.name} className={cn("w-auto object-contain", size === "lg" ? "h-10 max-w-36" : "h-6 max-w-24")} loading="lazy"/>;
      return <li key={item.key}>{item.url ? <a href={item.url} target="_blank" rel="noreferrer" className={box}>{img}</a> : <span className={box}>{img}</span>}</li>; })}
  </ul>;
}
