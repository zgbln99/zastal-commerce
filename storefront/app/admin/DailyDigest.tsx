"use client";
import {useCallback,useEffect,useState} from "react";
import {ListChecks,RefreshCw,Send} from "lucide-react";
import {useAuth} from "../../components/AuthProvider";
import {formatMoney,orderNumber} from "./Operations";
type Digest={date:string;yesterday:string;to_fulfil:{id:number;total:number;status:string}[];pickups:{id:number;customer_name:string;created:string}[];unpaid:{id:number;total:number;payment_method:string;created:string}[];returns:{id:number;order_id:number;kind:string;status:string}[];low_stock:{product_id:number;name:string;size:string;stock:number}[];sold_out:{product_id:number;name:string;size:string;waiting:number}[];stale:{product_id:number;name:string;stock:number}[];sales_yesterday:{orders:number;revenue:number;online:number;pos:number};summary:Record<string,number>};
/** "Dzisiaj do zrobienia": the same content as the daily digest e-mail, live on the dashboard. */
export default function DailyDigest({onOpenOrder,canSend}:{onOpenOrder:(id:number)=>void;canSend:boolean}){
 const auth=useAuth();
 const [data,setData]=useState<Digest|null>(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{try{setData(await auth.request<Digest>("/api/admin/digest"));setError("");}catch(e){setError(e instanceof Error?e.message:"Nie można pobrać podsumowania.");}},[auth]);
 useEffect(()=>{void load();},[load]);
 const send=async()=>{setBusy(true);setMessage("");try{const r=await auth.request<{recipient:string}>("/api/admin/digest/send",{method:"POST",body:"{}"});setMessage(`Podsumowanie wysłane na ${r.recipient}.`);}catch(e){setMessage(e instanceof Error?e.message:"Nie udało się wysłać.");}finally{setBusy(false);}};
 if(error)return <section className="admin-panel"><p className="account-error">{error}</p></section>;
 if(!data)return <section className="admin-panel"><p className="admin-empty">Wczytujemy podsumowanie dnia…</p></section>;
 const s=data.summary;
 const items:[string,number,string][]=[["Do realizacji",s.to_fulfil,"opłacone, jeszcze niespakowane"],["Czekają na odbiór",s.pickups,"spakowane, odbiór w sklepie"],["Bez płatności ponad 24 h",s.unpaid,"przelewy i nieukończone płatności"],["Otwarte zwroty",s.returns,"do decyzji lub rozliczenia"],["Kończą się",s.low_stock,"rozmiary do 3 szt."],["Wyprzedane",s.sold_out,`${s.waiting} osób czeka na powiadomienie`],["Bez sprzedaży 60 dni",s.stale,"a są na stanie"]];
 return <section className="admin-panel digest"><div className="admin-panel-head"><div><h2><ListChecks size={18}/> Dzisiaj do zrobienia</h2><p>Wczoraj: {data.sales_yesterday.orders} sprzedaży, {formatMoney(data.sales_yesterday.revenue)} (online {formatMoney(data.sales_yesterday.online)}, kasa {formatMoney(data.sales_yesterday.pos)})</p></div><div className="staff-panel-tools"><button className="admin-edit-button" onClick={()=>void load()}><RefreshCw size={14}/>Odśwież</button>{canSend&&<button className="admin-edit-button" disabled={busy} onClick={()=>void send()}><Send size={14}/>Wyślij e-mailem</button>}</div></div>
  {message&&<p className="admin-list-success" role="status">{message}</p>}
  <div className="digest-grid">{items.map(([label,count,note])=><div key={label} className={"digest-item"+(count?" has":"")}><strong>{count}</strong><span>{label}</span><small>{note}</small></div>)}</div>
  <div className="digest-lists">
   {data.pickups.length>0&&<div><h3>Czekają na odbiór</h3><ul>{data.pickups.slice(0,8).map(o=><li key={o.id}><button className="admin-text-link" onClick={()=>onOpenOrder(o.id)}>{orderNumber(o.id)}</button> {o.customer_name||"klient"}</li>)}</ul></div>}
   {data.unpaid.length>0&&<div><h3>Bez płatności</h3><ul>{data.unpaid.slice(0,8).map(o=><li key={o.id}><button className="admin-text-link" onClick={()=>onOpenOrder(o.id)}>{orderNumber(o.id)}</button> {formatMoney(o.total)} · {o.created.slice(0,10)}</li>)}</ul></div>}
   {data.low_stock.length>0&&<div><h3>Kończą się</h3><ul>{data.low_stock.slice(0,8).map(v=><li key={v.product_id+v.size}>{v.name} / {v.size} · <strong>{v.stock} szt.</strong></li>)}</ul></div>}
   {data.sold_out.length>0&&<div><h3>Wyprzedane</h3><ul>{data.sold_out.slice(0,8).map(v=><li key={v.product_id+v.size}>{v.name} / {v.size}{v.waiting?<strong> · czeka {v.waiting}</strong>:null}</li>)}</ul></div>}
  </div>
 </section>;
}
