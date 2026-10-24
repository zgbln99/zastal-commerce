"use client";

import {useEffect,useRef,useState} from 'react';
import {CheckCircle2,ClipboardCheck,Package,Printer,RefreshCw,ScanLine,Search} from 'lucide-react';
import {ScanButton} from '../../components/BarcodeScanner';
import {ApiError,useAuth,can} from '../../components/AuthProvider';
import {useStore} from '../../components/StoreProvider';
import {formatDate,formatMoney,isClosedOrder,orderNumber,StatusBadge} from './Operations';
import {fulfillmentScanCode} from './fulfillment-state.mjs';
import './pos.css';
import PrintPreview from '../../components/PrintPreview';
import StaffFullscreen from './StaffFullscreen';
import {DECORATION_LABELS,normalizePrintLayout,type DecorationMethod} from '../../lib/commerce.mjs';

type Line={line_index:number;sku:string;variant_sku?:string;ean?:string;name?:string;size?:string;qty:number;unit_price:number;picked_qty:number;printed_qty:number;checked_qty:number;print_required:boolean;production_ready?:boolean;personalization?:{name:string;number:string};production?:{design:string;status:string};decoration_method?:DecorationMethod;print_layout?:unknown;preorder?:{note:string;until:string}};
const methodLabel=(line:Line)=>line.decoration_method?DECORATION_LABELS[line.decoration_method]||line.decoration_method:'';
type WorkOrder={id:number;status:string;created:string;revision:number;items:Line[];total:number;source?:string;ready_to_pack:boolean;ready_to_handover:boolean;fulfillment?:string};
type Action='pick'|'print'|'check';
const printLabel=(line:Line)=>line.personalization?`${line.personalization.name} · nr ${line.personalization.number}`:line.production?.design||'Bez nadruku';
const validOrder=(value:WorkOrder,id:number)=>value?.id===id&&Number.isSafeInteger(value.revision)&&Array.isArray(value.items);

