"use client";
import {useCallback,useEffect,useState} from "react";
import {BellRing,Plus,RefreshCw,Rss,Tag} from "lucide-react";
import {useAuth} from "../../components/AuthProvider";
import {formatMoney} from "./Operations";
type Promo={id:number;code:string;kind:"percent"|"amount";value:number;min_subtotal:number;starts:string;ends:string;max_uses:number;uses:number;active:number;note:string;created:string};
type Alert={product_id:number;name:string;size:string;stock:number;waiting:number};
type Draft={code:string;kind:"percent"|"amount";value:string;min_subtotal:string;starts:string;ends:string;max_uses:string;note:string};
const empty:Draft={code:"",kind:"percent",value:"10",min_subtotal:"",starts:"",ends:"",max_uses:"",note:""};
const grosze=(value:string)=>Math.round(Number(value.replace(",","."))*100);
/** Promo codes (percent or amount, window, limit) and the back-in-stock waiting list. */
export default function Marketing(){
 const auth=useAuth();
 const [codes,setCodes]=useState<Promo[]>([]),[alerts,setAlerts]=useState<Alert[]>([]),[draft,setDraft]=useState<Draft>(empty);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[alertsError,setAlertsError]=useState("");
 const load=useCallback(async()=>{
  try{setCodes(await auth.request<Promo[]>("/api/admin/promo"));}catch(e){setError(e instanceof Error?e.message:"Nie można pobrać kodów.");}
  try{setAlerts(await auth.request<Alert[]>("/api/admin/stock-alerts"));setAlertsError("");}catch(e){setAlertsError(e instanceof Error?e.message:"Brak dostępu do listy powiadomień.");}
 },[auth]);
 useEffect(()=>{void load();},[load]);
 const field=<K extends keyof Draft>(key:K,value:Draft[K])=>setDraft(current=>({...current,[key]:value}));
 const create=async(e:React.FormEvent)=>{e.preventDefault();if(busy)return;setBusy(true);setError("");setMessage("");
  try{
   const payload={code:draft.code,kind:draft.kind,value:draft.kind==="percent"?Number(draft.value):grosze(draft.value),min_subtotal:draft.min_subtotal?grosze(draft.min_subtotal):0,starts:draft.starts,ends:draft.ends,max_uses:draft.max_uses?Number(draft.max_uses):0,note:draft.note,active:true};
   const saved=await auth.request<Promo>("/api/admin/promo",{method:"POST",body:JSON.stringify(payload)});
   setMessage(`Kod ${saved.code} jest aktywny.`);setDraft(empty);await load();
  }catch(e){setError(e instanceof Error?e.message:"Nie udało się zapisać kodu.");}finally{setBusy(false);}};
 const toggle=async(promo:Promo)=>{setBusy(true);setError("");try{await auth.request(`/api/admin/promo/${promo.id}`,{method:"PATCH",body:JSON.stringify({active:!promo.active})});await load();}catch(e){setError(e instanceof Error?e.message:"Nie udało się zmienić kodu.");}finally{setBusy(false);}};
 const notify=async()=>{setBusy(true);try{const result=await auth.request<{queued:number}>("/api/admin/stock-alerts/notify",{method:"POST",body:"{}"});setMessage(result.queued?`Zakolejkowano ${result.queued} powiadomień.`:"Nikt nie czeka na rozmiar, który jest już dostępny.");await load();}catch(e){setError(e instanceof Error?e.message:"Nie udało się wysłać powiadomień.");}finally{setBusy(false);}};
 const [feedUrl,setFeedUrl]=useState("/feed/produkty.xml");
 useEffect(()=>{try{setFeedUrl(window.location.origin+"/feed/produkty.xml");}catch{}},[]);
 const kindLabel=(promo:Promo)=>promo.kind==="percent"?`${promo.value}%`:formatMoney(promo.value);
 return <>
  {error&&<p className="account-error" role="alert">{error}</p>}{message&&<p className="admin-list-success" role="status">{message}</p>}
  <section className="admin-panel"><div className="admin-list-actions"><p><Tag size={16}/> Kody rabatowe działają w sklepie online; rabat liczy się od wartości produktów i zapisuje na zamówieniu.</p></div>
   <form className="account-form admin-promo-form" onSubmit={create}>
    <div className="admin-form-grid"><label>Kod<input value={draft.code} required maxLength={24} placeholder="KIBIC10" onChange={e=>field("code",e.target.value.toUpperCase())}/></label>
     <label>Rodzaj<select value={draft.kind} onChange={e=>field("kind",e.target.value as Draft["kind"])}><option value="percent">Procent od produktów</option><option value="amount">Kwota (PLN)</option></select></label>
     <label>{draft.kind==="percent"?"Rabat (%)":"Rabat (PLN)"}<input inputMode="decimal" value={draft.value} required onChange={e=>field("value",e.target.value)}/></label>
     <label>Minimalna wartość produktów (PLN)<input inputMode="decimal" value={draft.min_subtotal} placeholder="0" onChange={e=>field("min_subtotal",e.target.value)}/></label>
     <label>Ważny od<input type="date" value={draft.starts} onChange={e=>field("starts",e.target.value)}/></label>
     <label>Ważny do<input type="date" value={draft.ends} onChange={e=>field("ends",e.target.value)}/></label>
     <label>Limit użyć (0 = bez limitu)<input type="number" min="0" max="1000000" value={draft.max_uses} placeholder="0" onChange={e=>field("max_uses",e.target.value)}/></label>
     <label>Notatka wewnętrzna<input value={draft.note} maxLength={200} placeholder="np. akcja na mecz z Treflem" onChange={e=>field("note",e.target.value)}/></label></div>
    <div className="admin-form-footer"><button className="button button-dark" disabled={busy}><Plus size={16}/>Dodaj kod</button></div>
   </form>
   <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Kod</th><th>Rabat</th><th>Warunki</th><th>Użycia</th><th>Status</th><th></th></tr></thead><tbody>
    {codes.map(promo=><tr key={promo.id}><td><strong>{promo.code}</strong>{promo.note&&<small className="admin-muted"> {promo.note}</small>}</td><td>{kindLabel(promo)}</td><td>{[promo.min_subtotal?`od ${formatMoney(promo.min_subtotal)}`:"",promo.starts?`od ${promo.starts}`:"",promo.ends?`do ${promo.ends}`:""].filter(Boolean).join(", ")||"bez warunków"}</td><td>{promo.uses}{promo.max_uses?` / ${promo.max_uses}`:""}</td><td>{promo.active?"aktywny":"wyłączony"}</td><td><button className="admin-edit-button" disabled={busy} onClick={()=>void toggle(promo)}>{promo.active?"Wyłącz":"Włącz"}</button></td></tr>)}
   </tbody></table></div>{!codes.length&&<p className="admin-empty">Nie ma jeszcze kodów rabatowych.</p>}
  </section>
  <section className="admin-panel"><div className="admin-list-actions"><p><Rss size={16}/> Feed produktów dla Google Merchant Center i Meta (katalog, reklamy Shopping, Instagram): jedna pozycja na rozmiar, EAN jako GTIN, ceny brutto i dostępność z magazynu. Przed startem sprzedaży feed jest pusty. Adres do wpisania jako źródło danych: <strong>{feedUrl}</strong></p><a className="button button-outline" href="/feed/produkty.xml" target="_blank" rel="noreferrer">Otwórz feed</a></div></section>
  <section className="admin-panel"><div className="admin-list-actions"><p><BellRing size={16}/> Klienci czekający na rozmiar. Powiadomienia wychodzą automatycznie po przyjęciu towaru; tu możesz je wysłać od razu.</p><button className="admin-edit-button" disabled={busy} onClick={()=>void notify()}><RefreshCw size={14}/>Wyślij teraz</button></div>
   {alertsError?<p className="admin-empty">{alertsError}</p>:<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Produkt</th><th>Rozmiar</th><th>Stan</th><th>Czeka osób</th></tr></thead><tbody>
    {alerts.map(alert=><tr key={`${alert.product_id}-${alert.size}`}><td>{alert.name}</td><td>{alert.size}</td><td>{alert.stock} szt.</td><td><strong>{alert.waiting}</strong></td></tr>)}
   </tbody></table>{!alerts.length&&<p className="admin-empty">Nikt nie czeka na brakujący rozmiar.</p>}</div>}
  </section>
 </>;
}
