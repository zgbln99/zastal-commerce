"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Heart, Instagram, Menu, Minus, Package, Plus, Search, ShieldCheck, ShoppingBag, SlidersHorizontal, Truck, UserRound, X } from "lucide-react";
import { catalog, fanPhoto, fmt, gamePhoto, type CatalogItem } from "../lib/catalog";

type CartLine = { id:number; size:string; quantity:number };
const categories = ["Wszystko", "Koszulki", "Bluzy", "Akcesoria", "Dzieci"];
const SORTS = ["Polecane", "Cena: od najniższej", "Cena: od najwyższej", "Nazwa: A–Z"];
const cartKey = (item:CartLine) => item.id+"|"+item.size;

function ProductImage({ item, className="" }:{item:CatalogItem;className?:string}){
 return <img src={item.image} alt={item.name} className={className} loading="lazy" onError={e=>{const el=e.currentTarget;el.style.opacity=".18";}} />;
}

export default function Home(){
 const [category,setCategory]=useState("Wszystko");
 const [sort,setSort]=useState(SORTS[0]);
 const [query,setQuery]=useState("");
 const [searchOpen,setSearchOpen]=useState(false);
 const [cartOpen,setCartOpen]=useState(false);
 const [menuOpen,setMenuOpen]=useState(false);
 const [quick,setQuick]=useState<CatalogItem|null>(null);
 const [size,setSize]=useState("");
 const [cart,setCart]=useState<CartLine[]>([]);
 const [favorites,setFavorites]=useState<number[]>([]);
 const [checkoutBusy,setCheckoutBusy]=useState(false);
 const [confirmation,setConfirmation]=useState<number|null>(null);
 const [notice,setNotice]=useState("");
 const [stockMap,setStockMap]=useState<Record<number,number>>({});
 useEffect(()=>{
   try{setCart(JSON.parse(localStorage.getItem("zastal_store_cart_v2")||"[]"))}catch{}
   try{setFavorites(JSON.parse(localStorage.getItem("zastal_store_favs")||"[]"))}catch{}
   fetch("/api/products").then(r=>r.json()).then((p:{id:number;stock:number}[])=>setStockMap(Object.fromEntries(p.map(x=>[x.id,x.stock])))).catch(()=>{});
 },[]);
 useEffect(()=>{localStorage.setItem("zastal_store_cart_v2",JSON.stringify(cart))},[cart]);
 useEffect(()=>{localStorage.setItem("zastal_store_favs",JSON.stringify(favorites))},[favorites]);
 useEffect(()=>{
   function onKey(event:KeyboardEvent){if(event.key==="Escape"){setQuick(null);setCartOpen(false);setSearchOpen(false);setMenuOpen(false)}}
   window.addEventListener("keydown",onKey);return ()=>window.removeEventListener("keydown",onKey);
 },[]);
 const products=useMemo(()=>{
  const q=query.trim().toLocaleLowerCase("pl-PL");
  let list=catalog.filter(p=>(category==="Wszystko"||p.category===category)&&(!q||(p.name+" "+p.category+" "+p.subtitle).toLocaleLowerCase("pl-PL").includes(q)));
  if(sort===SORTS[1])list=[...list].sort((a,b)=>a.price-b.price);
  if(sort===SORTS[2])list=[...list].sort((a,b)=>b.price-a.price);
  if(sort===SORTS[3])list=[...list].sort((a,b)=>a.name.localeCompare(b.name,"pl"));
  return list;
 },[category,sort,query]);
 const cartCount=cart.reduce((t,x)=>t+x.quantity,0);
 const cartTotal=cart.reduce((t,x)=>t+(catalog.find(p=>p.id===x.id)?.price||0)*x.quantity,0);
 const chooseCategory=(c:string)=>{setCategory(c);setMenuOpen(false);document.getElementById("kolekcja")?.scrollIntoView({behavior:"smooth"});};
 const openProduct=(p:CatalogItem)=>{setSize("");setQuick(p)};
 const addToCart=(p:CatalogItem, chosen:string)=>{
   if(p.sizes && !chosen){setNotice("Wybierz najpierw rozmiar.");return}
   if((stockMap[p.id]??p.stock)<=cart.filter(x=>x.id===p.id).reduce((a,b)=>a+b.quantity,0)){setNotice("Brak dostępnego stanu w demo.");return}
   setCart(old=>{let match=old.find(x=>x.id===p.id&&x.size===chosen);return match?old.map(x=>x===match?{...x,quantity:x.quantity+1}:x):[...old,{id:p.id,size:chosen,quantity:1}]});
   setQuick(null);setNotice("");setCartOpen(true);
 };
 const changeQty=(line:CartLine,n:number)=>setCart(old=>old.map(x=>cartKey(x)===cartKey(line)?{...x,quantity:Math.max(0,Math.min(n,stockMap[x.id]??20))}:x).filter(x=>x.quantity>0));
 const toggleFav=(id:number)=>setFavorites(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
 const checkout=async()=>{
  if(!cart.length)return;
  setCheckoutBusy(true);setNotice("");
  try{
   const r=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:cart.map(x=>({id:x.id,quantity:x.quantity,size:x.size}))})});
   const data=await r.json();
   if(!r.ok)throw new Error(data.error||"Nie można złożyć zamówienia");
   setConfirmation(data.id);setCart([]);setCartOpen(false);
   fetch("/api/products").then(r=>r.json()).then((p:{id:number;stock:number}[])=>setStockMap(Object.fromEntries(p.map(x=>[x.id,x.stock])))).catch(()=>{});
  }catch(e){setNotice(e instanceof Error?e.message:"Nieznany błąd")}
  finally{setCheckoutBusy(false)}
 };
 return <div className="site">
   <div className="announcement"><span className="announcement-star">✳</span> ZASTAL STORE — PROJEKT DEMONSTRACYJNY <span className="announcement-divider">/</span> ZAMÓWIENIA I PŁATNOŚCI WYŁĄCZNIE TESTOWE <span className="announcement-star">✳</span></div>
   <header className="site-header">
     <div className="header-inner">
      <button className="mobile-menu icon-btn" onClick={()=>setMenuOpen(true)} aria-label="Otwórz menu"><Menu size={23}/></button>
      <a href="/" className="wordmark" aria-label="Zastal Store — strona główna"><span className="wordmark-emblem">Z</span><span className="wordmark-text">ZASTAL<span className="wordmark-dot">.</span><small>OFFICIAL STORE / DEMO</small></span></a>
      <nav className="main-nav" aria-label="Kategorie">
       <button onClick={()=>chooseCategory("Wszystko")}>NOWOŚCI</button>
       <button onClick={()=>chooseCategory("Koszulki")}>KOSZULKI</button>
       <button onClick={()=>chooseCategory("Bluzy")}>BLUZY</button>
       <button onClick={()=>chooseCategory("Akcesoria")}>AKCESORIA</button>
       <button onClick={()=>document.getElementById("heritage")?.scrollIntoView({behavior:"smooth"})}>HERITAGE <ArrowUpRight size={13}/></button>
      </nav>
      <div className="header-actions">
       <button className="icon-btn" aria-label="Wyszukaj" onClick={()=>setSearchOpen(true)}><Search size={21}/></button>
       <a className="icon-btn desktop-only" href="/admin" aria-label="Panel sklepu"><UserRound size={21}/></a>
       <button className="icon-btn bag-btn" aria-label={"Koszyk: "+cartCount+" produktów"} onClick={()=>setCartOpen(true)}><ShoppingBag size={21}/>{cartCount>0&&<b className="bag-count">{cartCount}</b>}</button>
      </div>
     </div>
   </header>
   <main>
    <section className="hero">
     <div className="hero-image" style={{backgroundImage:`linear-gradient(90deg,rgba(3,37,25,.96) 0%,rgba(4,44,29,.92) 36%,rgba(5,48,31,.38) 73%,rgba(5,45,31,.12)),url("${fanPhoto}")`}} />
     <div className="hero-line" aria-hidden="true">ZASTAL · ZIELONA GÓRA · OD 1946 · ZASTAL · ZIELONA GÓRA</div>
     <div className="hero-container">
      <div className="hero-content">
       <div className="eyebrow light"><span className="eyebrow-line"/> WIĘCEJ NIŻ KOSZYKÓWKA</div>
       <h1>WIERNI<br/>BARWOM<span className="hero-period">.</span></h1>
       <p>Na parkiecie. Na trybunach. Na co dzień.<br/>Odkryj kolekcję stworzoną dla zielonogórskiej koszykówki.</p>
       <div className="hero-buttons"><button className="button button-white" onClick={()=>chooseCategory("Wszystko")}>ODKRYJ KOLEKCJĘ <ArrowUpRight size={19}/></button><button className="text-link light-link" onClick={()=>document.getElementById("heritage")?.scrollIntoView({behavior:"smooth"})}>NASZA HISTORIA <ArrowRight size={17}/></button></div>
      </div>
      <div className="hero-bottom"><span>01 <span className="dim">/</span> 03</span><span className="hero-slogan">ZIELONA TOŻSAMOŚĆ. JEDEN KLUB.</span><button onClick={()=>document.getElementById("kolekcja")?.scrollIntoView({behavior:"smooth"})} aria-label="Przejdź do produktów"><ArrowDown size={20}/></button></div>
     </div>
     <span className="hero-bigtype" aria-hidden="true">1946</span>
    </section>

    <div className="benefit-strip"><div><Truck size={19}/><span>DOSTAWA I ODBIÓR — WERSJA DEMO</span></div><i/><div><ShieldCheck size={19}/><span>BEZPIECZNA PREZENTACJA TESTOWA</span></div><i/><div><Package size={19}/><span>KOLEKCJE DLA KAŻDEGO KIBICA</span></div></div>

    <section className="section-intro" id="kolekcja">
     <div className="section-kicker"><span className="tiny-cross">✳</span> THE GREEN COLLECTION <span>— 2026</span></div>
     <div className="section-title-row"><div><h2>STYL, KTÓRY<br/><em>NAS ŁĄCZY.</em></h2><p>Od klasycznych bluz po koszulki, które opowiadają historię klubu.</p></div><a className="section-side-link" href="#products">PRZEJRZYJ PRODUKTY <ArrowUpRight size={18}/></a></div>
    </section>

    <section className="categories" aria-label="Kategorie produktów">
      <button className="category-card c-hoodie" onClick={()=>chooseCategory("Bluzy")}><div className="category-img"><ProductImage item={catalog[0]}/></div><div className="category-label"><span>01 / CODZIENNIE</span><strong>BLUZY</strong><span className="circle-arrow"><ArrowUpRight size={20}/></span></div></button>
      <button className="category-card c-shirt" onClick={()=>chooseCategory("Koszulki")}><div className="category-img"><ProductImage item={catalog[4]}/></div><div className="category-label"><span>02 / NA TRYBUNACH</span><strong>KOSZULKI</strong><span className="circle-arrow"><ArrowUpRight size={20}/></span></div></button>
      <button className="category-card c-accessory" onClick={()=>chooseCategory("Akcesoria")}><div className="category-img"><ProductImage item={catalog[7]}/></div><div className="category-label"><span>03 / DETALE</span><strong>AKCESORIA</strong><span className="circle-arrow"><ArrowUpRight size={20}/></span></div></button>
    </section>

    <section className="collection-section" id="products">
      <div className="collection-top">
       <div><span className="section-kicker">WYBRANE DLA CIEBIE <span>— SKLEP</span></span><h2>ODKRYJ PRODUKTY<span className="heading-star">✳</span></h2></div>
       <span className="product-result">{products.length} PRODUKTÓW</span>
      </div>
      <div className="shop-toolbar">
       <div className="filter-tabs">{categories.map(c=><button key={c} className={category===c?"active":""} onClick={()=>setCategory(c)}>{c}</button>)}</div>
       <div className="sort-select"><SlidersHorizontal size={17}/><select aria-label="Sortuj produkty" value={sort} onChange={e=>setSort(e.target.value)}>{SORTS.map(s=><option key={s}>{s}</option>)}</select><ChevronDown size={14}/></div>
      </div>
      {products.length? <div className="product-grid">{products.map((p,i)=><article className="product-card" key={p.id}>
        <div className={"product-visual visual-"+(i%4)} onClick={()=>openProduct(p)} role="button" tabIndex={0} onKeyDown={e=>e.key==="Enter"&&openProduct(p)}>
          {p.tag&&<span className="product-tag">{p.tag}</span>}
          <button className={"favorite "+(favorites.includes(p.id)?"selected":"")} aria-label="Dodaj do ulubionych" onClick={e=>{e.stopPropagation();toggleFav(p.id)}}><Heart size={19} fill={favorites.includes(p.id)?"currentColor":"none"}/></button>
          <ProductImage item={p}/><span className="quick-label">ZOBACZ PRODUKT <ArrowUpRight size={17}/></span>
        </div>
        <div className="product-meta"><span>{p.category.toUpperCase()}</span><span>{(stockMap[p.id]??p.stock)>0?"DOSTĘPNE W DEMO":"WYPRZEDANE"}</span></div>
        <button className="product-name" onClick={()=>openProduct(p)}>{p.name}</button>
        <p className="product-subtitle">{p.subtitle}</p>
        <div className="price-row"><b>{fmt(p.price)}</b><button aria-label={"Dodaj "+p.name} onClick={()=>p.sizes?openProduct(p):addToCart(p,"")} disabled={(stockMap[p.id]??p.stock)<=0}><Plus size={19}/></button></div>
      </article>)}</div>:<div className="no-results"><Search size={27}/><h3>Nie znaleziono produktów</h3><p>Spróbuj innej kategorii lub zapytania.</p><button className="button button-dark" onClick={()=>{setCategory("Wszystko");setQuery("")}}>Pokaż wszystkie</button></div>}
    </section>

    <section className="heritage-section" id="heritage">
      <div className="heritage-copy"><div className="eyebrow light"><span className="eyebrow-line"/> ZASTAL / HERITAGE SERIES</div><span className="heritage-number">EST. 1946</span><h2>HISTORIA<br/>W NASZYCH<br/><i>BARWACH.</i></h2><p>Zielona Góra ma swój rytm. Od pokoleń nadaje go koszykówka. Kolekcja retro przypomina, skąd jesteśmy.</p><button className="button button-white" onClick={()=>chooseCategory("Bluzy")}>ZOBACZ KOLEKCJĘ <ArrowUpRight size={18}/></button></div>
      <div className="heritage-image"><ProductImage item={catalog[1]}/><span className="heritage-mark">1946</span></div>
    </section>

    <section className="fan-section">
      <div className="fan-image" style={{backgroundImage:`url("${gamePhoto}")`}}><span className="fan-caption">ZIELONA GÓRA / ONE CITY, ONE TEAM</span></div>
      <div className="fan-copy"><span className="section-kicker"><span className="tiny-cross">✳</span> WSPÓLNA PASJA</span><h2>TO NIE JEST<br/>TYLKO<br/><em>GRA.</em></h2><p>To ludzie. Emocje. Głos z trybun. Kolory, które zawsze nosimy z dumą. Zastal to coś więcej niż wynik meczu.</p><div className="fan-rule"/><p className="fan-signature">ZIELONA GÓRA. OD 1946.</p><button className="text-link" onClick={()=>chooseCategory("Wszystko")}>DOŁĄCZ DO ZIELONEJ STRONY <ArrowRight size={18}/></button></div>
    </section>

    <section className="newsletter"><span className="newsletter-star">✳</span><div><span>STAY GREEN / ZASTAL COMMUNITY</span><h2>NOSIMY TE SAME BARWY.</h2><p>Wkrótce: klubowe premiery, dropy i kolekcje specjalne.</p></div><button className="button button-white" onClick={()=>{setNotice("Zapisy do newslettera będą dostępne po uruchomieniu produkcyjnym.");window.scrollTo({top:0,behavior:"smooth"})}}>DOWIEDZ SIĘ WIĘCEJ <ArrowUpRight size={18}/></button></section>
   </main>

   <footer className="footer"><div className="footer-main"><div className="footer-brand"><div className="footer-logo">ZASTAL<span>.</span></div><p>THE GREEN CULTURE.<br/>Zielonogórska koszykówka na co dzień.</p></div><div><strong>SKLEP</strong><button onClick={()=>chooseCategory("Wszystko")}>Wszystkie produkty</button><button onClick={()=>chooseCategory("Koszulki")}>Koszulki</button><button onClick={()=>chooseCategory("Bluzy")}>Bluzy</button><button onClick={()=>chooseCategory("Akcesoria")}>Akcesoria</button></div><div><strong>POMOC</strong><span>Zamówienia demonstracyjne</span><span>Brak rzeczywistych płatności</span><span>Brak rzeczywistych dostaw</span><a href="https://zastal.store/" target="_blank" rel="noreferrer">Aktualny sklep klubowy <ArrowUpRight size={12}/></a></div><div><strong>ZASTAL ZIELONA GÓRA</strong><span>ul. Urszuli 14</span><span>65-147 Zielona Góra</span><a href="https://basketzg.pl/" target="_blank" rel="noreferrer">Oficjalna strona klubu <ArrowUpRight size={12}/></a><a href="https://www.instagram.com/zastalen/ " target="_blank" rel="noreferrer"><Instagram size={17}/> Instagram</a></div></div><div className="footer-bottom"><span>© 2026 ZASTAL STORE — WERSJA KONCEPCYJNA / DEMO</span><span>DESIGNED FOR THE GREEN CITY <span>✳</span></span></div></footer>

   {menuOpen&&<div className="overlay" onClick={()=>setMenuOpen(false)}><aside className="mobile-nav" onClick={e=>e.stopPropagation()}><div className="drawer-head"><strong>ZASTAL / MENU</strong><button className="icon-btn" onClick={()=>setMenuOpen(false)} aria-label="Zamknij"><X/></button></div>{categories.map(c=><button key={c} onClick={()=>chooseCategory(c)}>{c}<ArrowUpRight size={21}/></button>)}<a href="/admin">Panel administratora <ArrowRight size={18}/></a></aside></div>}
   {searchOpen&&<div className="search-overlay" onClick={()=>setSearchOpen(false)}><div className="search-box" onClick={e=>e.stopPropagation()}><div className="search-top"><Search size={25}/><input autoFocus value={query} onChange={e=>{setQuery(e.target.value);setCategory("Wszystko")}} placeholder="Czego szukasz?" onKeyDown={e=>{if(e.key==="Enter"){setSearchOpen(false);document.getElementById("products")?.scrollIntoView({behavior:"smooth"})}}}/><button className="icon-btn" onClick={()=>setSearchOpen(false)} aria-label="Zamknij wyszukiwarkę"><X/></button></div><p>POPULARNE WYSZUKIWANIA</p><div className="search-suggestions">{["Bluza","Koszulka","Retro","Worek"].map(x=><button key={x} onClick={()=>{setQuery(x);setSearchOpen(false);document.getElementById("products")?.scrollIntoView({behavior:"smooth"})}}>{x} <ArrowUpRight size={15}/></button>)}</div><button className="search-show" onClick={()=>{setSearchOpen(false);document.getElementById("products")?.scrollIntoView({behavior:"smooth"})}}>POKAŻ WYNIKI <ArrowRight size={18}/></button></div></div>}
   {quick&&<div className="overlay modal-overlay" onClick={()=>setQuick(null)}><div className="quick-modal" role="dialog" aria-modal="true" aria-label={quick.name} onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="Zamknij" onClick={()=>setQuick(null)}><X size={21}/></button><div className="quick-picture"><ProductImage item={quick}/></div><div className="quick-info"><span className="section-kicker">{quick.category.toUpperCase()} / ZASTAL STORE</span><h2>{quick.name}</h2><p>{quick.subtitle}</p><div className="quick-price">{fmt(quick.price)}</div><div className="thin-rule"/>{quick.sizes&&<><div className="size-heading"><strong>WYBIERZ ROZMIAR</strong><span>Tabela rozmiarów — w przygotowaniu</span></div><div className="size-options">{quick.sizes.map(s=><button className={size===s?"active":""} key={s} onClick={()=>{setSize(s);setNotice("")}}>{s}</button>)}</div></>}<p className="stock-note"><span className="stock-dot"/>{stockMap[quick.id]??quick.stock} szt. w magazynie demo</p><button className="button button-dark quick-add" onClick={()=>addToCart(quick,size)}>DODAJ DO KOSZYKA <ShoppingBag size={19}/></button><div className="quick-foot"><Truck size={17}/> Zamówienie testowe — bez płatności i wysyłki</div></div></div></div>}
   {cartOpen&&<div className="overlay" onClick={()=>setCartOpen(false)}><aside className="cart-drawer" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Koszyk"><div className="drawer-head"><div><small>TWÓJ WYBÓR</small><h2>KOSZYK <span>({cartCount})</span></h2></div><button className="icon-btn" onClick={()=>setCartOpen(false)} aria-label="Zamknij koszyk"><X/></button></div>{cart.length?<><div className="cart-lines">{cart.map(line=>{let p=catalog.find(x=>x.id===line.id);if(!p)return null;return <div className="cart-line" key={cartKey(line)}><div className="cart-thumb"><ProductImage item={p}/></div><div className="cart-line-info"><strong>{p.name}</strong><small>{line.size?"ROZMIAR: "+line.size:"AKCESORIA"}</small><b>{fmt(p.price*line.quantity)}</b><div className="quantity"><button aria-label="Zmniejsz ilość" onClick={()=>changeQty(line,line.quantity-1)}><Minus size={15}/></button><span>{line.quantity}</span><button aria-label="Zwiększ ilość" onClick={()=>changeQty(line,line.quantity+1)}><Plus size={15}/></button></div></div><button className="remove-line" onClick={()=>changeQty(line,0)} aria-label="Usuń produkt"><X size={17}/></button></div>})}</div><div className="cart-footer"><div className="cart-sum"><span>RAZEM</span><strong>{fmt(cartTotal)}</strong></div><p>To wersja demo. Nie pobieramy płatności i nie realizujemy przesyłek.</p><button className="button button-dark" disabled={checkoutBusy} onClick={checkout}>{checkoutBusy?"PRZETWARZANIE...":"ZŁÓŻ ZAMÓWIENIE TESTOWE"} <ArrowRight size={19}/></button></div></>:<div className="empty-cart"><ShoppingBag size={50} strokeWidth={1.2}/><h3>Twój koszyk jest pusty.</h3><p>Odkryj kolekcję przygotowaną dla kibiców Zastalu.</p><button className="button button-dark" onClick={()=>{setCartOpen(false);chooseCategory("Wszystko")}}>PRZEJDŹ DO SKLEPU <ArrowRight size={17}/></button></div>}</aside></div>}
   {confirmation!==null&&<div className="overlay modal-overlay" onClick={()=>setConfirmation(null)}><div className="confirm-modal" onClick={e=>e.stopPropagation()}><div className="confirm-icon"><Check size={29}/></div><span className="section-kicker">ZAMÓWIENIE TESTOWE</span><h2>DZIĘKUJEMY!</h2><p>Utworzyliśmy zamówienie demonstracyjne <strong>#{confirmation}</strong>. Możesz zobaczyć jego status w panelu administratora.</p><p className="confirm-warning">Nie pobrano pieniędzy i nic nie zostanie wysłane.</p><button className="button button-dark" onClick={()=>setConfirmation(null)}>WRÓĆ DO SKLEPU <ArrowRight size={17}/></button></div></div>}
   {notice&&<div className="toast" role="status"><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Zamknij komunikat"><X size={18}/></button></div>}
  </div>;
}
