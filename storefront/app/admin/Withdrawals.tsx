"use client";
import {useEffect,useState} from "react";
import {CheckCircle2,RefreshCw} from "lucide-react";
import {useAuth} from "../../components/AuthProvider";
import {formatDate,orderNumber} from "./Operations";
type Withdrawal={id:number;order_id:number;email:string;name:string;scope:"all"|"part";note:string;status:"zlozone"|"obsluzone";staff_note:string;created:string};
/** Statements of withdrawal sent from the storefront form; staff decide whether the right applies and mark them handled. */
export default function Withdrawals({onOpenOrder}:{onOpenOrder:(id:number)=>void}){
 const auth=useAuth();
 const [rows,setRows]=useState<Withdrawal[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(0);
 const load=async()=>{try{const data=await auth.request<{withdrawals:Withdrawal[]}>("/api/admin/withdrawals");setRows(data.withdrawals);setError("")}catch(e){setError(e instanceof Error?e.message:"Nie można pobrać oświadczeń.")}};
 useEffect(()=>{void load()},[auth.user?.id]);
 const done=async(id:number)=>{if(busy)return;setBusy(id);try{await auth.request("/api/admin/withdrawals/"+id,{method:"PATCH",body:JSON.stringify({status:"obsluzone"})});await load()}catch(e){setError(e instanceof Error?e.message:"Nie zapisano zmiany.")}finally{setBusy(0)}};
 if(!rows.length&&!error)return null;
 return <section className="admin-panel"><div className="admin-list-toolbar"><strong>Oświadczenia o odstąpieniu od umowy ({rows.length})</strong><button className="admin-edit-button" onClick={()=>void load()}><RefreshCw size={14}/>Odśwież</button></div>
  {error&&<p className="account-error" role="alert">{error}</p>}
  <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Złożone</th><th>Zamówienie</th><th>Klient</th><th>Zakres</th><th></th></tr></thead><tbody>{rows.map(item=><tr key={item.id}><td>{formatDate(item.created)}</td><td><button className="admin-edit-button" onClick={()=>onOpenOrder(item.order_id)}>{orderNumber(item.order_id)}</button></td><td>{item.name}<small>{item.email}</small></td><td>{item.scope==="all"?"Całe zamówienie":"Część: "+item.note}{item.scope==="all"&&item.note&&<small>{item.note}</small>}</td><td><button className="admin-edit-button" disabled={busy===item.id} onClick={()=>void done(item.id)}><CheckCircle2 size={14}/>Obsłużone</button></td></tr>)}</tbody></table></div>
  <p className="admin-muted">Sprawdź, czy odstąpienie przysługuje (np. nadruk wykonany według specyfikacji klienta nie podlega odstąpieniu) i odpowiedz klientowi e-mailem. Klient dostał potwierdzenie złożenia oświadczenia.</p></section>;
}
