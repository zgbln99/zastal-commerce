"use client";

import {storeUrl} from "../lib/urls.mjs";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useStore } from "./StoreProvider";
import { DEFAULT_HOME, titleLines, type SectionSettings } from "../lib/home-layout";
import { buildHeroSlides, carouselInterval, nextSlide } from "../lib/carousel.mjs";

export default function YnsHero({ settings }: { settings?: SectionSettings }) {
  const { products } = useStore();
  const config = settings ?? DEFAULT_HOME.sections[0].settings;
  const slides = useMemo(() => buildHeroSlides(config, products), [config, products]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (config.autoplay === false || slides.length < 2 || paused || reducedMotion) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setActive(value => nextSlide(value, 1, slides.length));
    }, carouselInterval(config.interval_ms));
    return () => window.clearInterval(timer);
  }, [config.autoplay, config.interval_ms, slides.length, paused, reducedMotion]);
  if (!slides.length) return null;
  const index = Math.min(active, slides.length - 1);
  const slide = slides[index];
  return <section className="yns-hero" aria-label="Kolekcja Zastal Store"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
    <div className={`yns-hero-media yns-media-${slide.image_role || "packshot"}`}>
      <img key={slide.id} src={slide.image} alt={slide.image_alt || slide.title} fetchPriority={index === 0 ? "high" : "auto"} decoding="async"/>
    </div>
    <div className="yns-hero-copy">
      <div className="yns-hero-content" key={slide.id}>
        <h1>{titleLines(slide.title).map((line, lineIndex) => <span key={lineIndex}>{line}</span>)}</h1>
        <p className="yns-hero-description">{slide.description}</p>
        {slide.cta_text && <Link className="yns-button-primary" href={storeUrl(slide.cta_url || "/sklep",products)}>{slide.cta_text}<ArrowRight size={17}/></Link>}
      </div>
      {slides.length > 1 && <div className="yns-hero-controls" aria-label="Przełącz slajd">
        <span className="yns-hero-position">{String(index + 1).padStart(2, "0")} <span>/</span> {String(slides.length).padStart(2, "0")}</span>
        <div className="yns-hero-progress">{slides.map((item, i) => <button key={item.id} type="button" aria-label={`Slajd ${i + 1}: ${item.title}`} aria-current={i === index ? "true" : undefined} className={i === index ? "active" : ""} onClick={() => setActive(i)}/>)}</div>
        <button type="button" aria-label="Poprzedni slajd" onClick={() => setActive(value => nextSlide(value, -1, slides.length))}><ArrowLeft size={18}/></button>
        <button type="button" aria-label="Następny slajd" onClick={() => setActive(value => nextSlide(value, 1, slides.length))}><ArrowRight size={18}/></button>
      </div>}
    </div>
  </section>;
}
