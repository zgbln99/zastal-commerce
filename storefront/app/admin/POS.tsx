"use client";

import {useEffect,useRef,useState} from 'react';
import {CheckCircle2,LockKeyhole,Plus,Printer,RefreshCw,ScanLine,Search,ShoppingBag,Trash2} from 'lucide-react';
import {useAuth,ApiError} from '../../components/AuthProvider';
import {useStore} from '../../components/StoreProvider';
import PersonalizationControls,{type PrintSelection} from '../../components/PersonalizationControls';
import {ProductImage} from '../../components/ProductCard';
import {availableQty,canCheckout,cartLineKey,extendCartLine,lineUnitPrice,normalizePersonalization,personalizationLabel,updateCartLine,type CartLine,type Product} from '../../lib/commerce.mjs';
import {resolveVariantCode} from './packing.mjs';
import {formatMoney,orderNumber} from './Operations';
import {isKnownSaleRejection,readSaleAttempt,resolveSaleAttempt,type PaymentMethod,type SaleAttempt} from './pos-state.mjs';
import './pos.css';

type SaleLine={name?:string;sku:string;size:string;qty:number;unit_price:number;personalization?:{name:string;number:string}};
type Sale={id:number;total:number;items:SaleLine[];demo:boolean;replayed?:boolean;payment_method?:PaymentMethod};
type Customer={id:number;name:string;identifier:string;active:number};
const blankPrint=(product?:Product):PrintSelection=>({mode:product?.personalization_required?'player':'none',playerId:'',name:'',number:''});

