"use client";
import Link from "next/link";
import {ArrowUpRight} from "lucide-react";
import {useStore} from "./StoreProvider";
import ProductCard from "./ProductCard";
import {type HomeSection,text,bool,kicker} from "../lib/home-layout";
import {campaignReady} from "../lib/product-media.mjs";
export default function CampaignSection({section}:{section:HomeSection}){
 const {products}=useStore(),s=section.settings;
 if(!campaignReady(s,products))return null;
 const ids=text(s,"product_ids").split(",").map(Number);
 const associated=ids.map(id=>products.find(p=>p.id===id)).filter((p):p is typeof products[number]=>!!p);
 return <section className={"container product-campaign align-"+text(s,"alignment")} aria-labelledby={section.id}>
  <figure className="product-campaign-visual"><img src={text(s,"image")} alt={text(s,"image_alt")} loading="lazy" onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src="/assets/product-unavailable.svg";e.currentTarget.alt="Zdjęcie kampanii niedostępne";}}/></figure>
  <div className="product-campaign-copy">{kicker(text(s,"eyebrow"))&&<span className="home-kicker">{kicker(text(s,"eyebrow"))}</span>}<h2 id={section.id}>{text(s,"title")}</h2><p>{text(s,"description")}</p>{text(s,"cta_text")&&<Link className="home-text-link" href={text(s,"cta_url")||"/sklep"}>{text(s,"cta_text")} <ArrowUpRight size={18}/></Link>}<div className="product-campaign-products">{associated.map(p=><ProductCard key={p.id} product={p}/>)}</div></div>
 </section>;
}
