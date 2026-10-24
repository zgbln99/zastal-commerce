"use client";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { DEFAULT_HOME, titleLines, text, num, type SectionSettings } from "../lib/home-layout";
import { autoplayAllowed, buildHeroSlides, carouselInterval, carouselKeyStep, nextSlide, swipeDirection } from "../lib/carousel.mjs";
import { useStore } from "./StoreProvider";

export default function StoreHero({settings}: {settings?:SectionSettings}) {
  const s=settings??DEFAULT_HOME.sections[0].settings;
  const store=useStore();
  const slides=useMemo(()=>buildHeroSlides(s,store.products),[s,store.products]);
  const [activeId,setActiveId]=useState("slide-1");
  const [paused,setPaused]=useState(false),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false);
  // Start conservatively until browser visibility and motion preferences are read.
  const [visible,setVisible]=useState(false),[reducedMotion,setReducedMotion]=useState(true);
  const [announcement,setAnnouncement]=useState("");
  const touch=useRef<{x:number;y:number}|null>(null);
  const headingId=useId();
  const index=Math.max(0,slides.findIndex(slide=>slide.id===activeId));
  const slide=slides[index];
  const interval=carouselInterval(s.interval_ms);
  const playing=autoplayAllowed({count:slides.length,autoplay:s.autoplay!==false,paused,reducedMotion,visible,hovered,focused,overlayOpen:store.dialog!==null||store.quickId!==null});
  useEffect(()=>{
    const motion=window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion=()=>setReducedMotion(motion.matches);
    const syncVisibility=()=>setVisible(document.visibilityState==="visible");
    syncMotion();syncVisibility();
    motion.addEventListener("change",syncMotion);document.addEventListener("visibilitychange",syncVisibility);
    return()=>{motion.removeEventListener("change",syncMotion);document.removeEventListener("visibilitychange",syncVisibility);};
  },[]);
  useEffect(()=>{
    if(!playing)return;
    const timer=window.setTimeout(()=>setActiveId(slides[nextSlide(index,1,slides.length)].id),interval);
    return()=>window.clearTimeout(timer);
  },[playing,index,interval,slides]);
  const go=(target:number)=>{
    setActiveId(slides[target].id);
    setAnnouncement(`Slajd ${target+1} z ${slides.length}: ${slides[target].title.replaceAll("|"," ")}`);
  };
  const move=(step:number)=>go(nextSlide(index,step,slides.length));
  const style={"--hero-height":num(s,"height",620)+"px","--hero-shade":Math.max(0,Math.min(95,num(s,"overlay",72)))/100,"--slide-duration":interval+"ms"} as CSSProperties;
  return <section className={"flagship-hero store-carousel hero-align-"+text(s,"alignment")} role="region" aria-roledescription="karuzela" aria-label="Kolekcje sklepu Zastal" tabIndex={0} style={style}
    onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
    onFocusCapture={()=>setFocused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setFocused(false);}}
    onKeyDown={event=>{const target=event.target as HTMLElement;const step=carouselKeyStep(event.key,target.tagName,target.isContentEditable);if(step&&slides.length>1&&!event.altKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();move(step);}}}
    onTouchStart={event=>{if(event.touches.length===1){const point=event.touches[0];touch.current={x:point.clientX,y:point.clientY};}else touch.current=null;}}
    onTouchCancel={()=>{touch.current=null;}}
    onTouchEnd={event=>{if(touch.current&&event.changedTouches.length===1){const point=event.changedTouches[0];const step=swipeDirection(touch.current.x,touch.current.y,point.clientX,point.clientY);if(step&&slides.length>1)move(step);}touch.current=null;}}>
    <div className="flagship-hero-topline"><span>ZASTAL / SKLEP KIBICA</span><span>ZIELONA GÓRA · OD 1946</span></div>
    <div className="flagship-slide" role="group" aria-roledescription="slajd" aria-label={`${index+1} z ${slides.length}`}>
      <div className="flagship-hero-content">
        <p className="flagship-overline"><span/>{slide.eyebrow}</p>
        <h1 id={headingId}>{titleLines(slide.title).map((line,i,lines)=><span key={i}>{line}{i<lines.length-1&&<br/>}</span>)}</h1>
        <p className="flagship-hero-lead">{slide.description}</p>
        <div className="flagship-hero-actions">
          {slide.cta_text&&<Link href={slide.cta_url} className="flagship-button-primary">{slide.cta_text} <ArrowUpRight size={18}/></Link>}
          {slide.secondary_text&&<Link href={slide.secondary_url} className="flagship-button-quiet">{slide.secondary_text} <ArrowRight size={17}/></Link>}
        </div>
        <span className="flagship-collection-note">{index===0?"KLUBOWA KOLEKCJA / ZASTAL STORE":slide.product_name||"KOLEKCJA SKLEPU"}</span>
      </div>
      <figure className={"flagship-hero-media media-"+slide.image_role}>
        <img key={slide.image} className="flagship-hero-photo" src={slide.image} alt={slide.image_alt} fetchPriority={index===0?"high":"auto"} decoding="async"/>
        {slide.image_role==="lifestyle"&&<span className="flagship-hero-shade" aria-hidden="true"/>}

      </figure>
    </div>
    <div className="flagship-hero-footer">
      {slides.length>1?<>
        <div className="flagship-slide-selector" aria-label="Wybór slajdu">{slides.map((item,i)=><button type="button" key={item.id} className={i===index?"active":""} aria-label={`Slajd ${i+1}: ${item.title.replaceAll("|"," ")}`} aria-current={i===index?"true":undefined} onClick={()=>go(i)}><span className="flagship-progress-track"><span key={`${activeId}-${playing}`} className={"flagship-progress-fill "+(i===index&&playing?"playing":"")}/></span></button>)}</div>
        <div className="flagship-carousel-controls"><span className="flagship-slide-count" aria-hidden="true">{String(index+1).padStart(2,"0")} <span>/ {String(slides.length).padStart(2,"0")}</span></span>
          <button type="button" aria-label="Poprzedni slajd" onClick={()=>move(-1)}><ChevronLeft size={19}/></button>
          <button type="button" aria-label="Następny slajd" onClick={()=>move(1)}><ChevronRight size={19}/></button>
          {s.autoplay!==false&&<button type="button" aria-label={paused?"Wznów automatyczne slajdy":"Wstrzymaj automatyczne slajdy"} aria-pressed={paused} onClick={()=>setPaused(value=>!value)}>{paused?<Play size={15}/>:<Pause size={15}/>}</button>}
        </div>
      </>:<span className="flagship-single-note">W BARWACH ZASTALU</span>}
    </div>
    <span className="flagship-sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
  </section>;
}
