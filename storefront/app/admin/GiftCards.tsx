"use client";
import {useCallback,useEffect,useState} from "react";
import {Gift,Plus,RefreshCw} from "lucide-react";
import {useAuth} from "../../components/AuthProvider";
import {formatMoney} from "./Operations";
type Card={id:number;code:string;initial_value:number;balance:number;status:"active"|"blocked";state:"active"|"blocked"|"expired"|"used";issued_at:string;expires_at:string;order_id:number|null;recipient_email:string;message:string;note:string;transactions?:{kind:string;amount:number;order_id:number|null;created:string;note:string}[]};
const STATE:Record<Card["state"],string>={active:"aktywna",blocked:"zablokowana",expired:"po terminie",used:"wykorzystana"};
const KIND:Record<string,string>={issue:"wydanie",redeem:"użycie",release:"zwrot po anulowaniu"};
/** Issue cards sold at the stand, see balances and history, block a lost card. */
export default function GiftCards(){
 const auth=useAuth();
 const [cards,setCards]=useState<Card[]>([]),[open,setOpen]=useState<Card|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [value,setValue]=useState("100"),[email,setEmail]=useState(""),[note,setNote]=useState(""),[text,setText]=useState(""),[expires,setExpires]=useState(""),[send,setSend]=useState(true);
 const load=useCallback(async()=>{try{setCards(await auth.request<Card[]>("/api/admin/giftcards"));}catch(e){setError(e instanceof Error?e.message:"Nie można pobrać kart.");}},[auth]);
 useEffect(()=>{void load();},[load]);
 const issue=async(e:React.FormEvent)=>{e.preventDefault();if(busy)return;setBusy(true);setError("");setMessage("");
  try{const card=await auth.request<Card>("/api/admin/giftcards",{method:"POST",body:JSON.stringify({value:Math.round(Number(value.replace(",","."))*100),recipient_email:email,message:text,note,expires_at:expires,send_email:send&&!!email})});
   setMessage(`Wydano kartę ${card.code} o wartości ${formatMoney(card.initial_value)}${send&&email?", kod wysłany e-mailem":""}.`);setEmail("");setText("");setNote("");await load();}
  catch(err){setError(err instanceof Error?err.message:"Nie udało się wydać karty.");}finally{setBusy(false);}};
 const toggle=async(card:Card)=>{setBusy(true);setError("");try{await auth.request(`/api/admin/giftcards/${card.id}`,{method:"PATCH",body:JSON.stringify({status:card.status==="blocked"?"active":"blocked"})});await load();if(open?.id===card.id)setOpen(await auth.request<Card>(`/api/admin/giftcards/${card.id}`));}catch(err){setError(err instanceof Error?err.message:"Nie udało się zmienić karty.");}finally{setBusy(false);}};
 const show=async(card:Card)=>{try{setOpen(await auth.request<Card>(`/api/admin/giftcards/${card.id}`));}catch(err){setError(err instanceof Error?err.message:"Nie można otworzyć karty.");}};
 return <>
  {error&&<p className="account-error" role="alert">{error}</p>}{message&&<p className="admin-list-success" role="status">{message}</p>}
  <section className="admin-panel"><div className="admin-list-actions"><p><Gift size={16}/> Karta sprzedana przy kasie: wydaj ją tutaj po nabiciu na kasę fiskalną. Karty kupione online wydają się same po opłaceniu.</p></div>
   <form className="account-form admin-promo-form" onSubmit={issue}><div className="admin-form-grid">
    <label>Wartość (PLN)<input inputMode="decimal" value={value} required onChange={e=>setValue(e.target.value)}/></label>
    <label>E-mail odbiorcy (opcjonalnie)<input type="email" value={email} maxLength={254} onChange={e=>setEmail(e.target.value)}/></label>
    <label>Ważna do (puste = 12 miesięcy)<input type="date" value={expires} onChange={e=>setExpires(e.target.value)}/></label>
    <label>Notatka wewnętrzna<input value={note} maxLength={200} placeholder="np. paragon 2026/10/000321" onChange={e=>setNote(e.target.value)}/></label>
    <label>Wiadomość dla obdarowanego<input value={text} maxLength={300} onChange={e=>setText(e.target.value)}/></label>
    <label className="admin-checkbox"><input type="checkbox" checked={send} onChange={e=>setSend(e.target.checked)}/>Wyślij kod e-mailem, jeśli podano adres</label></div>
    <div className="admin-form-footer"><button className="button button-dark" disabled={busy}><Plus size={16}/>Wydaj kartę</button><button type="button" className="admin-edit-button" disabled={busy} onClick={()=>void load()}><RefreshCw size={14}/>Odśwież</button></div></form>
   <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Kod</th><th>Wartość</th><th>Saldo</th><th>Stan</th><th>Ważna do</th><th>Źródło</th><th></th></tr></thead><tbody>
    {cards.map(card=><tr key={card.id}><td><button className="admin-edit-button" onClick={()=>void show(card)}>{card.code}</button>{card.recipient_email&&<small className="admin-muted"> {card.recipient_email}</small>}</td><td>{formatMoney(card.initial_value)}</td><td><strong>{formatMoney(card.balance)}</strong></td><td>{STATE[card.state]}</td><td>{card.expires_at}</td><td>{card.order_id?`zamówienie ZS-${String(card.order_id).padStart(5,"0")}`:card.note||"wydana ręcznie"}</td><td><button className="admin-edit-button" disabled={busy} onClick={()=>void toggle(card)}>{card.status==="blocked"?"Odblokuj":"Zablokuj"}</button></td></tr>)}
   </tbody></table></div>{!cards.length&&<p className="admin-empty">Nie wydano jeszcze żadnej karty.</p>}
  </section>
  {open&&<section className="admin-panel"><div className="admin-list-actions"><p><strong>{open.code}</strong> · saldo {formatMoney(open.balance)} z {formatMoney(open.initial_value)} · {STATE[open.state]}</p><button className="admin-edit-button" onClick={()=>setOpen(null)}>Zamknij</button></div>
   {open.message&&<p className="admin-muted">Wiadomość: {open.message}</p>}
   <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Data</th><th>Operacja</th><th>Kwota</th><th>Zamówienie</th><th>Notatka</th></tr></thead><tbody>
    {(open.transactions||[]).map((t,i)=><tr key={i}><td>{new Date(t.created).toLocaleString("pl-PL",{dateStyle:"medium",timeStyle:"short"})}</td><td>{KIND[t.kind]||t.kind}</td><td>{t.amount>0?"+":""}{formatMoney(t.amount)}</td><td>{t.order_id?`ZS-${String(t.order_id).padStart(5,"0")}`:""}</td><td>{t.note}</td></tr>)}
   </tbody></table></div></section>}
 </>;
}
