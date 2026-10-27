"use client";
import {useMemo,useState} from "react";
import {ArrowDown,ArrowUp,Plus,Search,X} from "lucide-react";
import {productImages} from "../../lib/product-media.mjs";
import {categories} from "../../lib/home-layout";
import {fmt} from "../../lib/catalog";

type Item={id:number;name:string;category?:string;price?:number};
const thumb=(p:Item)=>productImages(p as never)[0]?.url||"";
const move=<T,>(list:T[],i:number,by:number)=>{const next=[...list],j=i+by;if(j<0||j>=next.length)return next;[next[i],next[j]]=[next[j],next[i]];return next};

/** Ordered product list stored as "1,3,6" — thumbnails, search, reorder. */
export function ProductPicker({label,hint,value,products,onChange}:{label:string;hint?:string;value:string;products:Item[];onChange:(value:string)=>void}){
 const ids=value.split(",").map(x=>Number(x.trim())).filter(Boolean);
 const [query,setQuery]=useState("");
 const byId=useMemo(()=>new Map(products.map(p=>[p.id,p])),[products]);
 const q=query.trim().toLowerCase();
 const matches=q?products.filter(p=>!ids.includes(p.id)&&(p.name.toLowerCase().includes(q)||String(p.id)===q)).slice(0,6):[];
 const set=(next:number[])=>onChange(next.join(","));
 return <div className="home-edit-field home-picker"><span>{label}</span>
  {ids.length?<ol className="home-picker-list">{ids.map((id,i)=>{const p=byId.get(id);return <li key={id}>
   <span className="home-picker-thumb">{p&&thumb(p)?<img src={thumb(p)} alt=""/>:null}</span>
   <span className="home-picker-name"><strong>{p?.name||"Produkt #"+id+" (niedostępny)"}</strong>{p&&<small>{p.category}{p.price?" · "+fmt(p.price):""}</small>}</span>
   <span className="home-picker-actions"><button type="button" aria-label="Wyżej" disabled={i===0} onClick={()=>set(move(ids,i,-1))}><ArrowUp size={14}/></button><button type="button" aria-label="Niżej" disabled={i===ids.length-1} onClick={()=>set(move(ids,i,1))}><ArrowDown size={14}/></button><button type="button" aria-label={"Usuń "+(p?.name||id)} onClick={()=>set(ids.filter(x=>x!==id))}><X size={14}/></button></span>
  </li>})}</ol>:<small>Nie wybrano produktów — sekcja pokazuje produkty z katalogu.</small>}
  <div className="home-picker-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Szukaj produktu do dodania" aria-label="Szukaj produktu do dodania"/></div>
  {matches.length>0&&<ul className="home-picker-results">{matches.map(p=><li key={p.id}><button type="button" onClick={()=>{set([...ids,p.id]);setQuery("")}}><span className="home-picker-thumb">{thumb(p)?<img src={thumb(p)} alt=""/>:null}</span><span className="home-picker-name"><strong>{p.name}</strong><small>{p.category}</small></span><Plus size={15}/></button></li>)}</ul>}
  {q&&!matches.length&&<small>Brak pasujących produktów.</small>}
  {hint&&<small>{hint}</small>}
 </div>;
}

/** Ordered category list stored as "Koszulki,Bluzy". */
export function CategoryPicker({label,hint,value,onChange}:{label:string;hint?:string;value:string;onChange:(value:string)=>void}){
 const chosen=value.split(",").map(x=>x.trim()).filter(Boolean);
 const free=categories.filter(c=>c!=="Wszystko"&&!chosen.includes(c));
 const set=(next:string[])=>onChange(next.join(","));
 return <div className="home-edit-field home-picker"><span>{label}</span>
  <ol className="home-picker-list">{chosen.map((c,i)=><li key={c}><span className="home-picker-name"><strong>{c}</strong></span><span className="home-picker-actions"><button type="button" aria-label="Wyżej" disabled={i===0} onClick={()=>set(move(chosen,i,-1))}><ArrowUp size={14}/></button><button type="button" aria-label="Niżej" disabled={i===chosen.length-1} onClick={()=>set(move(chosen,i,1))}><ArrowDown size={14}/></button><button type="button" aria-label={"Usuń "+c} onClick={()=>set(chosen.filter(x=>x!==c))}><X size={14}/></button></span></li>)}</ol>
  {free.length>0&&<div className="home-picker-chips">{free.map(c=><button type="button" key={c} onClick={()=>set([...chosen,c])}><Plus size={13}/>{c}</button>)}</div>}
  {hint&&<small>{hint}</small>}
 </div>;
}
