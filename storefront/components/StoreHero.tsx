import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { fanPhoto } from "../lib/catalog";
import {titleLines,text,num,type SectionSettings} from "../lib/home-layout";

export default function StoreHero({settings}: {settings?:SectionSettings}) {
  const s=settings??{
    eyebrow:"KLUBOWA KOLEKCJA",title:"W barwach Zastalu.",
    description:"Koszulki, bluzy i dodatki dla kibiców z Zielonej Góry.",
    image:fanPhoto,cta_text:"Przejdź do sklepu",cta_url:"/sklep",
    secondary_text:"Zobacz koszulki",secondary_url:"/sklep?category=Koszulki",
    height:620,overlay:72,alignment:"left"
  };
  const opacity=Math.max(0,Math.min(95,num(s,"overlay",72)))/100;
  const style={
    "--hero-height":num(s,"height",620)+"px",
    "--hero-shade":opacity.toFixed(2)
  } as CSSProperties;
  const primary=text(s,"cta_url")||"/sklep";
  return <section className={"flagship-hero hero-align-"+text(s,"alignment")} aria-labelledby="flagship-hero-heading" style={style}>
    <img className="flagship-hero-photo" src={text(s,"image")||fanPhoto} alt="Kibice Zastalu Zielona Góra — zdjęcie kampanii sklepu" fetchPriority="high" decoding="async"/>
    <span className="flagship-hero-shade" aria-hidden="true"/>
    <div className="flagship-hero-topline"><span>ZASTAL ZIELONA GÓRA</span><span>SKLEP KIBICA / 1946</span></div>
    <div className="flagship-hero-content">
      <p className="flagship-overline"><span/>{text(s,"eyebrow")}</p>
      <h1 id="flagship-hero-heading">{titleLines(text(s,"title")).map((line,i)=><span key={i}>{line}{i<titleLines(text(s,"title")).length-1&&<br/>}</span>)}</h1>
      <p className="flagship-hero-lead">{text(s,"description")}</p>
      <div className="flagship-hero-actions">
        {text(s,"cta_text")&&<Link href={primary} className="flagship-button-primary">{text(s,"cta_text")} <ArrowUpRight size={18}/></Link>}
        {text(s,"secondary_text")&&<Link href={text(s,"secondary_url")||"/sklep"} className="flagship-button-quiet">{text(s,"secondary_text")} <ArrowRight size={17}/></Link>}
      </div>
    </div>
    <div className="flagship-hero-footer"><div><span className="flagship-pulse" aria-hidden="true"/> ZIELONA GÓRA / POLSKA</div><span>NA TRYBUNACH I POZA HALĄ</span></div>
  </section>;
}
