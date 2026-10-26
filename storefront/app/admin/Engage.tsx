"use client";
import {useCallback,useEffect,useState} from "react";
import {Check,Mail,MessageSquare,RefreshCw,Star,X} from "lucide-react";
import {useAuth} from "../../components/AuthProvider";
import {formatDate} from "./Operations";
type Review={id:number;product_id:number;product_name:string;author:string;email:string;rating:number;content:string;status:"pending"|"approved"|"rejected";verified:number;created:string;reply:string;moderated_by:string};
type Subscriber={id:number;email:string;status:"pending"|"confirmed"|"unsubscribed";source:string;created:string;confirmed_at:string|null;unsubscribed_at:string|null};
type Message={id:number;name:string;email:string;topic:string;message:string;order_ref:string;created:string;status:"new"|"answered"|"closed";note:string};
const REVIEW:Record<Review["status"],string>={pending:"do sprawdzenia",approved:"opublikowana",rejected:"odrzucona"};
const SUB:Record<Subscriber["status"],string>={pending:"czeka na potwierdzenie",confirmed:"potwierdzony",unsubscribed:"wypisany"};
const MSG:Record<Message["status"],string>={new:"nowa",answered:"odpowiedziano",closed:"zamknięta"};
const stars=(n:number)=>"★".repeat(n)+"☆".repeat(5-n);

/** Opinions waiting for approval, replies, and the publish/reject decision. */
export function Reviews(){
 const auth=useAuth();
 const [rows,setRows]=useState<Review[]>([]),[filter,setFilter]=useState<""|Review["status"]>("pending"),[error,setError]=useState(""),[busy,setBusy]=useState(0),[reply,setReply]=useState<Record<number,string>>({});
 const load=useCallback(async()=>{try{setRows(await auth.request<Review[]>("/api/admin/reviews"+(filter?"?status="+filter:"")));setError("");}catch(e){setError(e instanceof Error?e.message:"Nie można pobrać opinii.");}},[auth.request,filter]);
 useEffect(()=>{void load();},[load]);
 const moderate=async(review:Review,status:Review["status"]|null)=>{setBusy(review.id);setError("");try{await auth.request(`/api/admin/reviews/${review.id}`,{method:"PATCH",body:JSON.stringify({...(status?{status}:{}),...(reply[review.id]!==undefined?{reply:reply[review.id]}:{})})});await load();}catch(e){setError(e instanceof Error?e.message:"Nie udało się zapisać decyzji.");}finally{setBusy(0);}};
 return <>
  {error&&<p className="account-error" role="alert">{error}</p>}
  <section className="admin-panel"><div className="admin-list-actions"><p><Star size={16}/> Opinie pojawiają się w sklepie dopiero po zatwierdzeniu. „Potwierdzony zakup” oznacza opłacone zamówienie z tym produktem na ten adres.</p><div className="reports-presets">{([["pending","Do sprawdzenia"],["approved","Opublikowane"],["rejected","Odrzucone"],["","Wszystkie"]] as const).map(([value,label])=><button key={value} type="button" className={filter===value?"active":""} onClick={()=>setFilter(value)}>{label}</button>)}<button type="button" className="icon-btn" aria-label="Odśwież" onClick={()=>void load()}><RefreshCw size={15}/></button></div></div>
   {rows.length?<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Data</th><th>Produkt</th><th>Ocena</th><th>Autor</th><th>Treść i odpowiedź</th><th>Stan</th><th>Decyzja</th></tr></thead><tbody>
    {rows.map(r=><tr key={r.id}><td>{formatDate(r.created)}</td><td>{r.product_name}</td><td aria-label={`${r.rating} na 5`}>{stars(r.rating)}</td><td>{r.author}<br/><small>{r.email}{r.verified?" · potwierdzony zakup":""}</small></td>
     <td style={{maxWidth:420,whiteSpace:"pre-wrap"}}>{r.content}<label style={{display:"block",marginTop:8}}><small>Odpowiedź sklepu</small><input value={reply[r.id]??r.reply} maxLength={1000} placeholder="Opcjonalnie" onChange={e=>setReply(c=>({...c,[r.id]:e.target.value}))}/></label></td>
     <td><span className={"ops-pill review-"+r.status}>{REVIEW[r.status]}</span>{r.moderated_by&&<><br/><small>{r.moderated_by}</small></>}</td>
     <td><div className="admin-row-actions">{r.status!=="approved"&&<button className="ops-primary" disabled={busy===r.id} onClick={()=>moderate(r,"approved")}><Check size={14}/> Publikuj</button>}{r.status!=="rejected"&&<button className="button button-outline" disabled={busy===r.id} onClick={()=>moderate(r,"rejected")}><X size={14}/> Odrzuć</button>}{r.status==="approved"&&reply[r.id]!==undefined&&reply[r.id]!==r.reply&&<button className="button button-outline" disabled={busy===r.id} onClick={()=>moderate(r,null)}>Zapisz odpowiedź</button>}</div></td></tr>)}
   </tbody></table></div>:<p className="account-empty">Brak opinii w tym widoku.</p>}
  </section>
 </>;
}

