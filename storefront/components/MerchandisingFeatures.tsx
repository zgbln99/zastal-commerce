"use client";
import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { fmt, fanPhoto } from "../lib/catalog";
import { ProductImage } from "./ProductCard";
import { useStore } from "./StoreProvider";

/** A real merchandise recommendation beside the lead photo, not an ad or fake sale. */
export function LeadMerchandise() {
  const { products } = useStore();
  const chosen = products.find(item => item.id === 4) || products.find(item => item.category === "Koszulki");
  if (!chosen) return null;
  return <Link className="home-lead-merch" href={"/produkt/" + chosen.id} aria-label={"Zobacz produkt " + chosen.name}>
    <div className="home-lead-merch-head"><span>PROSTO Z KOLEKCJI</span><span>01 / 01</span></div>
    <div className="home-lead-merch-image"><div className="lead-merch-court" aria-hidden="true"><span/></div><ProductImage product={chosen} eager/></div>
    <div className="home-lead-merch-caption">
      <div className="home-lead-merch-name"><span>{chosen.category.toUpperCase()} / ZASTAL</span><strong>{chosen.name}</strong><b>{chosen.verified ? fmt(chosen.price) : "Sprawdzamy cenę"}</b></div>
      <span className="home-lead-merch-arrow"><ArrowUpRight size={21}/></span>
    </div>
  </Link>;
}

export function HomeMagazineInsert() {
  return <Link href="/sklep?category=Koszulki" className="home-magazine-insert" aria-label="Zobacz klubowe koszulki">
    <img src={fanPhoto} alt="Kibice Zastalu wspierający drużynę w hali" loading="lazy" decoding="async"/>
    <span className="home-magazine-overlay" aria-hidden="true"/>
    <div className="home-magazine-meta"><span>ZASTAL ZIELONA GÓRA</span><span>EST. 1946</span></div>
    <div className="home-magazine-body">
      <span>NA TRYBUNACH. POZA HALĄ.</span>
      <strong>W NASZYCH<br/>BARWACH.</strong>
      <div>Zobacz koszulki <ChevronRight size={18}/></div>
    </div>
    <span className="home-magazine-index" aria-hidden="true">ZG / 46</span>
  </Link>;
}
