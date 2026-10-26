import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import ProductDetail from "./ProductDetail";
import "./product.css";
import { catalog } from "../../../lib/catalog";
import { publicCatalog, storeStatus } from "../../../lib/store-status";

import { productUrl, categoryUrl } from "../../../lib/urls.mjs";

const API = process.env.ZASTAL_CMS_API || "http://127.0.0.1:8880";
const ORIGIN = process.env.ZASTAL_SITE_ORIGIN || "https://zastalstore.51-15-21-164.sslip.io";
type LiveProduct = { id: number; slug?: string; name: string; sku: string; category: string; price: number; subtitle?: string; description?: string; image?: string; images?: { url: string }[]; preorder?: boolean; variants?: { stock: number }[] };

/** Current catalogue entry from the API; falls back to the static catalogue when the API is unreachable. */
async function liveProduct(id: number): Promise<LiveProduct | null> {
  try {
    const response = await fetch(`${API}/api/catalog/${id}`, { cache: "no-store", signal: AbortSignal.timeout(2500) });
    if (response.ok) return await response.json();
  } catch {}
  const item = catalog.find(x => x.id === id);
  return item ? { ...item, variants: [] } : null;
}
async function resolveProduct(value:string):Promise<LiveProduct|null> {
 const products=await publicCatalog();
 const entry=/^[1-9][0-9]*$/.test(value)?products.find(p=>p.id===Number(value)):products.find(p=>p.slug===value);
 if(entry)return {...await liveProduct(entry.id),...entry} as LiveProduct;
 return /^[1-9][0-9]*$/.test(value)?liveProduct(Number(value)):null;
}
const absolute = (path: string) => { try { return new URL(path, ORIGIN).toString(); } catch { return path; } };
const firstParagraph = (text: string) => (text || "").split("\n").map(line => line.trim()).find(line => line && !line.startsWith("#") && !line.startsWith("-")) || "";

export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
 const {id}=await params;
 const item=await resolveProduct(id);
 if(!item)return {title:"Produkt",description:"Odzież i akcesoria Zastalu Zielona Góra"};
 const image=item.images?.[0]?.url||item.image||"";
 const description=[firstParagraph(item.description||"")||item.subtitle,"Oficjalny sklep Zastalu Zielona Góra."].filter(Boolean).join(" ");
 return {title:item.name,description,alternates:{canonical:absolute(productUrl(item))},openGraph:{title:item.name,description,type:"website",images:image?[absolute(image)]:[]}};
}

export default async function ProductPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {id}=await params;
 const [item,status]=await Promise.all([resolveProduct(id),storeStatus()]);
 if(!item)notFound();
 const productId=item.id;
 if(item.slug && id!==item.slug){
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries(await searchParams)){if(Array.isArray(value))value.forEach(v=>query.append(key,v));else if(value!==undefined)query.set(key,value);}
  permanentRedirect(productUrl(item)+(query.size?"?"+query.toString():""));
 }
 const jsonLd=item?[
  {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
   {"@type":"ListItem",position:1,name:"Sklep",item:absolute("/sklep")},
   {"@type":"ListItem",position:2,name:item.category,item:absolute(categoryUrl(item.category))},
   {"@type":"ListItem",position:3,name:item.name,item:absolute(productUrl(item))}]},
  {"@context":"https://schema.org","@type":"Product",name:item.name,sku:item.sku,category:item.category,
   description:firstParagraph(item.description||"")||item.subtitle||undefined,
   image:(item.images?.length?item.images.map(img=>absolute(img.url)):item.image?[absolute(item.image)]:undefined),
   brand:{"@type":"Brand",name:"Zastal Zielona Góra"},
   // Offers only while online sales are open: no price claims before launch.
   ...(status.live&&Number.isSafeInteger(item.price)&&item.price>0?{offers:{"@type":"Offer",url:absolute(productUrl(item)),priceCurrency:"PLN",price:(item.price/100).toFixed(2),itemCondition:"https://schema.org/NewCondition",
     availability:item.preorder?"https://schema.org/PreOrder":(item.variants||[]).some(v=>v.stock>0)?"https://schema.org/InStock":"https://schema.org/OutOfStock"}}:{})}
 ]:null;
 return <>
  {jsonLd&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd).replace(/</g,"\\u003c")}}/>}
  <ProductDetail key={productId} productId={productId}/>
 </>;
}
