"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {ArrowDownToLine,ArrowLeft,ArrowRight,BarChart3,Box,CheckCircle2,ChevronDown,ClipboardList,Clock3,Hash,LayoutDashboard,LogIn,LogOut,Menu,Package,Printer,Search,Settings2,ShoppingBag,SlidersHorizontal,Tag,Truck,Warehouse,X} from "lucide-react";
import JsBarcode from "jsbarcode";
import "./admin.css";
import {QRCodeSVG} from "qrcode.react";
import {catalog,fmt,type CatalogItem} from "../../lib/catalog";

type Order={id:number;created:string;items:string;total:number;status:string};
type Stock={id:number;sku:string;name:string;stock:number;price:number};
const statusOptions=["nowe","potwierdzone","do_kompletacji","nanoszenie_dtf","kontrola_jakosci","spakowane","wyslane_demo","anulowane"];
const statusText:Record<string,string>={nowe:"Nowe",potwierdzone:"Potwierdzone",do_kompletacji:"Kompletacja",nanoszenie_dtf:"Nanoszenie DTF",kontrola_jakosci:"Kontrola jakości",spakowane:"Spakowane",wyslane_demo:"Wysłane (demo)",anulowane:"Anulowane"};
type View="dashboard"|"orders"|"warehouse"|"labels"|"dtf";
function ean13(id:number){
 const base="200"+String(id).padStart(9,"0");let sum=0;
 for(let i=0;i<12;i++)sum+=Number(base[i])*(i%2?3:1);
 return base+((10-sum%10)%10);
}
function Barcode({value}:{value:string}){
 const ref=useRef<SVGSVGElement|null>(null);
 useEffect(()=>{if(ref.current){JsBarcode(ref.current,value,{format:"EAN13",displayValue:true,height:54,width:1.7,margin:0,fontSize:12})}},[value]);
 return <svg ref={ref} aria-label={"Kod EAN-13 "+value}/>;
}
function dataCsv(rows:Order[]){
 const esc=(v:string)=>'"'+v.replaceAll('"','""')+'"';
 const str="ID;DATA;STATUS;KWOTA_PLN\n"+rows.map(o=>[o.id,esc(o.created),esc(o.status),(o.total/100).toFixed(2)].join(";")).join("\n");
 const url=URL.createObjectURL(new Blob(["\uFEFF"+str],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download="zastal-zamowienia-demo.csv";a.click();URL.revokeObjectURL(url);
}
export default function Admin(){
 const [token,setToken]=useState("");
 const [secret,setSecret]=useState("");
 const [authorized,setAuthorized]=useState(false);
 const [view,setView]=useState<View>("dashboard");
 const [orders,setOrders]=useState<Order[]>([]);
 const [stock,setStock]=useState<Stock[]>([]);
 const [msg,setMsg]=useState("");
 const [busy,setBusy]=useState(false);
 const [search,setSearch]=useState("");
 const [labelId,setLabelId]=useState(1);
 const [labelQty,setLabelQty]=useState(1);
 const [sidebar,setSidebar]=useState(false);
 const req=async(path:string,options:RequestInit={},customToken?:string)=>{
  const r=await fetch("/api"+path,{...options,headers:{"Content-Type":"application/json","Authorization":"Bearer "+(customToken??token),...options.headers}});
  const d=await r.json();if(!r.ok)throw Error(d.error||"Błąd serwera");return d;
 };
 async function refresh(withToken?:string){
  setBusy(true);setMsg("");
  try{
   const [o,p]=await Promise.all([req("/admin/orders",{},withToken),req("/products",{},withToken)]);
   setOrders(o);setStock(p);setAuthorized(true);
  }catch(e){setAuthorized(false);setMsg(e instanceof Error?e.message:"Nie można się zalogować")}
  finally{setBusy(false)}
 }
 async function login(){setToken(secret);await refresh(secret)}
 async function updateStatus(id:number,status:string){
  try{await req("/admin/orders/"+id,{method:"PATCH",body:JSON.stringify({status})});await refresh()}
  catch(e){setMsg(e instanceof Error?e.message:"Nie udało się zmienić statusu")}
 }
 const shown=orders.filter(o=>(o.id+" "+o.status+" "+o.items).toLowerCase().includes(search.toLowerCase()));
 const activeOrders=orders.filter(o=>!["anulowane","wyslane_demo"].includes(o.status)).length;
 const revenue=orders.filter(o=>o.status!=="anulowane").reduce((a,b)=>a+b.total,0);
 const low=stock.filter(p=>p.stock<20).length;
 const sku=catalog.find(x=>x.id===labelId)||catalog[0];
 const labelData=stock.find(x=>x.id===labelId);
 const labelCode=ean13(labelId);
 const tabs:[View,string,React.ReactNode][]= [["dashboard","Przegląd",<LayoutDashboard key="1" size={19}/>],["orders","Zamówienia",<ShoppingBag key="2" size={19}/>],["warehouse","Magazyn",<Warehouse key="3" size={19}/>],["labels","Etykiety EAN / QR",<Tag key="4" size={19}/>],["dtf","Nadruki DTF",<Printer key="5" size={19}/>]];
 const nav=<>{tabs.map(([key,title,icon])=><button key={key} className={"admin-navitem "+(view===key?"active":"")} onClick={()=>{setView(key);setSidebar(false)}}>{icon}<span>{title}</span>{view===key&&<ArrowRight size={16} className="nav-right"/>}</button>)}</>;
 if(!authorized)return <div className="login-shell"><div className="login-panel"><a href="/" className="admin-return"><ArrowLeft size={17}/> WRÓĆ DO SKLEPU</a><div className="login-mark">Z<span>.</span></div><span className="section-kicker">ZASTAL COMMERCE OS / DEMO</span><h1>CENTRUM<br/>OPERACYJNE.</h1><p>Panel zarządzania zamówieniami, magazynem i etykietami. Logowanie za pomocą klucza demonstracyjnego.</p><form onSubmit={e=>{e.preventDefault();login()}}><label htmlFor="admin-token">KLUCZ ADMINISTRATORA</label><input id="admin-token" type="password" value={secret} onChange={e=>setSecret(e.target.value)} placeholder="Wprowadź klucz dostępu" autoComplete="current-password"/><button className="button button-dark" disabled={busy} type="submit">{busy?"ŁĄCZENIE...":"OTWÓRZ PANEL"} <LogIn size={17}/></button></form>{msg&&<p className="login-error">{msg}</p>}<p className="login-caption">Panel jest przeznaczony wyłącznie do testów. Nie wprowadzaj prawdziwych danych klientów.</p></div><div className="login-visual"><span>THE GREEN<br/>CULTURE.</span><strong>1946</strong></div></div>;
 return <div className="admin-shell">
   <aside className={"admin-sidebar "+(sidebar?"is-open":"")}>
    <div className="admin-brand"><span className="admin-brand-z">Z</span><span><strong>ZASTAL<span className="admin-lime">.</span></strong><small>COMMERCE OS</small></span></div>
    <div className="admin-sidebar-label">ZARZĄDZANIE</div>{nav}
    <div className="admin-side-bottom"><div className="admin-demo"><span className="demo-indicator"/> ŚRODOWISKO DEMO</div><a href="/" target="_blank" rel="noreferrer">Przejdź do sklepu <ArrowRight size={15}/></a><button onClick={()=>{setAuthorized(false);setToken("");setSecret("")}}><LogOut size={16}/> Wyloguj</button></div>
   </aside>
   <div className="admin-main">
    <header className="admin-topbar"><button className="admin-mobile-menu" onClick={()=>setSidebar(!sidebar)}><Menu/></button><div className="admin-breadcrumb">ZASTAL STORE <span>/</span> {tabs.find(t=>t[0]===view)?.[1]}</div><div className="admin-top-right"><span className="admin-live"><span/>SYSTEM ONLINE</span><button onClick={()=>refresh()}>ODŚWIEŻ <ArrowRight size={16}/></button></div></header>
    <div className="admin-page">
     <div className="admin-page-heading"><div><span className="section-kicker">ZASTAL COMMERCE / MANAGEMENT</span><h1>{view==="dashboard"?"PANEL GŁÓWNY":view==="orders"?"ZAMÓWIENIA":view==="warehouse"?"STANY MAGAZYNOWE":view==="labels"?"ETYKIETY PRODUKTÓW":"PRODUKCJA DTF"}<span>.</span></h1><p>{view==="dashboard"?"Przejrzysty obraz działalności sklepu, zamówień i magazynu.":view==="orders"?"Wszystkie testowe zamówienia w jednym miejscu.":view==="warehouse"?"Stan produktów gotowych do sprzedaży i kompletacji.":view==="labels"?"Generuj i drukuj kody EAN-13 oraz QR dla produktów.":"Zlecenia nanoszenia gotowych transferów DTF na odzież."}</p></div><span className="admin-version">WERSJA 0.2 / DEMO</span></div>
     {msg&&<div className="admin-alert">{msg}<button onClick={()=>setMsg("")}><X size={16}/></button></div>}
     {view==="dashboard"&&<><div className="admin-metrics"><div><span>ŁĄCZNA WARTOŚĆ ZAMÓWIEŃ</span><strong>{fmt(revenue)}</strong><small>Wartość zamówień testowych, bez anulowanych</small><BarChart3 size={26}/></div><div><span>ZAMÓWIENIA W TOKU</span><strong>{activeOrders}</strong><small>Wymagają obsługi</small><ClipboardList size={26}/></div><div><span>PRODUKTY</span><strong>{stock.length}</strong><small>Pozycje w katalogu</small><Package size={26}/></div><div><span>NISKIE STANY</span><strong>{low}</strong><small>Produkty poniżej 20 sztuk</small><Warehouse size={26}/></div></div><div className="admin-two-col"><section className="admin-panel"><div className="admin-panel-head"><div><span>OSTATNIA AKTYWNOŚĆ</span><h2>Najnowsze zamówienia</h2></div><button onClick={()=>setView("orders")}>ZOBACZ WSZYSTKIE <ArrowRight size={15}/></button></div>{orders.length?<table className="admin-table"><thead><tr><th>ZAMÓWIENIE</th><th>WARTOŚĆ</th><th>STATUS</th></tr></thead><tbody>{orders.slice(0,7).map(o=><tr key={o.id}><td><b>ZS-{String(o.id).padStart(5,"0")}</b><small>{new Date(o.created).toLocaleString("pl-PL")}</small></td><td>{fmt(o.total)}</td><td><span className={"status-badge status-"+o.status}>{statusText[o.status]||o.status}</span></td></tr>)}</tbody></table>:<div className="admin-empty">Nie ma jeszcze zamówień testowych.</div>}</section><section className="admin-panel"><div className="admin-panel-head"><div><span>OPERACJE</span><h2>Szybkie działania</h2></div></div><div className="admin-quicklinks"><button onClick={()=>setView("orders")}><ShoppingBag size={24}/><span>Obsłuż zamówienia</span><ArrowRight size={17}/></button><button onClick={()=>setView("warehouse")}><Warehouse size={24}/><span>Sprawdź magazyn</span><ArrowRight size={17}/></button><button onClick={()=>setView("labels")}><Tag size={24}/><span>Drukuj etykiety EAN / QR</span><ArrowRight size={17}/></button><button onClick={()=>setView("dtf")}><Printer size={24}/><span>Proces nanoszenia DTF</span><ArrowRight size={17}/></button></div></section></div></>}
     {view==="orders"&&<section className="admin-panel"><div className="admin-panel-head"><div><span>SPRZEDAŻ / TEST</span><h2>Rejestr zamówień <small>({shown.length})</small></h2></div><button onClick={()=>dataCsv(shown)}><ArrowDownToLine size={17}/> EKSPORT CSV</button></div><div className="admin-search"><Search size={19}/><input placeholder="Szukaj po numerze, statusie lub produkcie..." value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="table-wrap"><table className="admin-table"><thead><tr><th>NUMER / DATA</th><th>POZYCJE</th><th>WARTOŚĆ</th><th>STATUS — ZMIEŃ</th></tr></thead><tbody>{shown.map(o=><tr key={o.id}><td><b>ZS-{String(o.id).padStart(5,"0")}</b><small>{new Date(o.created).toLocaleString("pl-PL")}</small></td><td><span className="admin-item-count">{(()=>{try{return JSON.parse(o.items).length}catch{return 0}})()} poz.</span></td><td><strong>{fmt(o.total)}</strong></td><td><select className="status-select" value={o.status} onChange={e=>updateStatus(o.id,e.target.value)}>{statusOptions.map(s=><option key={s} value={s}>{statusText[s]}</option>)}</select></td></tr>)}</tbody></table>{!shown.length&&<div className="admin-empty">Brak zamówień do wyświetlenia.</div>}</div></section>}
     {view==="warehouse"&&<section className="admin-panel"><div className="admin-panel-head"><div><span>STANY / SKU</span><h2>Produkty na magazynie</h2></div><button onClick={()=>setView("labels")}><Tag size={17}/> GENERUJ ETYKIETY</button></div><div className="table-wrap"><table className="admin-table"><thead><tr><th>PRODUKT</th><th>SKU</th><th>CENA</th><th>STAN</th><th>STATUS</th></tr></thead><tbody>{stock.map(p=>{let item=catalog.find(x=>x.id===p.id);return <tr key={p.id}><td><div className="admin-product-cell"><img src={item?.image||""} alt=""/><b>{p.name}</b></div></td><td><span className="admin-sku">{p.sku}</span></td><td>{fmt(p.price)}</td><td><strong>{p.stock} szt.</strong></td><td><span className={"status-badge "+(p.stock<20?"low-stock":"in-stock")}>{p.stock<20?"NISKI STAN":"DOSTĘPNY"}</span></td></tr>})}</tbody></table></div><div className="panel-note"><Box size={18}/> To podgląd magazynu demonstracyjnego. Obsługa korekt, przyjęć i rezerwacji per rozmiar zostanie dodana w kolejnym etapie.</div></section>}
     {view==="labels"&&<div className="labels-layout"><section className="admin-panel"><div className="admin-panel-head"><div><span>MAGAZYN / IDENTYFIKACJA</span><h2>Generator etykiet</h2></div></div><div className="label-form"><label>WYBIERZ PRODUKT</label><select value={labelId} onChange={e=>setLabelId(Number(e.target.value))}>{catalog.map(p=><option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}</select><label>LICZBA ETYKIET</label><div className="label-qty"><button onClick={()=>setLabelQty(Math.max(1,labelQty-1))}>−</button><input type="number" min={1} max={48} value={labelQty} onChange={e=>setLabelQty(Math.max(1,Math.min(48,Number(e.target.value)||1)))}/><button onClick={()=>setLabelQty(Math.min(48,labelQty+1))}>+</button></div><p>Kod EAN-13 ma wewnętrzny prefiks 200, przeznaczony do identyfikacji w obrębie sklepu. To <strong>nie jest zarejestrowany GTIN firmy</strong>.</p><button className="button button-dark" onClick={()=>window.print()}><Printer size={18}/> DRUKUJ {labelQty} {labelQty===1?"ETYKIETĘ":"ETYKIET"}</button></div></section><section className="admin-panel label-preview-panel"><div className="admin-panel-head"><div><span>PODGLĄD WYDRUKU</span><h2>Etykieta 60 × 40 mm</h2></div></div><div className="label-paper"><div className="printed-label"><div className="printed-label-name"><b>ZASTAL<span>.</span></b><small>STORE / SKU</small></div><strong>{sku.name}</strong><div className="label-codes"><div><Barcode value={labelCode}/></div><QRCodeSVG value={"ZASTAL|"+sku.sku+"|"+labelCode} size={68} marginSize={0}/></div><div className="printed-label-foot"><span>{sku.sku}</span><span>{fmt(labelData?.price??sku.price)}</span></div></div></div><p className="label-info"><CheckCircle2 size={17}/> Kody z kontrolną cyfrą EAN-13 oraz QR można skanować standardowym czytnikiem. Wersja demonstracyjna.</p></section><div className="print-area">{Array.from({length:labelQty},(_,i)=><div key={i} className="printed-label"><div className="printed-label-name"><b>ZASTAL<span>.</span></b><small>STORE / SKU</small></div><strong>{sku.name}</strong><div className="label-codes"><div><Barcode value={labelCode}/></div><QRCodeSVG value={"ZASTAL|"+sku.sku+"|"+labelCode} size={68}/></div><div className="printed-label-foot"><span>{sku.sku}</span><span>{fmt(labelData?.price??sku.price)}</span></div></div>)}</div></div>}
     {view==="dtf"&&<div className="admin-two-col"><section className="admin-panel"><div className="admin-panel-head"><div><span>PRZYGOTOWANIE ODZIEŻY</span><h2>Nadruki DTF od dostawców</h2></div></div><div className="dtf-steps">{[["01","Zamówienie gotowych transferów","Klub kupuje gotowe nadruki DTF od dostawcy."],["02","Przyjęcie transferów","Ewidencja otrzymanych wzorów i dostępnych sztuk."],["03","Rezerwacja koszulki i nadruku","Sprawdzenie dostępności obu elementów."],["04","Nanoszenie na odzież","Pracownik potwierdza aplikację transferu."],["05","Kontrola jakości i pakowanie","Gotowy produkt zostaje wydany do kompletacji."]].map(x=><div className="dtf-step" key={x[0]}><span>{x[0]}</span><div><strong>{x[1]}</strong><p>{x[2]}</p></div></div>)}</div></section><section className="admin-panel"><div className="admin-panel-head"><div><span>PLANOWANY MODUŁ</span><h2>Centrum produkcyjne</h2></div></div><div className="dtf-note"><Printer size={38}/><h3>Moduł DTF w przygotowaniu</h3><p>Ten ekran przedstawia zatwierdzony proces. Zakupy transferów, partie produkcyjne, pobrania z magazynu i historia operatorów zostaną podłączone do bazy danych w kolejnym wydaniu.</p><button className="button button-dark" onClick={()=>setView("orders")}>PRZEJDŹ DO ZAMÓWIEŃ <ArrowRight size={16}/></button></div></section></div>}
    </div>
   </div>
   {sidebar&&<div className="admin-mobile-backdrop" onClick={()=>setSidebar(false)}/>}
 </div>;
}