export default function POS({onSaved}:{onSaved:()=>Promise<boolean>}) {
  const auth=useAuth(),store=useStore();
  const [cart,setCart]=useState<CartLine[]>([]),[query,setQuery]=useState(''),[scan,setScan]=useState('');
  const [selectedId,setSelectedId]=useState<number|null>(null),[size,setSize]=useState(''),[print,setPrint]=useState<PrintSelection>(blankPrint());
  const [payment,setPayment]=useState<PaymentMethod>('cash'),[confirmed,setConfirmed]=useState(false);
  const [customers,setCustomers]=useState<Customer[]>([]),[customerId,setCustomerId]=useState<number|null>(null),[customerQuery,setCustomerQuery]=useState(''),[customerLoading,setCustomerLoading]=useState(true),[customerError,setCustomerError]=useState('');
  const [pending,setPending]=useState<SaleAttempt|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState<Sale|null>(null);
  const [ready,setReady]=useState(false),[storageBlocked,setStorageBlocked]=useState(false),[denied,setDenied]=useState(false);
  const pendingRef=useRef<SaleAttempt|null>(null),busyRef=useRef(false),generation=useRef(0);
  const identity=auth.user?.role==='admin'?auth.user.id:null;
  const storageKey=identity===null?'':`zastal_pos_pending_v1_admin_${identity}`;
  const selected=store.products.find(p=>p.id===selectedId);
  const locked=!!pending||busy||!ready||storageBlocked;

  useEffect(()=>{
    const session=++generation.current;setCart([]);setReceipt(null);setPending(null);pendingRef.current=null;setReady(false);setDenied(false);setStorageBlocked(false);setCustomerId(null);setCustomerQuery('');setCustomers([]);setCustomerLoading(true);setCustomerError('');
    if(identity===null)return;
    const restore=(raw:string|null)=>{
      const saved=raw?readSaleAttempt(raw):null;
      if(raw&&!saved){setStorageBlocked(true);setError('Zapis oczekującej sprzedaży jest nieczytelny. Zweryfikuj zamówienia przed rozpoczęciem kolejnej sprzedaży.');return;}
      pendingRef.current=saved;setPending(saved);if(saved){setCart(saved.payload.items);setPayment(saved.payload.payment_method);setCustomerId(saved.payload.customer_id??null);setConfirmed(true);setError('Oczekująca sprzedaż została przywrócona. Sprawdź jej wynik, ponawiając dokładnie ten sam zapis.');}
    };
    try{restore(localStorage.getItem(storageKey));setReady(true);}catch{setStorageBlocked(true);setError('Nie można zapisać bezpiecznego ponowienia w tej przeglądarce. Włącz pamięć witryny i odśwież ekran.');}
    void auth.request<Customer[]>('/api/admin/customers').then(rows=>{if(session!==generation.current)return;if(!Array.isArray(rows))throw new Error('Niepoprawna lista klientów.');setCustomers(rows.filter(row=>row.active&&Number.isSafeInteger(row.id)&&row.id>0));}).catch(e=>{if(session!==generation.current)return;setCustomers([]);setCustomerError('Nie można pobrać klientów. Sprzedaż gościnna jest nadal dostępna.');if(e instanceof ApiError&&(e.status===401||e.status===403)&&e.code!=='csrf_invalid'){setDenied(true);setReceipt(null);setCart([]);void auth.refresh().catch(()=>{});}}).finally(()=>{if(session===generation.current)setCustomerLoading(false);});
    const sync=(event:StorageEvent)=>{if(session!==generation.current||event.key!==storageKey||busyRef.current)return;if(event.newValue)restore(event.newValue);else if(pendingRef.current){setError('Oczekujący zapis rozwiązano w innym oknie. Odśwież ekran i sprawdź zamówienia przed dalszą pracą.');setStorageBlocked(true);}};
    window.addEventListener('storage',sync);return()=>{generation.current++;window.removeEventListener('storage',sync);};
  },[identity,storageKey]);

  const choose=(product:Product,nextSize='')=>{if(locked)return;setSelectedId(product.id);setSize(nextSize||(!product.sizes?'UNI':''));setPrint(blankPrint(product));setError('');};
  const add=()=>{
    if(locked||!selected)return;
    const mode=selected.personalization_enabled?print.mode:'none';
    const player=store.playersStatus==='ready'?store.players.find(p=>String(p.id)===print.playerId):undefined;
    const personalization=mode==='player'?player?{mode:'player' as const,player_id:player.id}:null:mode==='custom'?normalizePersonalization({mode:'custom',name:print.name,number:print.number}):undefined;
    if(!size){setError('Wybierz rozmiar.');return;}
    if(mode!=='none'&&!personalization){setError('Sprawdź nazwisko i numer lub wybierz zawodnika.');return;}
    const display=personalization?.mode==='custom'?{name:personalization.name,number:personalization.number}:player&&mode==='player'?{name:player.print_name,number:player.number}:undefined;
    const line:CartLine={id:selected.id,size,quantity:1,...(personalization?{personalization}:{}),...(display?{personalization_display:display}:{})};
    const next=extendCartLine(cart,line,store.products);
    if(!next){setError('Brak kolejnej sztuki tego wariantu lub przekroczono limit koszyka.');return;}
    setCart(next);setReceipt(null);setConfirmed(false);setError('');
  };
  const submit=async()=>{
    if(busyRef.current||identity===null||denied||!ready||storageBlocked)return;
    if(!pendingRef.current&&!confirmed){setError('Potwierdź przyjęcie wybranej płatności testowej.');return;}
    const attempt=resolveSaleAttempt(cart,payment,pendingRef.current,store.products,`pos_${crypto.randomUUID()}`,customerId);
    if(!attempt){setError('Sprawdź dostępność, rozmiary i nadruki.');return;}
    try{localStorage.setItem(storageKey,JSON.stringify(attempt));}catch{setStorageBlocked(true);setError('Nie zapisano danych do ponowienia. Sprzedaż nie została wysłana. Włącz pamięć witryny.');return;}
    pendingRef.current=attempt;setPending(attempt);busyRef.current=true;setBusy(true);setError('');
    const session=generation.current;
    try{
      const result=await auth.request<Sale>('/api/admin/pos/sales',{method:'POST',body:JSON.stringify({...attempt.payload,idempotency_key:attempt.key})});
      if(session!==generation.current)return;
      if(!Number.isSafeInteger(result.id)||!Number.isSafeInteger(result.total)||!Array.isArray(result.items))throw new ApiError('Nie można potwierdzić wyniku zapisu.',0);
      try{localStorage.removeItem(storageKey);}catch{setStorageBlocked(true);}
      pendingRef.current=null;setPending(null);setCart([]);setConfirmed(false);setCustomerId(null);setCustomerQuery('');setReceipt({...result,payment_method:attempt.payload.payment_method});
      void store.refresh();void onSaved();
    }catch(e){
      if(session!==generation.current)return;
      if(e instanceof ApiError&&(e.status===401||e.status===403)&&e.code!=='csrf_invalid'){setDenied(true);setReceipt(null);setCart([]);void auth.refresh().catch(()=>{});}
      if(isKnownSaleRejection(e)){
        try{localStorage.removeItem(storageKey);}catch{setStorageBlocked(true);}
        pendingRef.current=null;setPending(null);setConfirmed(false);
        setError((e instanceof Error?e.message:'Zapis odrzucony.')+' Popraw koszyk i potwierdź płatność ponownie. Kolejny zapis otrzyma nowy identyfikator.');void store.refresh();
      }else setError((e instanceof Error?e.message:'Nieznany wynik zapisu.')+' Koszyk pozostaje zablokowany. Ponów tę samą sprzedaż, aby ustalić wynik bez ponownego odjęcia stanu.');
    }finally{busyRef.current=false;if(session===generation.current)setBusy(false);}
  };
  if(identity===null||denied)return <p className="staff-notice">Sesja administratora wymaga odświeżenia.</p>;
  const rows=pending?(pending.display||pending.payload.items.map(line=>({...line,name:`Produkt #${line.id}`,unit_price:0}))):cart.map(line=>({...line,name:store.products.find(p=>p.id===line.id)?.name||`Produkt #${line.id}`,unit_price:lineUnitPrice(store.products.find(p=>p.id===line.id),line)}));
  const total=rows.reduce((sum,line)=>sum+line.unit_price*line.quantity,0);
  const products=store.products.filter(p=>`${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="staff-screen">
    <div className="staff-notice"><strong>Sprzedaż testowa</strong><span>Zapis rezerwuje magazyn. Brak fiskalizacji i połączenia z terminalem. Nie przyjmuj rzeczywistych płatności przed uruchomieniem sprzedaży.</span></div>
    {error&&<p className="staff-error" role="alert">{error}</p>}
    <div className="pos-layout"><section className="staff-panel pos-catalog"><div className="staff-panel-head"><h2>Wybierz produkt</h2><button className="ops-action" onClick={()=>void store.refresh()} disabled={busy}><RefreshCw size={15}/>Magazyn</button></div>
      <label className="staff-search"><Search size={17}/><input aria-label="Szukaj produktu POS" placeholder="Nazwa, SKU lub kategoria" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <form className="staff-scan" onSubmit={e=>{e.preventDefault();const inventory=store.products.flatMap(p=>p.variants.map(v=>({...v,name:p.name})));const variant=resolveVariantCode(scan,inventory);const product=variant&&store.products.find(p=>p.id===variant.product_id);if(!product){setError('Nie znaleziono wariantu. Sprawdź pełny SKU, EAN lub QR ZASTAL.');return;}choose(product,variant.size);setScan('');}}><label>Kod wariantu<input value={scan} onChange={e=>setScan(e.target.value)} placeholder="SKU, EAN lub QR" autoComplete="off" disabled={locked}/></label><button className="ops-action" disabled={locked||!scan.trim()}><ScanLine size={17}/>Wybierz</button></form>
      {store.status==='error'&&<p className="staff-error" role="alert">{store.error}</p>}
      <div className="pos-products">{products.map(product=><button type="button" className={'pos-product'+(selectedId===product.id?' selected':'')} key={product.id} disabled={locked||store.status!=='ready'||!product.verified} onClick={()=>choose(product)}><span className="pos-product-photo"><ProductImage product={product}/></span><span><strong>{product.name}</strong><small>{product.sku}</small><b>{formatMoney(product.price)}</b></span></button>)}</div>
      {!products.length&&<p className="staff-empty">Brak produktów dla tego wyszukiwania.</p>}
      {selected&&<fieldset className="pos-selection" disabled={locked||store.status!=='ready'}><legend>{selected.name}</legend><label>Rozmiar<select value={size} onChange={e=>setSize(e.target.value)}><option value="">Wybierz wariant</option>{selected.variants.map(variant=><option key={variant.id} value={variant.size} disabled={variant.stock===0}>{variant.size} · {variant.stock} szt.</option>)}</select></label>{selected.personalization_enabled&&<PersonalizationControls product={selected} value={print} onChange={setPrint} players={store.players} status={store.playersStatus} error={store.playersError} retry={store.refreshPlayers}/>}<button type="button" className="ops-primary" onClick={add} disabled={!size||!availableQty(selected,size)}><Plus size={17}/>Dodaj 1 sztukę</button></fieldset>}
    </section><section className="staff-panel pos-basket"><div className="staff-panel-head"><h2><ShoppingBag size={19}/>Koszyk</h2><span>{rows.reduce((sum,line)=>sum+line.quantity,0)} szt.</span></div>
      {pending&&<div className="staff-lock"><LockKeyhole size={18}/><div><strong>Oczekuje na potwierdzenie serwera</strong><p>Wznowienie zachowuje koszyk i metodę płatności. Nie potwierdzaj płatności drugi raz.</p><small>Identyfikator: {pending.key}</small></div></div>}
      <div className="pos-lines">{rows.map(line=><article key={cartLineKey(line)} className="pos-line"><div><strong>{line.name}</strong><small>{line.size} · {formatMoney(line.unit_price)} / szt.</small>{line.personalization&&<span className="staff-print-label">{personalizationLabel(line,store.players)}</span>}</div><div className="pos-line-controls"><label><span className="admin-sr-only">Ilość: {line.name}, {line.size}, {personalizationLabel(line,store.players)}</span><input type="number" min={1} max={20} value={line.quantity} disabled={locked} onChange={e=>{setCart(old=>updateCartLine(old,line.id,line.size,Number(e.target.value),line.personalization,store.products));setConfirmed(false);}}/></label><button className="pos-remove" aria-label={'Usuń '+line.name+' '+line.size+' '+personalizationLabel(line,store.players)} disabled={locked} onClick={()=>{setCart(old=>old.filter(item=>cartLineKey(item)!==cartLineKey(line)));setConfirmed(false);}}><Trash2 size={16}/></button></div></article>)}</div>
      {!rows.length&&<p className="staff-empty">Wybierz produkt i rozmiar, aby rozpocząć.</p>}
      <div className="pos-total"><span>Suma orientacyjna</span><strong>{formatMoney(total)}</strong><small>Ostateczną kwotę oblicza serwer przy zapisie.</small></div>
      <fieldset className="pos-customer" disabled={locked}><legend>Klient · opcjonalnie</legend>{pending?<p className="staff-footnote">{pending.payload.customer_id?`Przypisane konto klienta #${pending.payload.customer_id}`:'Sprzedaż gościnna'} · wybór zablokowany do ustalenia wyniku.</p>:<><label>Szukaj aktywnego konta<input value={customerQuery} onChange={e=>setCustomerQuery(e.target.value)} placeholder="Nazwisko lub e-mail" autoComplete="off" disabled={customerLoading}/></label><label>Konto klienta<select value={customerId??''} disabled={customerLoading} onChange={e=>{setCustomerId(e.target.value?Number(e.target.value):null);setConfirmed(false);}}><option value="">Sprzedaż gościnna · bez konta</option>{customers.filter(customer=>customer.id===customerId||`${customer.name} ${customer.identifier}`.toLocaleLowerCase('pl').includes(customerQuery.toLocaleLowerCase('pl'))).map(customer=><option key={customer.id} value={customer.id}>{customer.name} · {customer.identifier}</option>)}</select></label>{customerLoading&&<p>Wczytywanie kont…</p>}{customerError&&<p role="status">{customerError}</p>}<p>Przypisana sprzedaż pojawi się w historii wybranego klienta. E-mail testowy trafi do kolejki.</p></>}</fieldset>
      <fieldset className="pos-payment" disabled={locked}><legend>Metoda płatności testowej</legend><label><input type="radio" name="pos-payment" checked={payment==='cash'} onChange={()=>{setPayment('cash');setConfirmed(false);}}/>Gotówka</label><label><input type="radio" name="pos-payment" checked={payment==='terminal'} onChange={()=>{setPayment('terminal');setConfirmed(false);}}/>Zewnętrzny terminal</label><label className="pos-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>{payment==='cash'?'Potwierdzam przyjęcie gotówki w scenariuszu testowym.':'Potwierdzam pozytywny wynik płatności na zewnętrznym terminalu w scenariuszu testowym.'}</span></label></fieldset>
      <button className="ops-primary pos-submit" disabled={busy||!ready||storageBlocked||(!pending&&(!confirmed||store.status!=='ready'||!canCheckout(cart,store.products,store.players)))} onClick={()=>void submit()}>{busy?'Zapisywanie…':pending?'Sprawdź wynik / ponów ten sam zapis':'Zapisz sprzedaż testową'}<CheckCircle2 size={18}/></button>
    </section></div>
    {receipt&&<section className="staff-panel staff-sale-receipt"><div className="staff-panel-head"><div><h2>Zapisano {orderNumber(receipt.id)}</h2><p>{receipt.replayed?'Potwierdzono wcześniejszy zapis.':'Magazyn został zarezerwowany.'}</p></div><button className="ops-action" onClick={()=>window.print()}><Printer size={16}/>Drukuj podsumowanie</button></div><div className="staff-print-document"><h2>Zastal · podsumowanie sprzedaży testowej</h2><p>{orderNumber(receipt.id)} · {receipt.payment_method==='cash'?'Gotówka':'Zewnętrzny terminal'}</p><p><strong>Dokument niefiskalny. Nie jest paragonem ani fakturą.</strong></p>{receipt.items.map((line,index)=><p key={index}>{line.qty} × {line.name||line.sku} / {line.size}{line.personalization?' · '+line.personalization.name+' · nr '+line.personalization.number:''} — {formatMoney(line.unit_price*line.qty)}</p>)}<p className="staff-print-total">Razem: {formatMoney(receipt.total)}</p></div></section>}
  </div>;
}
