"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {ArrowLeft,ArrowRight,ArrowUpRight,Check,ChevronDown,Grid2X2,Heart,List,Menu,Search,ShoppingBag,SlidersHorizontal,X} from "lucide-react";
import {catalog,fmt,type CatalogItem} from "../../lib/catalog";
type Variant={size:string;stock:number};
type LiveItem={id:number;variants:Variant[]};
const categories=["Wszystko","Koszulki","Bluzy","Akcesoria","Dzieci"];
const sizes=["S","M","L","XL","XXL","116","128","140","152","164"];
export default function ShopClient(){
 const [category,setCategory]=useState("Wszystko");
 const [search,setSearch]=useState("");
 const [sort,setSort]=useState("popular");
 const [maxPrice,setMaxPrice]=useState(250);
 const [sizesSelected,setSizesSelected]=useState<string[]>([]);
 const [available,setAvailable]=useState(false);
 const [list,setList]=useState(false);
 const [drawer,setDrawer]=useState(false);
 const [live,setLive]=useState<Record<number,Variant[]>>({});
 const [favorites,setFavorites]=useState<number[]>([]);
 const [count,setCount]=useState(0);
 useEffect(()=>{
  const params=new URLSearchParams(location.search);
  const c=params.get("category");
  if(c&&categories.includes(c))setCategory(c);
  const q=params.get("q");if(q)setSearch(q.slice(0,100));
  try{const arr=JSON.parse(localStorage.getItem("zastal_store_cart_v2")||"[]");setCount(arr.reduce((a:number,b:{quantity:number})=>a+b.quantity,0))}catch{}
  try{setFavorites(JSON.parse(localStorage.getItem("zastal_store_favs")||"[]"))}catch{}
  fetch("/api/catalog").then(r=>r.json()).then((arr:LiveItem[])=>setLive(Object.fromEntries(arr.map(x=>[x.id,x.variants])))).catch(()=>{});
 },[]);
 const switchCategory=(c:string)=>{
  setCategory(c);setDrawer(false);
  const u=new URL(window.location.href);if(c==="Wszystko")u.searchParams.delete("category");else u.searchParams.set("category",c);
  history.replaceState(null,"",u.toString());
 };
 const results=useMemo(()=>{
  let items=catalog.filter(p=>{
   const variants=live[p.id]||[];
   const total=variants.length?variants.reduce((a,b)=>a+b.stock,0):p.stock;
   const isMatch=!search.trim()||[p.name,p.category,p.subtitle,p.sku].join(" ").toLowerCase().includes(search.trim().toLowerCase());
   const sizeMatch=!sizesSelected.length||sizesSelected.some(s=>variants.some(v=>v.size===s&&v.stock>0));
   return isMatch&&(category==="Wszystko"||p.category===category)&&p.price<=maxPrice*100&&(!available||total>0)&&sizeMatch;
  });
  if(sort==="low")items=[...items].sort((a,b)=>a.price-b.price);
  if(sort==="high")items=[...items].sort((a,b)=>b.price-a.price);
  if(sort==="alpha")items=[...items].sort((a,b)=>a.name.localeCompare(b.name,"pl"));
  return items;
 },[category,search,sort,maxPrice,sizesSelected,available,live]);
 const toggleFavorite=(id:number)=>{
  let next=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];
  setFavorites(next);localStorage.setItem("zastal_store_favs",JSON.stringify(next));
 };
 const reset=()=>{switchCategory("Wszystko");setSearch("");setMaxPrice(250);setAvailable(false);setSizesSelected([])};
 const toggleSize=(s:string)=>setSizesSelected(v=>v.includes(s)?v.filter(x=>x!==s):[...v,s]);
 const filters=<div className="shop-filter-content">
   <div className="shop-filter-group"><div className="shop-filter-title">KATEGORIE</div>{categories.map(c=><button key={c} className={"shop-filter-category "+(category===c?"on":"")} onClick={()=>switchCategory(c)}><span>{c}</span><span>{c==="Wszystko"?catalog.length:catalog.filter(p=>p.category===c).length}</span></button>)}</div>
   <div className="shop-filter-group"><div className="shop-filter-title">ROZMIARY</div><div className="shop-filter-sizes">{sizes.map(s=><button key={s} onClick={()=>toggleSize(s)} className={sizesSelected.includes(s)?"on":""}>{s}</button>)}</div></div>
   <div className="shop-filter-group"><div className="shop-filter-title">CENA MAKSYMALNA <span>{maxPrice} ZŁ</span></div><input type="range" min="25" max="250" step="5" value={maxPrice} onChange={e=>setMaxPrice(Number(e.target.value))} aria-label="Cena maksymalna"/><div className="shop-price-ends"><span>25 ZŁ</span><span>250 ZŁ</span></div></div>
   <div className="shop-filter-group"><label className="shop-checkbox"><input type="checkbox" checked={available} onChange={e=>setAvailable(e.target.checked)}/><span>Tylko dostępne</span></label></div>
   <button className="shop-reset" onClick={reset}>WYCZYŚĆ FILTRY <X size={15}/></button>
 </div>;
 return <div className="shop-shell">
  <div className="shop-notice">ZASTAL STORE / SKLEP DEMONSTRACYJNY — BRAK REALNYCH PŁATNOŚCI</div>
  <header className="shop-header"><Link href="/" className="shop-brand"><img src="/assets/zastal-logo.svg" alt="Zastal Zielona Góra"/><span>FAN STORE<small>DEMO 2026</small></span></Link><nav><Link href="/">STRONA GŁÓWNA</Link><Link href="/sklep">WSZYSTKIE PRODUKTY</Link><Link href="/#heritage">HERITAGE</Link></nav><div className="shop-header-right"><Link href="/?cart=1"><ShoppingBag size={20}/><span>{count}</span></Link></div></header>
  <section className="shop-hero"><div><span className="shop-hero-kicker">ZASTAL / THE GREEN CULTURE / STORE 2026</span><h1>W TWOICH<br/><em>BARWACH.</em></h1><p>Znajdź swoją ulubioną rzecz. Produkty, które łączą nas z Zieloną Górą.</p><div className="shop-hero-foot"><span>KOLEKCJA KLUBOWA</span><span>1946 — DZIŚ</span></div></div><span className="shop-hero-ghost" aria-hidden="true">Z.</span></section>
  <main className="shop-main"><div className="shop-breadcrumb"><Link href="/">HOME</Link><span>/</span><b>SKLEP</b></div><div className="shop-heading"><div><span>01 / SHOP ALL</span><h2>ODKRYJ KOLEKCJĘ<span>.</span></h2></div><p>Wybrane produkty z obecnego sklepu Zastalu.<br/>Stany i zamówienia — środowisko testowe.</p></div>
  <div className="shop-layout"><aside className="shop-sidebar"><div className="shop-sidebar-heading"><SlidersHorizontal size={19}/> FILTRUJ PRODUKTY</div>{filters}</aside>
   <section className="shop-results"><div className="shop-toolbar"><div><button className="shop-mobile-filter" onClick={()=>setDrawer(true)}><SlidersHorizontal size={17}/> FILTRY</button><span>{results.length} PRODUKTÓW</span>{category!=="Wszystko"&&<button className="shop-chip" onClick={()=>switchCategory("Wszystko")}>{category} <X size={12}/></button>}</div><div className="shop-sort"><select aria-label="Sortowanie" value={sort} onChange={e=>setSort(e.target.value)}><option value="popular">POLECANE</option><option value="low">CENA ROSNĄCO</option><option value="high">CENA MALEJĄCO</option><option value="alpha">NAZWA A–Z</option></select><ChevronDown size={14}/><button aria-label="Widok siatki" className={!list?"on":""} onClick={()=>setList(false)}><Grid2X2 size={18}/></button><button aria-label="Widok listy" className={list?"on":""} onClick={()=>setList(true)}><List size={19}/></button></div></div>
   {results.length?<div className={"shop-products "+(list?"list-view":"")}>{results.map(p=><article className="shop-card" key={p.id}><Link href={"/produkt/"+p.id} className="shop-card-image"><img src={p.image} alt={p.name} loading="lazy"/>{p.tag&&<span className="shop-card-tag">{p.tag}</span>}<span className="shop-visual-action">ZOBACZ PRODUKT <ArrowUpRight size={16}/></span></Link><button className={"shop-heart "+(favorites.includes(p.id)?"on":"")} onClick={()=>toggleFavorite(p.id)} aria-label="Ulubione"><Heart size={19} fill={favorites.includes(p.id)?"currentColor":"none"}/></button><div className="shop-card-meta"><span>{p.category.toUpperCase()}</span><span>{(live[p.id]||[]).reduce((a,b)=>a+b.stock,0)||p.stock} SZT. W DEMO</span></div><Link href={"/produkt/"+p.id} className="shop-card-name">{p.name}</Link><p>{p.subtitle}</p><div className="shop-card-bottom"><b>{fmt(p.price)}</b><Link href={"/produkt/"+p.id}>WYBIERZ OPCJE <ArrowRight size={15}/></Link></div></article>)}</div>:<div className="shop-no-results"><Search size={28}/><h3>Brak produktów</h3><p>Zmień filtry albo wyczyść wyszukiwanie.</p><button onClick={reset}>POKAŻ WSZYSTKIE <ArrowRight size={16}/></button></div>}
   </section></div>
  <section className="shop-bottom"><div><span>GREEN CULTURE / 1946</span><h2>ZIELONA GÓRA.<br/>JEDNA <em>DRUŻYNA.</em></h2></div><Link href="/">ODKRYJ HISTORIĘ <ArrowUpRight size={19}/></Link></section></main>
  <footer className="shop-footer"><b>ZASTAL<span>.</span></b><p>WERSJA DEMONSTRACYJNA / 2026</p><Link href="/admin">CENTRUM ZARZĄDZANIA <ArrowRight size={15}/></Link></footer>
  {drawer&&<div className="shop-filter-overlay" onClick={()=>setDrawer(false)}><div className="shop-mobile-panel" onClick={e=>e.stopPropagation()}><div><strong>FILTRY</strong><button onClick={()=>setDrawer(false)}><X/></button></div>{filters}<button className="shop-apply" onClick={()=>setDrawer(false)}>POKAŻ {results.length} PRODUKTÓW <Check size={18}/></button></div></div>}
 </div>;
}
