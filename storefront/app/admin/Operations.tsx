"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {Activity,AlertCircle,ArrowDownToLine,ArrowRight,Barcode,CheckCircle2,ClipboardCheck,Clock3,Package,Plus,Printer,RefreshCw,ScanLine,ShoppingCart,Truck,Warehouse,X} from "lucide-react";
import JsBarcode from "jsbarcode";
import {QRCodeSVG} from "qrcode.react";
import {catalog,fmt} from "../../lib/catalog";
import "./operations.css";

type Variant={id:number;product_id:number;size:string;sku:string;ean:string;stock:number;name:string;category:string;price:number};
type Batch={id:number;design:string;supplier:string;reference:string;ordered:number;received:number;available:number;cost_unit:number;created:string};
type Order={id:number;created:string;items:string;total:number;status:string};
type OrderDetail=Omit<Order,"items">&{items:{sku:string;variant_sku?:string;name:string;size:string;qty:number;unit_price:number}[];events:{id:number;status:string;created:string}[];production:Task[]};
type Task={id:number;order_id:number;line_index:number;batch_id:number;design:string;status:string;created:string;updated:string;reference:string;supplier:string};
type Event={id:number;kind:string;object_id:string;note:string;created:string};
type Movement={id:number;sku:string;delta:number;reason:string;created:string;source:string};
type Tab="orders"|"inventory"|"transfers"|"production"|"labels"|"audit";
const statuses=["nowe","potwierdzone","do_kompletacji","nanoszenie_dtf","kontrola_jakosci","spakowane","wyslane_demo","anulowane"];
const productions=["oczekuje","przygotowanie","nanoszenie","kontrola","gotowe","odrzucone"];
const PL:Record<string,string>={nowe:"Nowe",potwierdzone:"Potwierdzone",do_kompletacji:"Kompletacja",nanoszenie_dtf:"Nanoszenie DTF",kontrola_jakosci:"Kontrola jakości",spakowane:"Spakowane",wyslane_demo:"Wysłane • demo",anulowane:"Anulowane",oczekuje:"Oczekuje",przygotowanie:"Przygotowanie",nanoszenie:"Nanoszenie transferu",kontrola:"Kontrola jakości",gotowe:"Gotowe",odrzucone:"Odrzucone"};
const nice=(iso:string)=>new Date(iso).toLocaleString("pl-PL",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
function BarcodeSvg({value}:{value:string}){
 const ref=useRef<SVGSVGElement|null>(null);
 useEffect(()=>{if(ref.current)JsBarcode(ref.current,value,{format:"EAN13",height:48,width:1.3,displayValue:true,fontSize:10,margin:0})},[value]);
 return <svg ref={ref}/>;
}
function ScrollTable({children}:{children:React.ReactNode}){return <div className="ops-scroll">{children}</div>}
export default function Operations({token}:{token:string}){
 const [tab,setTab]=useState<Tab>("orders");
 const [orders,setOrders]=useState<Order[]>([]);
 const [inventory,setInventory]=useState<Variant[]>([]);
 const [batches,setBatches]=useState<Batch[]>([]);
 const [tasks,setTasks]=useState<Task[]>([]);
 const [activity,setActivity]=useState<Event[]>([]);
 const [movements,setMovements]=useState<Movement[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 const [search,setSearch]=useState("");
 const [order,setOrder]=useState<OrderDetail|null>(null);
 const [scanned,setScanned]=useState<string[]>([]);
 const [scan,setScan]=useState("");
 const [stockEdit,setStockEdit]=useState<Variant|null>(null);
 const [delta,setDelta]=useState("");
 const [reason,setReason]=useState("");
 const [batchForm,setBatchForm]=useState({design:"",supplier:"",reference:"",quantity:"",cost:""});
 const [receive,setReceive]=useState<Record<number,string>>({});
 const [prodOrder,setProdOrder]=useState("");
 const [prodLine,setProdLine]=useState("0");
 const [prodBatch,setProdBatch]=useState("");
 const [selectedLabel,setSelectedLabel]=useState(0);
 const [quantity,setQuantity]=useState(6);
 const [saving,setSaving]=useState(false);
 const [scanResult,setScanResult]=useState<Variant|null>(null);

 const api=async(path:string,method="GET",body?:unknown)=>{
  const r=await fetch("/api/admin/"+path,{method,headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},...(body?{body:JSON.stringify(body)}:{})});
  const d=await r.json();if(!r.ok)throw new Error(d.error||"Błąd operacji");return d;
 };
 const reload=async()=>{
  setLoading(true);
  try{
   const [o,v,b,t,a,m]=await Promise.all([api("orders"),api("inventory"),api("transfers"),api("production"),api("activity"),api("stock-events")]);
   setOrders(o);setInventory(v);setBatches(b);setTasks(t);setActivity(a);setMovements(m);
   setError("");
  }catch(e){setError(e instanceof Error?e.message:"Nie można pobrać danych")}
  finally{setLoading(false)}
 };
 useEffect(()=>{reload()},[token]);
 const mutate=async(path:string,method:string,body:unknown,successText:string)=>{
  setSaving(true);setError("");setSuccess("");
  try{await api(path,method,body);setSuccess(successText);await reload();return true}catch(e){setError(e instanceof Error?e.message:"Błąd");return false}finally{setSaving(false)}
 };
 const showOrder=async(id:number)=>{
  try{setScanned([]);setScan("");setOrder(await api("orders/"+id))}catch(e){setError(String(e))}
 };
 const tabs:[Tab,string,React.ReactNode][]=[
  ["orders","Centrum zamówień",<ShoppingCart size={17} key="a"/>],["inventory","Magazyn wariantów",<Warehouse size={17} key="b"/>],
  ["transfers","Zakupy transferów DTF",<Package size={17} key="c"/>],["production","Produkcja i kontrola",<ClipboardCheck size={17} key="d"/>],
  ["labels","Etykiety EAN + QR",<Barcode size={17} key="e"/>],["audit","Historia operacji",<Activity size={17} key="f"/>],
 ];
 const chosen=inventory.find(v=>v.id===selectedLabel)||inventory[0];
 const scannedMatch=(text:string)=>{
  const candidate=text.trim().replace(/^ZASTAL\|/,"");
  const v=inventory.find(x=>x.ean===candidate||x.sku.toLowerCase()===candidate.toLowerCase()||x.ean===candidate.split("|")[1]);
  setScanResult(v||null);
  return v;
 };
 const productName=(sku:string)=>catalog.find(x=>x.sku===sku)?.name||sku;
 const orderIds=orders.map(o=>String(o.id));
 const chosenOrder=orders.find(o=>String(o.id)===prodOrder);
 const chosenLines=chosenOrder?(()=>{try{return JSON.parse(chosenOrder.items) as {name:string;sku:string;qty:number;size:string}[]}catch{return []}})():[];
 const filteredOrders=orders.filter(o=>(String(o.id)+" "+o.status+" "+o.items).toLowerCase().includes(search.toLowerCase()));
 const filteredVariants=inventory.filter(v=>(v.name+" "+v.sku+" "+v.ean+" "+v.size).toLowerCase().includes(search.toLowerCase()));
 return <div className="ops">
  <div className="ops-top"><div><span className="ops-eyebrow">OPERATIONS / CONTROL CENTER / V0.3</span><h2>COMMERCE <i>360°</i></h2><p>Zamówienia, magazyn rozmiarów, zakup gotowych transferów DTF i przygotowanie wysyłek.</p></div><button className="ops-refresh" onClick={reload}><RefreshCw size={17}/> {loading?"ŁADOWANIE...":"ODŚWIEŻ DANE"}</button></div>
  <div className="ops-stats">
   <div><span>WARIANTY PRODUKTÓW</span><strong>{inventory.length}</strong><small>Rzeczywiste rozmiary i indywidualne SKU</small></div>
   <div><span>ZAMÓWIENIA DO OBSŁUGI</span><strong>{orders.filter(o=>!["anulowane","wyslane_demo"].includes(o.status)).length}</strong><small>Pozycje w aktywnym procesie</small></div>
   <div><span>GOTOWE TRANSFERY DTF</span><strong>{batches.reduce((a,b)=>a+b.available,0)}</strong><small>Dostępne do nanoszenia na odzież</small></div>
   <div><span>NISKIE STANY WARIANTÓW</span><strong>{inventory.filter(v=>v.stock<=2).length}</strong><small>Warianty z zapasem 0–2 szt.</small></div>
  </div>
  <div className="ops-tabs">{tabs.map(([id,name,icon])=><button key={id} className={tab===id?"selected":""} onClick={()=>{setTab(id);setSearch("");setError("");setSuccess("")}}>{icon}<span>{name}</span></button>)}</div>
  {error&&<div className="ops-message ops-error"><AlertCircle size={18}/>{error}<button onClick={()=>setError("")}><X size={15}/></button></div>}
  {success&&<div className="ops-message ops-success"><CheckCircle2 size={18}/>{success}<button onClick={()=>setSuccess("")}><X size={15}/></button></div>}
  {(tab==="orders"||tab==="inventory")&&<div className="ops-search"><ScanLine size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={tab==="orders"?"Szukaj zamówienia, produktu lub statusu":"Szukaj po SKU, rozmiarze, EAN lub nazwie produktu"}/><span>SEARCH / FILTER</span></div>}
  {tab==="orders"&&<section className="ops-panel"><div className="ops-panel-head"><div><span>FULFILLMENT</span><h3>Wszystkie zamówienia <em>({filteredOrders.length})</em></h3></div><small>KAŻDY STATUS ZAPISYWANY W HISTORII</small></div><ScrollTable><table className="ops-table"><thead><tr><th>ZAMÓWIENIE</th><th>POZYCJE</th><th>WARTOŚĆ</th><th>STATUS</th><th>AKCJA</th></tr></thead><tbody>{filteredOrders.map(o=><tr key={o.id}><td><strong>ZS-{String(o.id).padStart(5,"0")}</strong><small>{nice(o.created)}</small></td><td>{(()=>{try{return JSON.parse(o.items).map((x:{name?:string;sku:string;qty:number;size:string})=>x.qty+" × "+(x.name||productName(x.sku))+" / "+x.size).join(", ")}catch{return "—"}})()}</td><td><strong>{fmt(o.total)}</strong></td><td><span className={"ops-pill "+o.status}>{PL[o.status]||o.status}</span></td><td><button className="ops-action" onClick={()=>showOrder(o.id)}>OTWÓRZ <ArrowRight size={15}/></button></td></tr>)}</tbody></table></ScrollTable>{!filteredOrders.length&&<p className="ops-empty">Brak zamówień spełniających kryteria.</p>}</section>}
  {tab==="inventory"&&<section className="ops-panel"><div className="ops-panel-head"><div><span>STOCK MANAGEMENT</span><h3>Stany według rozmiaru <em>({filteredVariants.length})</em></h3></div><small>EAN / SKU / ŚLAD MAGAZYNOWY</small></div><ScrollTable><table className="ops-table"><thead><tr><th>PRODUKT</th><th>WARIANT</th><th>IDENTYFIKATOR EAN</th><th>STAN</th><th>OPERACJE</th></tr></thead><tbody>{filteredVariants.map(v=><tr key={v.id}><td><strong>{v.name}</strong><small>{v.category}</small></td><td><span className="ops-code">{v.size}</span><small>{v.sku}</small></td><td><span className="ops-monospaced">{v.ean}</span></td><td><span className={"ops-quantity "+(v.stock<=2?"warning":"")}>{v.stock} szt.</span></td><td><button className="ops-action" onClick={()=>{setStockEdit(v);setDelta("");setReason("")}}>KOREKTA <Plus size={15}/></button></td></tr>)}</tbody></table></ScrollTable></section>}
  {tab==="transfers"&&<div className="ops-two"><section className="ops-panel"><div className="ops-panel-head"><div><span>SUPPLIER / PROCUREMENT</span><h3>Zamów nową partię</h3></div></div><form className="ops-form" onSubmit={async e=>{e.preventDefault();const ok=await mutate("transfers","POST",{design:batchForm.design,supplier:batchForm.supplier,reference:batchForm.reference,quantity:Number(batchForm.quantity),cost_unit:Math.round(Number(batchForm.cost)*100)},"Zapisano zamówienie transferów. Oczekuje na dostawę.");if(ok)setBatchForm({design:"",supplier:"",reference:"",quantity:"",cost:""})}}><label>NAZWA PROJEKTU / WZORU<input required maxLength={100} value={batchForm.design} onChange={e=>setBatchForm({...batchForm,design:e.target.value})} placeholder="Np. Zastal Classic / przód"/></label><label>DOSTAWCA<input required maxLength={100} value={batchForm.supplier} onChange={e=>setBatchForm({...batchForm,supplier:e.target.value})} placeholder="Nazwa dostawcy DTF"/></label><label>NUMER ZAMÓWIENIA U DOSTAWCY<input value={batchForm.reference} maxLength={80} onChange={e=>setBatchForm({...batchForm,reference:e.target.value})} placeholder="DTF-2026-001"/></label><div className="ops-form-cols"><label>LICZBA TRANSFERÓW<input type="number" required min={1} max={100000} value={batchForm.quantity} onChange={e=>setBatchForm({...batchForm,quantity:e.target.value})}/></label><label>KOSZT 1 SZT. / PLN<input type="number" min={0} step=".01" value={batchForm.cost} onChange={e=>setBatchForm({...batchForm,cost:e.target.value})}/></label></div><button className="ops-primary" disabled={saving}>UTWÓRZ ZAMÓWIENIE <Plus size={18}/></button></form><div className="ops-info">Klub kupuje gotowe nadruki od dostawcy. System ewidencjonuje zamówienie i osobno potwierdza fizyczne przyjęcie. Nie drukujemy transferów na miejscu.</div></section><section className="ops-panel"><div className="ops-panel-head"><div><span>DTF STOCK / DELIVERY</span><h3>Partie i dostawy <em>({batches.length})</em></h3></div></div><div className="ops-batch-list">{batches.map(b=><article className="ops-batch" key={b.id}><div><strong>#{String(b.id).padStart(3,"0")} / {b.design}</strong><small>{b.supplier} · {b.reference||"Bez referencji"}</small></div><div className="ops-batch-chips"><span>ZAMÓWIONE <b>{b.ordered}</b></span><span>PRZYJĘTE <b>{b.received}</b></span><span>DOSTĘPNE <b>{b.available}</b></span></div>{b.received<b.ordered&&<form className="ops-receive" onSubmit={async e=>{e.preventDefault();const ok=await mutate("transfers/"+b.id+"/receive","PATCH",{quantity:Number(receive[b.id]||0)},"Potwierdzono przyjęcie nadruków.");if(ok)setReceive(x=>({...x,[b.id]:""}))}}><input type="number" min={1} max={b.ordered-b.received} value={receive[b.id]||""} onChange={e=>setReceive(x=>({...x,[b.id]:e.target.value}))} placeholder={"Max "+(b.ordered-b.received)}/><button disabled={saving}>PRZYJMIJ DOSTAWĘ <ArrowDownToLine size={16}/></button></form>}</article>)}</div></section></div>}
  {tab==="production"&&<div className="ops-two"><section className="ops-panel"><div className="ops-panel-head"><div><span>ORDER → HEAT PRESS → QC</span><h3>Nowe zlecenie nanoszenia</h3></div></div><form className="ops-form" onSubmit={async e=>{e.preventDefault();const ok=await mutate("production","POST",{order_id:Number(prodOrder),line_index:Number(prodLine),batch_id:Number(prodBatch)},"Zlecenie utworzone i transfery zarezerwowane.");if(ok){setProdOrder("");setProdBatch("");setProdLine("0")}}}><label>ZAMÓWIENIE TESTOWE<select required value={prodOrder} onChange={e=>{setProdOrder(e.target.value);setProdLine("0")}}><option value="">Wybierz zamówienie</option>{orders.filter(o=>!["wyslane_demo","anulowane"].includes(o.status)).map(o=><option key={o.id} value={o.id}>ZS-{String(o.id).padStart(5,"0")} · {PL[o.status]}</option>)}</select></label><label>POZYCJA ZAMÓWIENIA<select value={prodLine} onChange={e=>setProdLine(e.target.value)}>{chosenLines.map((l,i)=><option key={i} value={i}>{i+1}. {l.name||productName(l.sku)} / {l.size} × {l.qty}</option>)}</select></label><label>GOTOWY TRANSFER / PARTIA<select required value={prodBatch} onChange={e=>setProdBatch(e.target.value)}><option value="">Wybierz partię</option>{batches.filter(b=>b.available>0).map(b=><option key={b.id} value={b.id}>#{b.id} {b.design} · {b.available} szt. dostępnych</option>)}</select></label><button className="ops-primary" disabled={saving||!prodOrder||!prodBatch}>PRZYDZIEL TRANSFER <ArrowRight size={17}/></button></form><div className="ops-info">Zlecenie rezerwuje liczbę transferów odpowiadającą ilości produktu w zamówieniu. Stany są pomniejszane transakcyjnie.</div></section><section className="ops-panel"><div className="ops-panel-head"><div><span>PRODUCTION BOARD</span><h3>Kolejka produkcji <em>({tasks.length})</em></h3></div></div><div className="ops-tasks">{tasks.map(t=><article className="ops-task" key={t.id}><div><strong>DTF-{String(t.id).padStart(4,"0")}</strong><span className={"ops-pill "+t.status}>{PL[t.status]||t.status}</span></div><h4>{t.design}</h4><p>Zamówienie ZS-{String(t.order_id).padStart(5,"0")} / poz. {t.line_index+1}<br/>{t.supplier} · {t.reference}</p><label>ETAP ZLECENIA<select value={t.status} disabled={saving||["gotowe","odrzucone"].includes(t.status)} onChange={e=>mutate("production/"+t.id,"PATCH",{status:e.target.value},"Zaktualizowano etap produkcji.")}>{productions.map(v=><option key={v} value={v}>{PL[v]}</option>)}</select></label></article>)}{!tasks.length&&<p className="ops-empty">Brak zleceń produkcyjnych.</p>}</div></section></div>}
  {tab==="labels"&&<div className="ops-two"><section className="ops-panel"><div className="ops-panel-head"><div><span>LABEL STATION / GS1 RESTRICTED</span><h3>Druk etykiet produktów</h3></div></div><div className="ops-form"><label>WARIANT / SKU<select value={selectedLabel} onChange={e=>setSelectedLabel(Number(e.target.value))}>{inventory.map(v=><option key={v.id} value={v.id}>{v.sku} · {v.name}</option>)}</select></label><label>LICZBA ETYKIET A4<input type="number" min={1} max={48} value={quantity} onChange={e=>setQuantity(Math.max(1,Math.min(48,Number(e.target.value)||1)))}/></label><button className="ops-primary" onClick={()=>window.print()} disabled={!chosen}><Printer size={18}/> DRUKUJ {quantity} ETYKIET</button></div><div className="ops-scan"><label>SKANER / WERYFIKACJA KODU<input value={scan} onChange={e=>setScan(e.target.value)} onKeyDown={e=>e.key==="Enter"&&scannedMatch(scan)} placeholder="Zeskanuj EAN lub wpisz SKU"/></label><button onClick={()=>scannedMatch(scan)}><ScanLine size={17}/> WERYFIKUJ</button>{scanResult&&<p><CheckCircle2 size={16}/> {scanResult.name}, rozmiar {scanResult.size}, stan: {scanResult.stock} szt.</p>}</div><div className="ops-info">Prefiks EAN-13 200 służy wyłącznie do identyfikacji wewnętrznej. Kody nie są globalnymi numerami GTIN z GS1.</div></section><section className="ops-panel"><div className="ops-panel-head"><div><span>THERMAL / A4 PRINT PREVIEW</span><h3>Etykieta 60 × 40 mm</h3></div></div><div className="ops-label-stage">{chosen&&<Label variant={chosen}/>}</div>{chosen&&<div className="ops-label-detail"><b>{chosen.name}</b><span>{chosen.sku} / {chosen.size} / {chosen.ean}</span></div>}</section><div className="print-area">{chosen&&Array.from({length:quantity},(_,i)=><Label key={i} variant={chosen}/>)}</div></div>}
  {tab==="audit"&&<div className="ops-two"><section className="ops-panel"><div className="ops-panel-head"><div><span>CHANGELOG / AUDIT</span><h3>Historia działań</h3></div></div><div className="ops-log">{activity.map(e=><div key={e.id}><Clock3 size={16}/><span><b>{e.kind.toUpperCase()} #{e.object_id}</b>{e.note}<small>{nice(e.created)}</small></span></div>)}{!activity.length&&<p className="ops-empty">Brak operacji.</p>}</div></section><section className="ops-panel"><div className="ops-panel-head"><div><span>INVENTORY LEDGER</span><h3>Ruchy magazynowe</h3></div></div><div className="ops-log">{movements.map(m=><div key={m.id}><Warehouse size={16}/><span><b>{m.sku} <em>{m.delta>0?"+":""}{m.delta}</em></b>{m.reason}<small>{nice(m.created)} · {m.source}</small></span></div>)}{!movements.length&&<p className="ops-empty">Brak ruchów magazynowych.</p>}</div></section></div>}
  {stockEdit&&<div className="ops-overlay" onClick={()=>setStockEdit(null)}><div className="ops-modal ops-stock-modal" onClick={e=>e.stopPropagation()}><button className="ops-close" onClick={()=>setStockEdit(null)}><X/></button><span className="ops-eyebrow">INVENTORY / ADJUSTMENT</span><h2>KOREKTA STANU.</h2><h3>{stockEdit.name} / {stockEdit.size}</h3><p>SKU: {stockEdit.sku} • stan bieżący: {stockEdit.stock} szt.</p><form onSubmit={async e=>{e.preventDefault();const ok=await mutate("inventory/"+stockEdit.id,"PATCH",{delta:Number(delta),reason},"Zapisano ruch magazynowy i zaktualizowano dostępność.");if(ok)setStockEdit(null)}}><label>ZMIANA W SZTUKACH<input type="number" required min={-5000} max={5000} value={delta} onChange={e=>setDelta(e.target.value)} placeholder="+10 lub -2"/></label><label>UZASADNIENIE<input required minLength={3} maxLength={150} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Dostawa, remanent, uszkodzenie..."/></label><button disabled={saving} className="ops-primary">ZAPISZ KOREKTĘ <CheckCircle2 size={17}/></button></form></div></div>}
  {order&&<div className="ops-overlay" onClick={()=>setOrder(null)}><div className="ops-modal ops-order-modal" onClick={e=>e.stopPropagation()}><button className="ops-close" onClick={()=>setOrder(null)}><X/></button><span className="ops-eyebrow">ORDER DETAIL / TRACEABILITY</span><h2>ZAMÓWIENIE<br/>ZS-{String(order.id).padStart(5,"0")}.</h2><p>Utworzono {nice(order.created)} · wartość {fmt(order.total)}</p><div className="ops-order-status"><label>STATUS REALIZACJI</label><select value={order.status} onChange={async e=>{const ok=await mutate("orders/"+order.id,"PATCH",{status:e.target.value},"Zmiana statusu zapisana w historii.");if(ok)showOrder(order.id)}}>{statuses.map(x=><option key={x} value={x}>{PL[x]}</option>)}</select></div><h3>POZYCJE W ZAMÓWIENIU</h3>{order.items.map((l,i)=><div className="ops-order-line" key={i}><div><strong>{l.name||productName(l.sku)}</strong><small>{l.variant_sku||l.sku} / {l.size||"UNI"}</small></div><b>{l.qty} × {fmt(l.unit_price)}</b></div>)}<h3>SKANOWANIE DO PAKOWANIA</h3><p>Wpisz lub zeskanuj SKU lub EAN wariantu. Każde dopasowanie oznacza zweryfikowaną pozycję w tej sesji.</p><div className="ops-scan-order"><input value={scan} onChange={e=>setScan(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){const v=scannedMatch(scan);if(v&&order.items.some(l=>l.variant_sku===v.sku||l.sku===v.sku||l.sku===v.sku.split("-").slice(0,-1).join("-")))setScanned(x=>[...x,v.sku]);setScan("")}}} placeholder="EAN / SKU i Enter"/><ScanLine size={19}/></div><p className="ops-verified">{new Set(scanned).size} wariantów zweryfikowanych w tej sesji.</p><h3>HISTORIA ZAMÓWIENIA</h3><div className="ops-timeline">{order.events.map(e=><div key={e.id}><span/><p><b>{PL[e.status]||e.status}</b><small>{nice(e.created)}</small></p></div>)}</div><button className="ops-primary" onClick={()=>setOrder(null)}>ZAMKNIJ SZCZEGÓŁY <ArrowRight size={17}/></button></div></div>}
 </div>;
}
function Label({variant}:{variant:Variant}){
 return <div className="printed-label"><div className="printed-label-name"><b>ZASTAL<span>.</span></b><small>STOCK LABEL</small></div><strong>{variant.name} / {variant.size}</strong><div className="label-codes"><div><BarcodeSvg value={variant.ean}/></div><QRCodeSVG value={["ZASTAL",variant.sku,variant.ean].join("|")} size={68}/></div><div className="printed-label-foot"><span>{variant.sku}</span><span>{fmt(variant.price)}</span></div></div>;
}