export default function Fulfillment({onSaved}:{onSaved:()=>Promise<boolean>}) {
  const auth=useAuth(),store=useStore();
  const [queue,setQueue]=useState<WorkOrder[]>([]),[detail,setDetail]=useState<WorkOrder|null>(null),[selectedLine,setSelectedLine]=useState<number|null>(null);
  const [printOnly,setPrintOnly]=useState(false);
  const [loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[query,setQuery]=useState(''),[scan,setScan]=useState(''),[scanAction,setScanAction]=useState<Action>('pick'),[denied,setDenied]=useState(false);
  const lifetime=useRef(0),queueToken=useRef(0),detailToken=useRef(0),busyRef=useRef(false),current=useRef<WorkOrder|null>(null),selection=useRef<number|null>(null),selectedId=useRef<number|null>(null);
  const identity=can(auth.user,'fulfillment')?auth.user!.id:null;
  const rejectAuth=(e:unknown)=>{if(e instanceof ApiError&&(e.status===401||e.status===403)&&e.code!=='csrf_invalid'){setDenied(true);setQueue([]);setDetail(null);current.current=null;void auth.refresh().catch(()=>{});return true;}return false;};
  const loadQueue=async()=>{
    const session=lifetime.current,token=++queueToken.current;setLoading(true);
    try{const rows=await auth.request<WorkOrder[]>('/api/admin/fulfillment');if(session!==lifetime.current||token!==queueToken.current)return;if(!Array.isArray(rows))throw new Error('Niepoprawna kolejka realizacji.');setQueue(rows);}
    catch(e){if(session===lifetime.current&&token===queueToken.current){rejectAuth(e);setError(e instanceof Error?e.message:'Nie można odczytać kolejki.');}}
    finally{if(session===lifetime.current&&token===queueToken.current)setLoading(false);}
  };
  const loadDetail=async(id:number,reset=true)=>{
    const session=lifetime.current,token=++detailToken.current;selectedId.current=id;setDetailLoading(true);setScan('');if(reset){setDetail(null);current.current=null;setSelectedLine(null);selection.current=null;}
    try{const value=await auth.request<WorkOrder>(`/api/admin/fulfillment/${id}`);if(session!==lifetime.current||token!==detailToken.current||selectedId.current!==id)return;if(!validOrder(value,id))throw new Error('Niepoprawne szczegóły realizacji.');current.current=value;setDetail(value);}
    catch(e){if(session===lifetime.current&&token===detailToken.current){rejectAuth(e);setDetail(null);current.current=null;setError(e instanceof Error?e.message:'Nie można odczytać zamówienia.');}}
    finally{if(session===lifetime.current&&token===detailToken.current)setDetailLoading(false);}
  };
  useEffect(()=>{lifetime.current++;setQueue([]);setDetail(null);setDenied(false);current.current=null;selection.current=null;selectedId.current=null;if(identity!==null)void loadQueue();return()=>{lifetime.current++;queueToken.current++;detailToken.current++;};},[identity]);
  const mutate=async(action:Action|'pack'|'handover',code?:string)=>{
    const order=current.current,index=selection.current;
    if(!order||busyRef.current||detailLoading||identity===null||denied||isClosedOrder(order.status))return;
    const line=order.items.find(item=>item.line_index===index);
    if(['pick','print','check'].includes(action)&&!line)return;
    const session=lifetime.current,token=detailToken.current,id=order.id;
    busyRef.current=true;setBusy(true);setError('');setNotice('');
    try{
      const completion=action==='pack'||action==='handover';
      const payload=completion?{revision:order.revision,action}:{revision:order.revision,line_index:index,action,quantity:1,...(code?{code}:{})};
      const value=await auth.request<WorkOrder>(`/api/admin/fulfillment/${id}${completion?'/complete':''}`,{method:completion?'POST':'PATCH',body:JSON.stringify(payload)});
      if(session!==lifetime.current||token!==detailToken.current||selectedId.current!==id)return;
      if(!validOrder(value,id))throw new Error('Nie można potwierdzić wyniku operacji.');
      current.current=value;setDetail(value);setScan('');setNotice(action==='handover'?'Zapisano wydanie zamówienia.':action==='pack'?'Zapisano pakowanie.':`Potwierdzono 1 sztukę pozycji ${(index??0)+1}: ${action==='pick'?'kompletacja':action==='print'?'nadruk':'kontrola'}.`);
      void loadQueue();void onSaved();
    }catch(e){
      if(session!==lifetime.current||token!==detailToken.current||selectedId.current!==id)return;
      if(rejectAuth(e))return;
      setError((e instanceof Error?e.message:'Nieznany wynik operacji.')+' Wczytano aktualny postęp. Wybierz pozycję i sprawdź liczniki przed kolejnym potwierdzeniem.');
      await loadDetail(id,true);void loadQueue();
    }finally{busyRef.current=false;if(session===lifetime.current)setBusy(false);}
  };
  if(identity===null||denied)return <p className="staff-notice">Sesja administratora wymaga odświeżenia.</p>;
  const line=detail?.items.find(item=>item.line_index===selectedLine);
  const disabled=busy||detailLoading||!detail||isClosedOrder(detail.status)||detail.status==='spakowane';
  const canPick=!!line&&line.picked_qty<line.qty;
  const canPrint=!!line&&line.print_required&&line.production_ready!==false&&line.printed_qty<line.picked_qty&&line.printed_qty<line.qty;
  const canCheck=!!line&&line.checked_qty<line.picked_qty&&line.checked_qty<line.qty&&(!line.print_required||line.checked_qty<line.printed_qty);
  const scanForm=useRef<HTMLFormElement>(null),scanQueued=useRef(false);
  useEffect(()=>{if(scanQueued.current){scanQueued.current=false;scanForm.current?.requestSubmit();}},[scan]);
  const shown=queue.filter(order=>`${orderNumber(order.id)} ${order.items.map(item=>`${item.name||item.sku} ${printLabel(item)}`).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const visible=printOnly?shown.filter(order=>order.items.some(item=>item.print_required)):shown;
  return <div className="staff-screen"><div className="staff-notice pos-mode"><strong>Realizacja i stanowisko nadruków</strong><span>Każde potwierdzenie dotyczy jednej sztuki wybranej pozycji. Dwa różne nadruki tego samego rozmiaru realizuj osobno.</span><StaffFullscreen/></div>{error&&<p className="staff-error" role="alert">{error}</p>}{notice&&<p className="staff-success" role="status"><CheckCircle2 size={17}/>{notice}</p>}
    <div className="fulfillment-layout"><section className="staff-panel fulfillment-queue"><div className="staff-panel-head"><h2>Kolejka <span>{queue.length}</span></h2><button className="ops-action" disabled={loading||busy} onClick={()=>{setError('');void loadQueue();if(selectedId.current!==null)void loadDetail(selectedId.current,true);}}><RefreshCw size={15}/>Odśwież</button></div><label className="staff-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Numer, produkt lub nadruk" aria-label="Szukaj realizacji"/></label><label className="pos-confirm fulfillment-filter"><input type="checkbox" checked={printOnly} onChange={e=>setPrintOnly(e.target.checked)}/><span>Tylko zlecenia z nadrukiem (stanowisko aplikacji)</span></label><div className="fulfillment-orders">{visible.map(order=><button key={order.id} disabled={busy} className={selectedId.current===order.id?'selected':''} onClick={()=>{setError('');setNotice('');void loadDetail(order.id,true);}}><div><strong>{orderNumber(order.id)}</strong><StatusBadge status={order.status}/></div><small>{formatDate(order.created)} · {order.source==='pos'?'POS':'Sklep'} · {order.items.reduce((sum,item)=>sum+item.qty,0)} szt.</small><p>{order.items.map(item=>item.name||item.sku).join(', ')}</p></button>)}</div>{loading&&!queue.length&&<p className="staff-empty">Wczytywanie kolejki…</p>}{!loading&&!visible.length&&<p className="staff-empty">Brak zamówień do realizacji.</p>}</section>
      <section className="staff-panel fulfillment-detail" aria-busy={busy||detailLoading}>{detailLoading&&<p className="staff-empty">Wczytywanie szczegółów…</p>}{!detail&&!detailLoading&&<div className="staff-empty"><ClipboardCheck size={30}/><p>Wybierz zamówienie z kolejki.</p></div>}{detail&&<><div className="staff-panel-head"><div><h2>{orderNumber(detail.id)}</h2><p>{formatDate(detail.created)} · rewizja {detail.revision}</p></div><StatusBadge status={detail.status}/></div>
      <div className="fulfillment-lines" role="group" aria-label="Wybierz pozycję do realizacji">{detail.items.map(item=><button key={item.line_index} disabled={busy||detailLoading} className={'fulfillment-line'+(selectedLine===item.line_index?' selected':'')} aria-pressed={selectedLine===item.line_index} onClick={()=>{selection.current=item.line_index;setSelectedLine(item.line_index);setScan('');setError('');setNotice('');}}><div><span className="staff-line-number">{item.line_index+1}</span><strong>{item.name||item.sku} / {item.size||'UNI'}</strong></div><span className="staff-print-label">{printLabel(item)}</span><small>{item.variant_sku||item.sku} · {item.qty} szt.</small><div className="fulfillment-counts"><span>Kompletacja <b>{item.picked_qty}/{item.qty}</b></span><span>Nadruk <b>{item.print_required?`${item.printed_qty}/${item.qty}`:'—'}</b></span><span>Kontrola <b>{item.checked_qty}/{item.qty}</b></span></div></button>)}</div>
      {line?<div className="fulfillment-controls"><h3>Pozycja {line.line_index+1} · {line.name||line.sku} / {line.size||'UNI'}</h3><p className="staff-print-focus">{printLabel(line)}{methodLabel(line)&&<span className="staff-method-tag">{methodLabel(line)}</span>}</p>{line.preorder&&<p className="staff-footnote">Przedsprzedaż: {line.preorder.note}{line.preorder.until?' · '+line.preorder.until:''}</p>}{(()=>{const layout=normalizePrintLayout(line.print_layout);return layout&&line.personalization?<div className="staff-print-layout"><PrintPreview layout={layout} name={line.personalization.name} number={line.personalization.number}/><small>{layout.calibrated?'Układ skalibrowany':'Układ poglądowy'}{layout.note?' · '+layout.note:''} · kolor {layout.color}</small></div>:null;})()}{line.production&&<p>Transfer: <strong>{line.production.design}</strong> · <StatusBadge status={line.production.status}/>{line.production_ready===false&&<span> Dokończ zlecenie w zakładce „Nanoszenie DTF” przed potwierdzeniem nadruku.</span>}</p>}<p>Sprawdź fizycznie rozmiar, nazwisko i numer według tej pozycji. Skan kodu wariantu nie rozpoznaje nadruku.</p><div className="fulfillment-stage-buttons"><button className="ops-action" disabled={disabled||!canPick} onClick={()=>void mutate('pick')}><Package size={16}/>Skompletowano 1 szt.</button><button className="ops-action" disabled={disabled||!canPrint} onClick={()=>void mutate('print')}><Printer size={16}/>Naniesiono nadruk 1 szt.</button><button className="ops-action" disabled={disabled||!canCheck} onClick={()=>void mutate('check')}><ClipboardCheck size={16}/>Sprawdzono 1 szt.</button></div>
      <div className="staff-scan-camera"><ScanButton onScan={code=>{scanQueued.current=true;setScan(code);}} hint="Zeskanuj kod sztuki z wybranej pozycji"/></div>
      <form ref={scanForm} className="staff-scan fulfillment-scan" onSubmit={e=>{e.preventDefault();if(!line||disabled)return;const code=fulfillmentScanCode(scan,line,store.products.flatMap(product=>product.variants));if(!code){setError('Kod nie pasuje do wybranej pozycji i rozmiaru. Nie zapisano sztuki.');return;}void mutate(scanAction,code);}}><label>Etap skanu<select value={scanAction} disabled={disabled} onChange={e=>setScanAction(e.target.value as Action)}><option value="pick">Kompletacja</option><option value="print">Nadruk</option><option value="check">Kontrola</option></select></label><label>Kod wybranego wariantu<input value={scan} disabled={disabled} onChange={e=>setScan(e.target.value)} placeholder="SKU, EAN lub QR" autoComplete="off"/></label><button className="ops-primary" disabled={disabled||!scan.trim()||!(scanAction==='pick'?canPick:scanAction==='print'?canPrint:canCheck)}><ScanLine size={16}/>Potwierdź 1 szt.</button></form></div>:<p className="staff-empty">Wybierz konkretną pozycję przed potwierdzeniem sztuki.</p>}
      <div className="fulfillment-finish"><button className="ops-primary" disabled={busy||detailLoading||!detail.ready_to_pack} onClick={()=>void mutate('pack')}><Package size={17}/>Potwierdź spakowanie</button><button className="ops-primary" disabled={busy||detailLoading||!detail.ready_to_handover} onClick={()=>void mutate('handover')}><CheckCircle2 size={17}/>Potwierdź wydanie</button><button className="ops-action" disabled={busy||detailLoading} onClick={()=>window.print()}><Printer size={17}/>Karta pracy</button></div><p className="staff-footnote">Pakowanie wymaga skompletowania i kontroli każdej sztuki oraz potwierdzenia wymaganych nadruków. Wydanie zamyka zamówienie.</p>
      <div className="staff-print-document fulfillment-ticket"><h2>Zastal · karta realizacji</h2><p>{orderNumber(detail.id)} · {formatDate(detail.created)} · rewizja {detail.revision}</p><p>Dokument roboczy, niefiskalny · {formatMoney(detail.total)}</p>{detail.items.map(item=><article key={item.line_index}><h3>{item.line_index+1}. {item.name||item.sku} / {item.size||'UNI'} × {item.qty}</h3><p><strong>{printLabel(item)}</strong>{methodLabel(item)?' · '+methodLabel(item):''}{(()=>{const layout=normalizePrintLayout(item.print_layout);return layout?` · pola: ${Object.entries(layout.areas).map(([key,box])=>`${key} ${box!.x}/${box!.y}/${box!.w}/${box!.h}%`).join(', ')} · kolor ${layout.color}${layout.note?' · '+layout.note:''}`:'';})()}</p>{item.preorder&&<p>Przedsprzedaż: {item.preorder.note}</p>}<p>SKU: {item.variant_sku||item.sku}{item.ean?' · EAN: '+item.ean:''}</p><p>Kompletacja {item.picked_qty}/{item.qty} · Nadruk {item.print_required?`${item.printed_qty}/${item.qty}`:'nie wymagany'} · Kontrola {item.checked_qty}/{item.qty}</p></article>)}</div>
      </>}</section></div></div>;
}
