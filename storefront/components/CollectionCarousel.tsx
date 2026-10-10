"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { catalog, fanPhoto } from "../lib/catalog";
import { autoplayAllowed, nextSlide, swipeDirection } from "../lib/carousel.mjs";
import { useStore } from "./StoreProvider";
import { ProductImage } from "./ProductCard";

const collections = [
  { key: "fans", label: "Na co dzień", eyebrow: "ZIELONA GÓRA / SKLEP KIBICA", title: ["Zastal.", "Na co dzień."], copy: "Te same barwy. Na trybunach i poza halą.", href: "/sklep", action: "Sprawdź kolekcję", theme: "dark" },
  { key: "shirts", label: "Koszulki", eyebrow: "KOSZULKI / ZASTAL ZIELONA GÓRA", title: ["W barwach", "Zastalu."], copy: "Klubowe koszulki dla dorosłych i dzieci.", href: "/sklep?category=Koszulki", action: "Zobacz koszulki", theme: "light" },
  { key: "hoodies", label: "Bluzy & retro", eyebrow: "BLUZY / KLUBOWA KLASYKA", title: ["Zielona Góra.", "Zawsze blisko."], copy: "Bluzy z kapturem i kolekcja z logo retro.", href: "/sklep?category=Bluzy", action: "Wybierz bluzę", theme: "light" },
] as const;

export default function CollectionCarousel() {
  const store = useStore();
  const [active, setActive] = useState(0), [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true), [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const shirt = store.products.find(p => p.id === 10) || store.products.find(p => p.category === "Koszulki") || catalog[9];
  const secondShirt = store.products.find(p => p.id === 3) || catalog[2];
  const hoodie = store.products.find(p => p.id === 2) || store.products.find(p => p.category === "Bluzy") || catalog[1];
  const rotating = autoplayAllowed({ count: collections.length, paused, reducedMotion, visible, hovered, focused, overlayOpen: store.dialog !== null || store.quickId !== null });
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(motion.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    updateMotion(); updateVisibility();
    motion.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => { motion.removeEventListener("change", updateMotion); document.removeEventListener("visibilitychange", updateVisibility); };
  }, []);
  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => setActive(index => nextSlide(index, 1, collections.length)), 8000);
    return () => window.clearInterval(timer);
  }, [rotating]);
  const select = (index: number) => { setPaused(true); setActive(index); };
  const move = (step: number) => { setPaused(true); setActive(index => nextSlide(index, step, collections.length)); };
  return <section className="collection-carousel container" role="region" aria-roledescription="karuzela" aria-label="Kolekcje Zastalu" tabIndex={0} data-theme={collections[active].theme} data-slide={active + 1}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        if (event.target instanceof Element && event.target.closest(".collection-slide")) event.currentTarget.focus();
        move(event.key === "ArrowRight" ? 1 : -1);
      }
    }}
    onTouchStart={event => { const first = event.touches[0]; touch.current = event.touches.length === 1 ? { x: first.clientX, y: first.clientY } : null; }}
    onTouchCancel={() => { touch.current = null; }}
    onTouchEnd={event => { const end = event.changedTouches[0], start = touch.current; touch.current = null; if (!start || !end) return; const step = swipeDirection(start.x, start.y, end.clientX, end.clientY); if (step) move(step); }}>
    {collections.map((collection, index) => <div key={collection.key} className={"collection-slide slide-" + collection.key} hidden={active !== index} role="group" aria-roledescription="slajd" aria-label={`${index + 1} z ${collections.length}: ${collection.label}`}>
      {collection.key === "fans" ? <img className="carousel-photo" src={fanPhoto} alt="Kibice Zastalu na trybunach" fetchPriority="high" decoding="async"/> : <div className={"carousel-products scene-" + collection.key}>
        <span className="scene-type" aria-hidden="true">{collection.key === "hoodies" ? "1946" : "ZASTAL"}</span>
        {collection.key === "shirts" ? <><ProductImage product={secondShirt} className="scene-secondary" eager={active === index}/><ProductImage product={shirt} className="scene-primary" eager={active === index}/></> : <ProductImage product={hoodie} className="scene-hoodie" eager={active === index}/>}
      </div>}
      <div className="slide-copy"><span className="slide-eyebrow">{collection.eyebrow}</span><h1>{collection.title.map(line => <span key={line}>{line}</span>)}</h1><p>{collection.copy}</p><Link className="slide-action" href={collection.href}>{collection.action}<ArrowUpRight size={19}/></Link></div>
      {collection.key === "fans" && <span className="slide-photo-caption" aria-hidden="true">ZASTAL ZIELONA GÓRA</span>}
    </div>)}
    <div className="carousel-toolbar"><div className="carousel-pages" role="group" aria-label="Wybierz kolekcję">{collections.map((collection, index) => <button key={collection.key} className={active === index ? "active" : ""} aria-label={`Slajd ${index + 1}: ${collection.label}`} aria-current={active === index ? "true" : undefined} onClick={() => select(index)}><span className="carousel-page-number">0{index + 1}</span><span className="carousel-page-label">{collection.label}</span></button>)}</div><div className="carousel-controls"><button className="carousel-control carousel-pause" aria-label={reducedMotion ? "Automatyczna zmiana wyłączona — ograniczenie ruchu" : paused ? "Włącz automatyczną zmianę slajdów" : "Wstrzymaj automatyczną zmianę slajdów"} disabled={reducedMotion} onClick={() => { if (paused) { setPaused(false); setFocused(false); } else setPaused(true); }}>{paused || reducedMotion ? <Play size={15}/> : <Pause size={15}/>}</button><button className="carousel-control" aria-label="Poprzedni slajd" onClick={() => move(-1)}><ChevronLeft size={19}/></button><button className="carousel-control" aria-label="Następny slajd" onClick={() => move(1)}><ChevronRight size={19}/></button></div></div>
    <span className="carousel-status" aria-live={paused ? "polite" : "off"} aria-atomic="true">Slajd {active + 1} z {collections.length}. {collections[active].title.join(" ")}</span>
  </section>;
}
