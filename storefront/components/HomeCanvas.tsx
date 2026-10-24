"use client";
import {useState} from "react";
import Link from "next/link";
import {ArrowRight,ArrowUpRight,PackageCheck,Ruler,UserRound} from "lucide-react";
import ProductCard,{ProductImage} from "./ProductCard";
import CampaignSection from "./CampaignSection";
import StoreHero from "./StoreHero";
import {useStore} from "./StoreProvider";

import {type HomeConfig,type HomeSection,categories,text,num,bool,titleLines,kicker} from "../lib/home-layout";
import {PenLine,UserRound as Roster} from "lucide-react";

const categoryDescriptions:Record<string,string>={
 Koszulki:"Modele klubowe",Bluzy:"Klasyczne i z kapturem",
 Dzieci:"Małe rozmiary, duże emocje",Akcesoria:"Dodatki na co dzień"
};
const categoryCovers:Record<string,number>={Koszulki:10,Bluzy:1,Dzieci:9,Akcesoria:8};
const categoryClasses:Record<string,string>={Koszulki:"shirts",Bluzy:"hoodies",Dzieci:"kids",Akcesoria:"accessories"};
const categoryLabels:Record<string,string>={Dzieci:"Dla dzieci"};

// Catalogue sections (categories, products, personalization, accessories) never show a kicker: the heading is enough.
function Block({section}:{section:HomeSection}){
 const {products}=useStore();
 const [filter,setFilter]=useState<string|null>(null);
 const s=section.settings,kind=section.type;
 const title=text(s,"title");
 const sectionTitle=titleLines(title);
 const active=filter??(text(s,"category")||"Wszystko");
 const links=(x:string)=>"/sklep?category="+encodeURIComponent(x);
 const chosen=products.find(p=>p.id===num(s,"product_id"));
 if(kind==="campaign")return <CampaignSection section={section}/>;
 if(kind==="hero")return <StoreHero settings={s}/>;
 if(kind==="categories"){
  const cats=text(s,"categories").split(",").map(x=>x.trim()).filter(Boolean);
  return <section className="container home-collections" aria-labelledby={section.id}>
   <div className="home-section-heading"><div><h2 id={section.id}>{title}</h2></div>
   <Link className="home-text-link" href="/sklep">{text(s,"cta_text")} <ArrowUpRight size={17}/></Link></div>
   <div className={"home-collection-grid cms-cols-"+num(s,"columns",4)}>
   {cats.map(category=>{
    const cover=products.find(p=>p.id===categoryCovers[category])||products.find(p=>p.category===category);
    return <Link className={"home-collection collection-"+(categoryClasses[category]||"shirts")} key={category} href={links(category)}>
     <div className="home-collection-image">{cover&&<ProductImage product={cover}/>}</div>
     <div className="home-collection-label"><div><h3>{categoryLabels[category]||category}</h3><span>{categoryDescriptions[category]||"Zobacz kolekcję"}</span></div><ArrowUpRight size={21}/></div>
    </Link>;
   })}</div>
  </section>;
 }
 if(kind==="products"){
  const selected=products.filter(p=>active==="Wszystko"||p.category===active);
  const picks=text(s,"product_ids").split(",").map(x=>Number(x.trim())).filter(Boolean);
  const sorted=picks.length?[
    ...picks.map(id=>selected.find(p=>p.id===id)).filter((p):p is typeof selected[number]=>Boolean(p)),
    ...selected.filter(p=>!picks.includes(p.id))
  ]:selected;
  return <section className="container merchandise-catalog" aria-labelledby={section.id}>
   <div className="home-section-heading"><div><h2 id={section.id}>{title}</h2></div>
   <Link className="home-text-link" href="/sklep">{text(s,"cta_text")} <ArrowRight size={17}/></Link></div>
   {bool(s,"show_filters")&&<div className="collection-tabs" aria-label="Filtruj produkty">{categories.map(x=><button key={x} className={x===active?"active":""} aria-pressed={x===active} onClick={()=>setFilter(x)}>{categoryLabels[x]||x}<span>{x==="Wszystko"?products.length:products.filter(p=>p.category===x).length}</span></button>)}</div>}
   <div className={"product-grid merchandise-grid cms-cols-"+num(s,"columns",4)}>
    {sorted.slice(0,num(s,"count",8)).map((p,i)=><ProductCard key={p.id} product={p} eager={i<4}/>)}
   </div>
   {!sorted.length&&<p className="account-empty">Brak produktów w wybranej kategorii.</p>}
   <div className="home-catalog-link"><Link href={active==="Wszystko"?"/sklep":links(active)}>Zobacz wszystkie produkty <ArrowUpRight size={17}/></Link></div>
  </section>;
 }
 if(kind==="personalization"){
  if(!chosen||!chosen.personalization_enabled)return null;
  return <section className="editorial-print" aria-labelledby={section.id}>
   <div className="editorial-print-copy">
    <div className="editorial-print-body">
     <h2 id={section.id}>{sectionTitle.map((line,i)=><span key={i}>{line}{i<sectionTitle.length-1&&<br/>}</span>)}</h2>
     <p>{text(s,"description")}</p><div className="editorial-print-choices"><span><Roster size={17} strokeWidth={1.8}/> Zawodnik z listy</span><span><PenLine size={17} strokeWidth={1.8}/> Własny napis i numer</span></div>
     <Link className="editorial-print-action" href={"/produkt/"+chosen.id}>{text(s,"button_text")} <ArrowUpRight size={18}/></Link>
    </div>
   </div>
   <Link href={"/produkt/"+chosen.id} className="editorial-print-visual"><ProductImage product={chosen}/><div className="editorial-print-product-label"><div><span>Produkt z nadrukiem</span><strong>{chosen.name}</strong></div></div></Link>
  </section>;
 }
 if(kind==="retro"){
  if(!chosen)return null;
  const image=text(s,"image");
  return <section className="container home-retro" aria-labelledby={section.id}>
   <div className="home-retro-photo">{image?<img src={image} alt={chosen.name}/>:<ProductImage product={chosen}/>}</div>
   <div className="home-retro-copy">{kicker(text(s,"eyebrow"))&&<span className="home-kicker">{kicker(text(s,"eyebrow"))}</span>}<h2 id={section.id}>{sectionTitle.map((line,i)=><span key={i}>{line}{i<sectionTitle.length-1&&<br/>}</span>)}</h2><p>{text(s,"description")}</p>
   <Link href={"/produkt/"+chosen.id} className="button button-dark">{text(s,"button_text")} <ArrowUpRight size={18}/></Link></div>
  </section>;
 }
 if(kind==="accessories"){
  const chosenItems=products.filter(p=>p.category==="Akcesoria").slice(0,num(s,"count",3));
  if(!chosenItems.length)return null;
  return <section className="container editorial-accessories" aria-labelledby={section.id}>
   <div className="editorial-accessories-heading"><div><h2 id={section.id}>{sectionTitle.map((line,i)=><span key={i}>{line}{i<sectionTitle.length-1&&<br/>}</span>)}</h2></div>
    <div className="editorial-accessories-intro"><p>{text(s,"description")}</p><Link href={links("Akcesoria")}>Zobacz akcesoria <ArrowUpRight size={17}/></Link></div></div>
   <div className="editorial-accessories-grid">{chosenItems.map((p,i)=><Link key={p.id} href={"/produkt/"+p.id} className={"editorial-accessory accessory-"+i}><div className="editorial-accessory-image"><ProductImage product={p}/></div><div className="editorial-accessory-info"><div><span>Akcesoria</span><h3>{p.name}</h3></div><ChevronRightIcon/></div></Link>)}</div>
  </section>;
 }
 if(kind==="banner")return <section className={"container cms-campaign align-"+text(s,"alignment")} style={{backgroundColor:text(s,"background"),color:text(s,"text_color")}} aria-labelledby={section.id}>
  {text(s,"image")&&<img src={text(s,"image")} alt="" className="cms-campaign-image"/>}<div className="cms-campaign-shade"/>
  <div className="cms-campaign-content">{kicker(text(s,"eyebrow"))&&<span className="home-kicker">{kicker(text(s,"eyebrow"))}</span>}<h2 id={section.id}>{sectionTitle.map((line,i)=><span key={i}>{line}{i<sectionTitle.length-1&&<br/>}</span>)}</h2><p>{text(s,"description")}</p>
  {text(s,"cta_text")&&<Link href={text(s,"cta_url")||"/sklep"}>{text(s,"cta_text")} <ArrowUpRight size={18}/></Link>}</div></section>;
 if(kind==="text")return <section className={"container cms-editorial-text align-"+text(s,"alignment")} style={{backgroundColor:text(s,"background"),color:text(s,"text_color")}} aria-labelledby={section.id}>{kicker(text(s,"eyebrow"))&&<span className="home-kicker">{kicker(text(s,"eyebrow"))}</span>}<h2 id={section.id}>{sectionTitle.map((line,i)=><span key={i}>{line}{i<sectionTitle.length-1&&<br/>}</span>)}</h2><p>{text(s,"description")}</p></section>;
 if(kind==="services"){
  const blocks=[
   {title:text(s,"first_title"),description:text(s,"first_text"),href:"/pomoc#dostawa",icon:<PackageCheck size={25} strokeWidth={1.4}/>},
   {title:text(s,"second_title"),description:text(s,"second_text"),href:"/konto",icon:<UserRound size={25} strokeWidth={1.4}/>},
   {title:text(s,"third_title"),description:text(s,"third_text"),href:"/pomoc#rozmiary",icon:<Ruler size={25} strokeWidth={1.4}/>}
  ];
  return <section className="container home-service-links" aria-label={text(s,"title")}>{blocks.map((entry,i)=><Link key={i} href={entry.href}>{entry.icon}<div><strong>{entry.title}</strong><span>{entry.description}</span></div><ArrowUpRight size={17}/></Link>)}</section>;
 }
 return null;
}
function ChevronRightIcon(){return <ArrowUpRight size={17}/>;}
export default function HomeCanvas({config}:{config:HomeConfig}){
 return <div className="home-page cms-home">
  {config.sections.filter(section=>section.enabled).map(section=><Block key={section.id} section={section}/>)}
 </div>;
}
