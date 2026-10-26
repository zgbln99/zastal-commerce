"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "reicon-react";
import { DEFAULT_HOME, titleLines, text, kicker, type SectionSettings } from "../lib/home-layout";
import { autoplayAllowed, buildHeroSlides, carouselInterval, carouselKeyStep, nextSlide, swipeDirection } from "../lib/carousel.mjs";
import { useStore } from "./StoreProvider";
import { TextureButton } from "@/components/templates/essentials/ui/texture-button";
import { cn } from "@/lib/utils";
import { optimizable } from "./ProductCard";

/** Full-height photo hero from the kit, driven by the CMS hero section (and its optional product slides). */
export default function StoreHero({ settings }: { settings?: SectionSettings }) {
  const s = settings ?? DEFAULT_HOME.sections[0].settings;
  const store = useStore();
  const slides = useMemo(() => buildHeroSlides(s, store.products), [s, store.products]);
  const [activeId, setActiveId] = useState("slide-1");
  const [paused, setPaused] = useState(false), [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false), [reducedMotion, setReducedMotion] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const touch = useRef<{ x: number; y: number } | null>(null);
  const headingId = useId();
  const index = Math.max(0, slides.findIndex(slide => slide.id === activeId));
  const slide = slides[index];
  const interval = carouselInterval(s.interval_ms);
  const playing = autoplayAllowed({ count: slides.length, autoplay: s.autoplay !== false, paused, reducedMotion, visible, hovered, focused, overlayOpen: store.dialog !== null || store.quickId !== null });
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(motion.matches);
    const syncVisibility = () => setVisible(document.visibilityState === "visible");
    syncMotion(); syncVisibility();
    motion.addEventListener("change", syncMotion); document.addEventListener("visibilitychange", syncVisibility);
    return () => { motion.removeEventListener("change", syncMotion); document.removeEventListener("visibilitychange", syncVisibility); };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setActiveId(slides[nextSlide(index, 1, slides.length)].id), interval);
    return () => window.clearTimeout(timer);
  }, [playing, index, interval, slides]);
  const go = (target: number) => { setActiveId(slides[target].id); setAnnouncement(`Slajd ${target + 1} z ${slides.length}: ${slides[target].title.replaceAll("|", " ")}`); };
  const move = (step: number) => go(nextSlide(index, step, slides.length));
  const align = text(s, "alignment");
  const lines = titleLines(slide.title);
  return <section className="store-hero relative flex min-h-svh items-end overflow-hidden bg-foreground text-white" role="region" aria-roledescription="karuzela" aria-label="Kolekcje sklepu Zastal" tabIndex={0}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
    onKeyDown={event => { const target = event.target as HTMLElement; const step = carouselKeyStep(event.key, target.tagName, target.isContentEditable); if (step && slides.length > 1 && !event.altKey && !event.ctrlKey && !event.metaKey) { event.preventDefault(); move(step); } }}
    onTouchStart={event => { if (event.touches.length === 1) { const point = event.touches[0]; touch.current = { x: point.clientX, y: point.clientY }; } else touch.current = null; }}
    onTouchCancel={() => { touch.current = null; }}
    onTouchEnd={event => { if (touch.current && event.changedTouches.length === 1) { const point = event.changedTouches[0]; const step = swipeDirection(touch.current.x, touch.current.y, point.clientX, point.clientY); if (step && slides.length > 1) move(step); } touch.current = null; }}>
    <Image key={slide.image} src={slide.image} alt={slide.image_alt} fill sizes="100vw" priority={index === 0} unoptimized={!optimizable(slide.image)} className={cn("object-cover", slide.image_role === "lifestyle" ? "object-center" : "object-contain bg-muted p-10 sm:p-16")}/>
    <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/30 to-black/10" aria-hidden="true"/>
    <div className={cn("container relative z-10 pb-16 pt-44 sm:pb-24", align === "center" && "text-center", align === "right" && "text-right")} role="group" aria-roledescription="slajd" aria-label={`${index + 1} z ${slides.length}`}>
      <div key={slide.id} className={cn("max-w-3xl", align === "center" && "mx-auto", align === "right" && "ml-auto")}>
        {kicker(slide.eyebrow) && <p className="animate-rise text-xs font-medium uppercase tracking-[0.24em] text-white/80 sm:text-sm">{kicker(slide.eyebrow)}</p>}
        <h1 id={headingId} className="animate-rise mt-4 text-5xl font-medium leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl [animation-delay:80ms]">{lines.map((line, i) => <span key={i}>{line}{i < lines.length - 1 && <br/>}</span>)}</h1>
        {slide.description && <p className="animate-rise mt-5 max-w-xl text-base text-white/85 sm:text-lg [animation-delay:160ms]">{slide.description}</p>}
        <div className={cn("animate-rise mt-8 flex flex-wrap gap-3 [animation-delay:240ms]", align === "center" && "justify-center", align === "right" && "justify-end")}>
          {slide.cta_text && <TextureButton size="lg" className="h-12" render={<Link href={slide.cta_url}/>}>{slide.cta_text} <ArrowRight size={18}/></TextureButton>}
          {slide.secondary_text && <TextureButton size="lg" variant="inverse" className="h-12" render={<Link href={slide.secondary_url}/>}>{slide.secondary_text}</TextureButton>}
        </div>
      </div>
      {slides.length > 1 && <div className="mt-10 flex items-center gap-3">
        <div className="flex items-center gap-2" aria-label="Wybór slajdu">{slides.map((item, i) => <button type="button" key={item.id} className={cn("h-1.5 rounded-full bg-white/40 transition-all", i === index ? "w-8 bg-white" : "w-3 hover:bg-white/70")} aria-label={`Slajd ${i + 1}: ${item.title.replaceAll("|", " ")}`} aria-current={i === index ? "true" : undefined} onClick={() => go(i)}/>)}</div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className="flex size-10 items-center justify-center rounded-full border border-white/30 bg-white/10 backdrop-blur-sm hover:bg-white/20" aria-label="Poprzedni slajd" onClick={() => move(-1)}><ChevronLeft size={18}/></button>
          <button type="button" className="flex size-10 items-center justify-center rounded-full border border-white/30 bg-white/10 backdrop-blur-sm hover:bg-white/20" aria-label="Następny slajd" onClick={() => move(1)}><ChevronRight size={18}/></button>
          {s.autoplay !== false && <button type="button" className="flex h-10 items-center rounded-full border border-white/30 bg-white/10 px-3 text-xs font-medium backdrop-blur-sm hover:bg-white/20" aria-label={paused ? "Wznów automatyczne slajdy" : "Wstrzymaj automatyczne slajdy"} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? "Wznów" : "Pauza"}</button>}
        </div>
      </div>}
    </div>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
  </section>;
}
