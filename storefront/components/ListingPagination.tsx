"use client";
import { ChevronLeft, ChevronRight } from "reicon-react";
import { cn } from "@/lib/utils";

export const PAGE_SIZE = 24;

/** 1 … 4 5 6 … 12: the current page, its neighbours and the ends. */
export function pageNumbers(current: number, total: number): (number | "…")[] {
  return Array.from({ length: total }, (_, i) => i + 1).reduce<(number | "…")[]>((acc, page) => {
    if (page === 1 || page === total || (page >= current - 1 && page <= current + 1)) acc.push(page);
    else if (acc[acc.length - 1] !== "…") acc.push("…");
    return acc;
  }, []);
}

const item = "inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40";

/** Numbered pagination for product listings; the caller keeps every active filter in the URL. */
export default function ListingPagination({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  if (total <= 1) return null;
  return <nav className="mt-12 flex flex-wrap items-center justify-center gap-2" aria-label="Strony listy produktów">
    <button className={item} onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Poprzednia strona"><ChevronLeft size={16}/></button>
    {pageNumbers(page, total).map((entry, index) => entry === "…" ? <span key={"gap-" + index} className="px-1 text-muted-foreground" aria-hidden="true">…</span>
      : <button key={entry} className={cn(item, entry === page && "border-primary bg-primary text-primary-foreground hover:bg-primary")} aria-current={entry === page ? "page" : undefined} onClick={() => onPage(entry)}>{entry}</button>)}
    <button className={item} onClick={() => onPage(page + 1)} disabled={page >= total} aria-label="Następna strona"><ChevronRight size={16}/></button>
  </nav>;
}
