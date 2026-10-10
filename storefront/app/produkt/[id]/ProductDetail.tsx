"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {ArrowLeft,ArrowRight,ArrowUpRight,Check,ChevronDown,Heart,Minus,Plus,Ruler,ShieldCheck,ShoppingBag,Truck,X,ZoomIn} from "lucide-react";
import {catalog,fmt,type CatalogItem} from "../../../lib/catalog";
type Variant={id:number;size:string;sku:string;ean:string;stock:number};
type CartLine={id:number;size:string;quantity:number};
const KEY="zastal_store_cart_v2";
export default function ProductDetail({item}:{item:CatalogItem}){
 const [variants,setVariants]=useState<Variant[]>([]);
 const [size,setSize]=useState("");
 const [qty,setQty]=useState(1);
 const [showSize,setShowSize]=useState(false);
 const [zoom,setZoom]=useState(false);
 const [added,setAdded]=useState(false);
 const [error,setError]=useState("");
 const [activeInfo,setActiveInfo]=useState("details");
 const [cartCount,setCartCount]=useState(0);
 const [favorite,setFavorite]=useState(false);
 const recommendations=useMemo(()=>catalog.filter(p=>p.id!==item.id&&(p.category===item.category||p.category==="Akcesoria")).slice(0,4),[item.id,item.category]);
 useEffect(()=>{
  let mounted=true;
  fetch("/api/catalog/"+item.id).then(r=>r.json()).then(d=>{if(mounted)setVariants(d?.variants||[])}).catch(()=>{});
  try{setCartCount((JSON.parse(localStorage.getItem(KEY)||"[]") as CartLine[]).reduce((a,b)=>a+b.quantity,0))}catch{}
  try{setFavorite((JSON.parse(localStorage.getItem("zastal_store_favs")||"[]") as number[]).includes(item.id))}catch{}
  return ()=>{mounted=false};
 },[item.id]);
 const selected=variants.find(v=>v.size===(item.sizes?size:"UNI"));
 const remaining=selected?.stock??0;
 const toggleFavorite=()=>{
  let arr:number[]=[];try{arr=JSON.parse(localStorage.getItem("zastal_store_favs")||"[]")}catch{}
  const next=arr.includes(item.id)?arr.filter(x=>x!==item.id):[...arr,item.id];
  localStorage.setItem("zastal_store_favs",JSON.stringify(next));setFavorite(next.includes(item.id));
 };
 const add=()=>{
  if(item.sizes&&!size){setError("Wybierz rozmiar, aby kontynuować.");return}
  if(!selected){setError("Ładowanie stanu magazynowego. Spróbuj ponownie.");return}
  let lines:CartLine[]=[];
  try{lines=JSON.parse(localStorage.getItem(KEY)||"[]")}catch{}
  const exists=lines.find(x=>x.id===item.id&&x.size===(item.sizes?size:""));
  const existing=exists?.quantity||0;
  if(existing+qty>remaining){setError("Brak wystarczającego stanu w rozmiarze "+(size||"UNI"));return}
  const targetSize=item.sizes?size:"";
  if(exists)lines=lines.map(x=>x===exists?{...x,quantity:x.quantity+qty}:x);
  else lines.push({id:item.id,size:targetSize,quantity:qty});
  localStorage.setItem(KEY,JSON.stringify(lines));setCartCount(lines.reduce((a,b)=>a+b.quantity,0));setAdded(true);setError("");
 };
 const availableSizes=item.sizes||["UNI"];
 return <div className="pdp-shell">
  <div className="pdp-announcement">ZASTAL STORE / WERSJA DEMONSTRACYJNA — ZAMÓWIENIA TESTOWE</div>
  <header className="pdp-header"><Link href="/" className="pdp-logo"><img src="/assets/zastal-logo.svg" alt="Zastal Zielona Góra"/><small>FAN STORE</small></Link><nav><Link href="/#kolekcja">KOLEKCJE</Link><Link href="/#products">ODZIEŻ</Link><Link href="/#heritage">HERITAGE</Link></nav><div className="pdp-header-actions"><Link href="/#products"><ArrowLeft size={17}/> DO SKLEPU</Link><Link href="/?cart=1" className="pdp-bag"><ShoppingBag size={20}/><span>{cartCount}</span></Link></div></header>
  <main className="pdp-main"><div className="pdp-breadcrumb"><Link href="/">STRONA GŁÓWNA</Link><span>/</span><Link href="/#products">{item.category.toUpperCase()}</Link><span>/</span><strong>{item.name.toUpperCase()}</strong></div>
  <div className="pdp-grid"><section className="pdp-gallery"><div className="pdp-main-image"><img src={item.image} alt={item.name}/><div className="pdp-image-code">ZASTAL / {item.sku}</div><button className="pdp-zoom" onClick={()=>setZoom(true)} aria-label="Powiększ zdjęcie"><ZoomIn size={20}/></button></div><div className="pdp-gallery-foot"><div><span>01</span><strong>ORYGINALNE ZDJĘCIE PRODUKTU</strong></div><p>Materiały produktowe z obecnego sklepu Zastalu.</p></div></section>
   <section className="pdp-details"><div className="pdp-kicker"><span>KOLEKCJA ZASTAL</span><span> / </span><span>{item.category.toUpperCase()}</span></div><h1>{item.name}</h1><p className="pdp-lead">{item.subtitle}</p><div className="pdp-price">{fmt(item.price)}<span>CENA DEMONSTRACYJNA</span></div><div className="pdp-separator"/>
    {item.sizes&&<><div className="pdp-size-header"><strong>WYBIERZ ROZMIAR</strong><button onClick={()=>setShowSize(true)}><Ruler size={16}/> TABELA ROZMIARÓW</button></div><div className="pdp-sizes">{availableSizes.map(s=>{const v=variants.find(v=>v.size===s);return <button key={s} className={size===s?"chosen":""} disabled={Boolean(v&&v.stock===0)} onClick={()=>{setSize(s);setQty(1);setError("")}}>{s}{v?.stock===0&&<span>×</span>}</button>})}</div></>}
    <div className="pdp-stock"><span className={remaining>0&&selected?"pdp-green-dot":"pdp-neutral-dot"}/>{selected?(remaining>0?("DOSTĘPNE W MAGAZYNIE DEMO — "+remaining+" SZT."): "NIEDOSTĘPNE W DEMO"):"WYBIERZ WARIANT, ABY SPRAWDZIĆ STAN"}</div>
    <div className="pdp-actions"><div className="pdp-quantity"><button onClick={()=>setQty(v=>Math.max(1,v-1))} aria-label="Zmniejsz ilość"><Minus size={16}/></button><span>{qty}</span><button onClick={()=>setQty(v=>Math.min(20,v+1))} aria-label="Zwiększ ilość"><Plus size={16}/></button></div><button className="pdp-add" onClick={add}>DODAJ DO KOSZYKA <ShoppingBag size={20}/></button><button className={"pdp-fav "+(favorite?"on":"")} aria-label="Dodaj do ulubionych" onClick={toggleFavorite}><Heart size={20} fill={favorite?"currentColor":"none"}/></button></div>
    {error&&<p className="pdp-error">{error}</p>}
    <div className="pdp-perks"><div><Truck size={22}/><span><b>DOSTAWA I ODBIÓR</b><small>Funkcje zostaną podłączone w wersji produkcyjnej</small></span></div><div><ShieldCheck size={22}/><span><b>PROCES ZAKUPU DEMO</b><small>Żadne rzeczywiste środki nie są pobierane</small></span></div></div>
    <div className="pdp-accordions">{[["details","OPIS PRODUKTU",<p key="a">{item.name} — {item.subtitle}. Produkt należy do kolekcji klubowego merchandisingu Zastal Zielona Góra. Zdjęcie przedstawia produkt z obecnego sklepu. Skład materiału oraz szczegółowe wymiary wymagają potwierdzenia przez klub.</p>],["size","ROZMIARY I DOPASOWANIE",<p key="b">Przed zakupem sprawdź tabelę rozmiarów producenta. Dane wymiarowe będą uzupełnione po uzyskaniu specyfikacji produktów.</p>],["delivery","DOSTAWA I ZWROTY",<p key="c">Wersja demonstracyjna nie realizuje dostaw i nie pobiera płatności. Warunki zwrotów i realizacji zostaną opublikowane przed uruchomieniem sprzedaży.</p>]].map(([k,t,v])=><div className="pdp-accordion" key={k as string}><button onClick={()=>setActiveInfo(activeInfo===k?"":k as string)}>{t}<ChevronDown size={18} className={activeInfo===k?"rotated":""}/></button>{activeInfo===k&&<div className="pdp-accordion-body">{v}</div>}</div>)}</div>
   </section></div>
   <div className="pdp-editorial"><div className="pdp-editorial-word">ZASTAL.</div><div><span>THE GREEN CULTURE</span><h2>BARWY, KTÓRE<br/>NOSISZ <i>NA CO DZIEŃ.</i></h2><p>Nie tylko podczas meczu. Klubowa tożsamość jest z nami każdego dnia.</p></div></div>
   <section className="pdp-recommend"><div className="pdp-recommend-head"><div><span>WYBRANE DLA CIEBIE</span><h2>MOŻE CI SIĘ SPODOBAĆ<span>.</span></h2></div><Link href="/#products">WSZYSTKIE PRODUKTY <ArrowUpRight size={17}/></Link></div><div className="pdp-related-grid">{recommendations.map(p=><Link href={"/produkt/"+p.id} key={p.id} className="pdp-related"><div><img src={p.image} alt={p.name}/></div><span>{p.category.toUpperCase()}</span><b>{p.name}</b><strong>{fmt(p.price)}</strong></Link>)}</div></section>
  </main>
  <footer className="pdp-footer"><Link href="/">ZASTAL<span>.</span></Link><span>OFICJALNA KONCEPCJA / WERSJA DEMO 2026</span><Link href="/admin">ZAPLECZE SKLEPU <ArrowRight size={15}/></Link></footer>
  {added&&<div className="pdp-overlay" onClick={()=>setAdded(false)}><section className="pdp-success" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true"><button className="pdp-cross" onClick={()=>setAdded(false)}><X size={20}/></button><span className="pdp-success-check"><Check size={27}/></span><small>ZASTAL STORE</small><h2>DODANO DO KOSZYKA.</h2><p>{item.name} {size?"/ "+size:""} × {qty}</p><Link href="/?cart=1">PRZEJDŹ DO KOSZYKA <ArrowRight size={19}/></Link><button className="pdp-keep" onClick={()=>setAdded(false)}>KONTYNUUJ ZAKUPY</button></section></div>}
  {showSize&&<div className="pdp-overlay" onClick={()=>setShowSize(false)}><section className="pdp-size-modal" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true"><button className="pdp-cross" onClick={()=>setShowSize(false)}><X size={20}/></button><Ruler size={26}/><h2>ROZMIARÓWKA</h2><p>Dokładne wymiary odzieży zostaną zaimportowane od producenta. Przed wdrożeniem produkcyjnym nie będziemy publikować domyślnych, niezweryfikowanych wymiarów.</p><div className="pdp-size-list">{availableSizes.map(s=><span key={s}>{s}</span>)}</div></section></div>}
  {zoom&&<div className="pdp-zoom-overlay" onClick={()=>setZoom(false)}><button aria-label="Zamknij powiększenie"><X/></button><img src={item.image} alt={item.name}/></div>}
 </div>;
}
