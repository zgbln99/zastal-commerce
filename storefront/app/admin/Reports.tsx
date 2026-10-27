"use client";
import {useCallback,useEffect,useState} from "react";
import {Download,RefreshCw} from "lucide-react";
import {useAuth} from "../../components/AuthProvider";
import {useStore} from "../../components/StoreProvider";
import {formatMoney} from "./Operations";
type Report={from:string;to:string;scope:"live"|"test";totals:{orders:number;revenue:number;products:number;shipping:number;discount:number;gift_card:number;items:number;average:number};by_day:{day:string;orders:number;revenue:number;online:number;pos:number}[];by_channel:{online:{orders:number;revenue:number};pos:{orders:number;revenue:number}};by_payment:{method:string;label:string;orders:number;revenue:number}[];by_product:{sku:string;name:string;qty:number;revenue:number}[];refunds:{count:number;amount:number};orders:{id:number;day:string;channel:string;payment:string;value:number}[]};
const iso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const shift=(days:number)=>{const d=new Date();d.setDate(d.getDate()+days);return iso(d);};
const monthStart=(offset:number)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+offset);return iso(d);};
const monthEnd=(offset:number)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+offset+1);d.setDate(0);return iso(d);};
const presets=[{label:"Dziś",from:()=>iso(new Date()),to:()=>iso(new Date())},{label:"7 dni",from:()=>shift(-6),to:()=>iso(new Date())},{label:"30 dni",from:()=>shift(-29),to:()=>iso(new Date())},{label:"Ten miesiąc",from:()=>monthStart(0),to:()=>monthEnd(0)},{label:"Poprzedni miesiąc",from:()=>monthStart(-1),to:()=>monthEnd(-1)}];
const dayLabel=(day:string)=>new Date(day+"T12:00:00").toLocaleDateString("pl-PL",{weekday:"short",day:"numeric",month:"short"});
/** Sales for the owner and the accountant: real sales only, by day, channel, payment and product, CSV for the spreadsheet. */
export default function Reports(){
 const auth=useAuth(),store=useStore();
 const [from,setFrom]=useState(shift(-29)),[to,setTo]=useState(iso(new Date())),[scope,setScope]=useState<"live"|"test">(store.sales.checkoutEnabled?"live":"test");
 const [data,setData]=useState<Report|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const load=useCallback(async()=>{setBusy(true);setError("");try{setData(await auth.request<Report>(`/api/admin/reports/sales?from=${from}&to=${to}&scope=${scope}`));}catch(e){setError(e instanceof Error?e.message:"Nie można pobrać raportu.");}finally{setBusy(false);}},[auth,from,to,scope]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(store.sales.loaded)setScope(store.sales.checkoutEnabled?"live":"test");},[store.sales.loaded,store.sales.checkoutEnabled]);
 const csv=(by:string)=>`/api/admin/reports/sales.csv?from=${from}&to=${to}&scope=${scope}&by=${by}`;
 const maxDay=Math.max(1,...(data?.by_day.map(d=>d.revenue)||[1]));
 const t=data?.totals;
 return <>
  <section className="admin-panel reports-controls"><div className="reports-presets">{presets.map(p=><button key={p.label} type="button" className={"admin-edit-button"+(from===p.from()&&to===p.to()?" active":"")} onClick={()=>{setFrom(p.from());setTo(p.to());}}>{p.label}</button>)}</div>
   <div className="reports-range"><label>Od<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>Do<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label><label className="admin-checkbox"><input type="checkbox" checked={scope==="test"} onChange={e=>setScope(e.target.checked?"test":"live")}/>Dane testowe (tryb przygotowania)</label><button type="button" className="admin-edit-button" disabled={busy} onClick={()=>void load()}><RefreshCw size={14}/>Odśwież</button></div>
   {scope==="test"&&<p className="admin-form-help">Pokazujesz zamówienia testowe i demonstracyjne sprzedaże z kasy. Po uruchomieniu sprzedaży raport liczy wyłącznie opłacone zamówienia i rzeczywiste sprzedaże z kasy.</p>}
   {error&&<p className="account-error" role="alert">{error}</p>}</section>
  {data&&t&&<>
  <section className="reports-kpis" aria-busy={busy}>
   {[["Sprzedaż",formatMoney(t.revenue),"produkty + dostawa, po rabatach"],["Zamówień i paragonów",String(t.orders),`${t.items} szt.`],["Średni koszyk",formatMoney(t.average),""],["Sklep online",formatMoney(data.by_channel.online.revenue),`${data.by_channel.online.orders} zamówień`],["Kasa",formatMoney(data.by_channel.pos.revenue),`${data.by_channel.pos.orders} sprzedaży`],["Rabaty",formatMoney(t.discount),"kody rabatowe"],["Zapłacono kartami podarunkowymi",formatMoney(t.gift_card),"część wartości sprzedaży"],["Zwroty rozliczone",formatMoney(data.refunds.amount),`${data.refunds.count} zwrotów`]].map(([label,value,note])=><div className="reports-kpi" key={label}><span>{label}</span><strong>{value}</strong>{note&&<small>{note}</small>}</div>)}
  </section>
  <section className="admin-panel"><div className="admin-list-actions"><p>Sprzedaż dziennie</p><a className="admin-edit-button" href={csv("day")} download><Download size={14}/>CSV dni</a></div>
   {data.by_day.length?<div className="admin-table-wrap"><table className="admin-table reports-days"><thead><tr><th>Dzień</th><th>Zamówień</th><th>Sklep online</th><th>Kasa</th><th>Razem</th><th className="reports-bar-head"></th></tr></thead><tbody>
    {data.by_day.map(d=><tr key={d.day}><td>{dayLabel(d.day)}</td><td>{d.orders}</td><td>{formatMoney(d.online)}</td><td>{formatMoney(d.pos)}</td><td><strong>{formatMoney(d.revenue)}</strong></td><td className="reports-bar"><i style={{width:`${Math.round(d.revenue/maxDay*100)}%`}}/></td></tr>)}
   </tbody></table></div>:<p className="admin-empty">Brak sprzedaży w tym okresie.</p>}
  </section>
  <div className="reports-columns">
   <section className="admin-panel"><div className="admin-list-actions"><p>Produkty</p><a className="admin-edit-button" href={csv("product")} download><Download size={14}/>CSV produkty</a></div>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Produkt</th><th>Sztuk</th><th>Wartość</th></tr></thead><tbody>{data.by_product.slice(0,30).map(p=><tr key={p.sku}><td>{p.name}<small className="admin-muted"> {p.sku}</small></td><td>{p.qty}</td><td>{formatMoney(p.revenue)}</td></tr>)}</tbody></table></div>{!data.by_product.length&&<p className="admin-empty">Brak sprzedanych produktów.</p>}</section>
   <section className="admin-panel"><div className="admin-list-actions"><p>Płatności</p><a className="admin-edit-button" href={csv("orders")} download><Download size={14}/>CSV zamówienia</a></div>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Metoda</th><th>Liczba</th><th>Wartość</th></tr></thead><tbody>{data.by_payment.map(p=><tr key={p.method}><td>{p.label}</td><td>{p.orders}</td><td>{formatMoney(p.revenue)}</td></tr>)}</tbody></table></div>
    <p className="admin-form-help">Plik CSV otwiera się w Excelu i LibreOffice bez konwersji (średniki, przecinek dziesiętny). Wartości brutto w PLN.</p></section>
  </div></>}
 </>;
}