/** Newsletter list with status, source and CSV export for the mailing tool. */
export function Newsletter(){
 const auth=useAuth();
 const [rows,setRows]=useState<Subscriber[]>([]),[filter,setFilter]=useState<""|Subscriber["status"]>("confirmed"),[error,setError]=useState(""),[busy,setBusy]=useState(0);
 const load=useCallback(async()=>{try{setRows(await auth.request<Subscriber[]>("/api/admin/subscribers"+(filter?"?status="+filter:"")));setError("");}catch(e){setError(e instanceof Error?e.message:"Nie można pobrać listy.");}},[auth.request,filter]);
 useEffect(()=>{void load();},[load]);
 const remove=async(row:Subscriber)=>{if(!window.confirm(`Wypisać ${row.email} z newslettera?`))return;setBusy(row.id);try{await auth.request(`/api/admin/subscribers/${row.id}`,{method:"PATCH",body:JSON.stringify({status:"unsubscribed"})});await load();}catch(e){setError(e instanceof Error?e.message:"Nie udało się wypisać adresu.");}finally{setBusy(0);}};
 const confirmed=rows.filter(r=>r.status==="confirmed").length;
 return <>
  {error&&<p className="account-error" role="alert">{error}</p>}
  <section className="admin-panel"><div className="admin-list-actions"><p><Mail size={16}/> Zapis wymaga kliknięcia linku z e-maila (podwójne potwierdzenie). Wysyłkę kampanii robisz w swoim narzędziu mailingowym z pliku CSV; każda wiadomość musi mieć link wypisania.</p><div className="reports-presets">{([["confirmed","Potwierdzeni"],["pending","Oczekujący"],["unsubscribed","Wypisani"],["","Wszyscy"]] as const).map(([value,label])=><button key={value} type="button" className={filter===value?"active":""} onClick={()=>setFilter(value)}>{label}</button>)}<a className="button button-outline" href={"/api/admin/subscribers.csv"+(filter?"?status="+filter:"")} download>Pobierz CSV</a></div></div>
   <p className="quiet-note">{filter==="confirmed"||!filter?`${confirmed} potwierdzonych adresów`:`${rows.length} adresów`}</p>
   {rows.length?<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>E-mail</th><th>Stan</th><th>Źródło</th><th>Zapis</th><th>Potwierdzenie</th><th></th></tr></thead><tbody>
    {rows.map(r=><tr key={r.id}><td>{r.email}</td><td><span className={"ops-pill sub-"+r.status}>{SUB[r.status]}</span></td><td>{r.source==="checkout"?"zamówienie":r.source==="footer"?"stopka":r.source}</td><td>{formatDate(r.created)}</td><td>{r.confirmed_at?formatDate(r.confirmed_at):"—"}</td><td>{r.status!=="unsubscribed"&&<button className="button button-outline" disabled={busy===r.id} onClick={()=>remove(r)}>Wypisz</button>}</td></tr>)}
   </tbody></table></div>:<p className="account-empty">Brak adresów w tym widoku.</p>}
  </section>
 </>;
}

/** Messages from the contact form: who wrote, about which order, and whether someone answered. */
export function Messages(){
 const auth=useAuth();
 const [rows,setRows]=useState<Message[]>([]),[filter,setFilter]=useState<""|Message["status"]>("new"),[error,setError]=useState(""),[busy,setBusy]=useState(0),[note,setNote]=useState<Record<number,string>>({});
 const load=useCallback(async()=>{try{setRows(await auth.request<Message[]>("/api/admin/contact"+(filter?"?status="+filter:"")));setError("");}catch(e){setError(e instanceof Error?e.message:"Nie można pobrać wiadomości.");}},[auth.request,filter]);
 useEffect(()=>{void load();},[load]);
 const update=async(row:Message,status:Message["status"])=>{setBusy(row.id);try{await auth.request(`/api/admin/contact/${row.id}`,{method:"PATCH",body:JSON.stringify({status,...(note[row.id]!==undefined?{note:note[row.id]}:{})})});await load();}catch(e){setError(e instanceof Error?e.message:"Nie udało się zapisać.");}finally{setBusy(0);}};
 return <>
  {error&&<p className="account-error" role="alert">{error}</p>}
  <section className="admin-panel"><div className="admin-list-actions"><p><MessageSquare size={16}/> Każda wiadomość trafia też e-mailem na adres obsługi sklepu. Odpowiadasz ze swojej poczty, a tutaj oznaczasz, że sprawa jest załatwiona.</p><div className="reports-presets">{([["new","Nowe"],["answered","Odpowiedziane"],["closed","Zamknięte"],["","Wszystkie"]] as const).map(([value,label])=><button key={value} type="button" className={filter===value?"active":""} onClick={()=>setFilter(value)}>{label}</button>)}</div></div>
   {rows.length?<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Data</th><th>Od</th><th>Temat</th><th>Treść</th><th>Notatka</th><th>Stan</th><th></th></tr></thead><tbody>
    {rows.map(r=><tr key={r.id}><td>{formatDate(r.created)}</td><td>{r.name}<br/><small><a href={`mailto:${r.email}?subject=${encodeURIComponent("Re: "+(r.topic||"Wiadomość ze sklepu Zastal"))}`}>{r.email}</a></small></td><td>{r.topic}{r.order_ref&&<><br/><small>{r.order_ref}</small></>}</td><td style={{maxWidth:420,whiteSpace:"pre-wrap"}}>{r.message}</td>
     <td><input value={note[r.id]??r.note} maxLength={1000} placeholder="np. odpisano 12.11" onChange={e=>setNote(c=>({...c,[r.id]:e.target.value}))}/></td><td><span className={"ops-pill msg-"+r.status}>{MSG[r.status]}</span></td>
     <td><div className="admin-row-actions">{r.status!=="answered"&&<button className="ops-primary" disabled={busy===r.id} onClick={()=>update(r,"answered")}>Odpowiedziano</button>}{r.status!=="closed"&&<button className="button button-outline" disabled={busy===r.id} onClick={()=>update(r,"closed")}>Zamknij</button>}</div></td></tr>)}
   </tbody></table></div>:<p className="account-empty">Brak wiadomości w tym widoku.</p>}
  </section>
 </>;
}
