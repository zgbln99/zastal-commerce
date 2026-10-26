"use client";

import {useEffect,useRef,useState} from 'react';
import {CheckCircle2,Mail,RefreshCw} from 'lucide-react';
import {ApiError,useAuth,can} from '../../components/AuthProvider';
import {formatDate} from './Operations';
import './pos.css';

type Message={id:number;recipient:string;kind:string;status:string;attempts:number;created:number;updated:number;next_attempt:number|null;last_error:string|null;sent:number|null;order_id:number|null};
type MailStatus={configuration:{configured:boolean;host:string;port:number;from_address:string;tls:string;missing:string[]};counts:Record<string,number>;messages:Message[]};
const labels:Record<string,string>={pending:'Oczekuje',sending:'Wysyłanie',sent:'Wysłano',failed:'Błąd',retry:'Do ponowienia',cancelled:'Anulowano'};
const kinds:Record<string,string>={test_email:'Test poczty',order_created:'Potwierdzenie zamówienia',order_paid:'Płatność przyjęta',order_status_changed:'Status zamówienia',email_verification:'Weryfikacja adresu',password_reset:'Reset hasła',gift_card_issued:'Karta podarunkowa',stock_alert:'Powiadomienie o dostępności',newsletter_confirm:'Potwierdzenie newslettera',contact_received:'Wiadomość z formularza',contact_ack:'Potwierdzenie dla klienta',staff_digest:'Podsumowanie dnia'};
const previews:[string,string][]=[['order_created','Potwierdzenie zamówienia'],['order_paid','Płatność przyjęta'],['pickup_ready','Czeka na odbiór'],['shipped','Wysłane'],['email_verification','Weryfikacja adresu'],['gift_card_issued','Karta podarunkowa'],['newsletter_confirm','Newsletter'],['stock_alert','Dostępność rozmiaru'],['contact_ack','Potwierdzenie kontaktu']];
const mailDate=(epoch:number)=>formatDate(new Date(epoch*1000).toISOString());
const errorLabels:Record<string,string>={smtp_delivery_failed:'Serwer SMTP nie potwierdził dostawy.',worker_interrupted:'Przerwano proces wysyłki.',message_unavailable:'Wiadomość jest niedostępna.'};

export default function EmailCenter() {
  const auth=useAuth();
  const [data,setData]=useState<MailStatus|null>(null),[testRecipient,setTestRecipient]=useState(''),[testBusy,setTestBusy]=useState(false),[loading,setLoading]=useState(true),[busyId,setBusyId]=useState<number|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[denied,setDenied]=useState(false);
  const lifetime=useRef(0),token=useRef(0),busy=useRef(false);
  const identity=can(auth.user,'email')?auth.user!.id:null;
  const rejectAuth=(e:unknown)=>{if(e instanceof ApiError&&(e.status===401||e.status===403)&&e.code!=='csrf_invalid'){setData(null);setDenied(true);void auth.refresh().catch(()=>{});}};
  const load=async()=>{
    const session=lifetime.current,id=++token.current;setLoading(true);
    try{const value=await auth.request<MailStatus>('/api/admin/email');if(session!==lifetime.current||id!==token.current)return;if(!value?.configuration||!Array.isArray(value.messages))throw new Error('Niepoprawny stan kolejki e-mail.');setData(value);}
    catch(e){if(session===lifetime.current&&id===token.current){rejectAuth(e);setError(e instanceof Error?e.message:'Nie można odczytać poczty.');}}
    finally{if(session===lifetime.current&&id===token.current)setLoading(false);}
  };
  useEffect(()=>{lifetime.current++;setData(null);setDenied(false);setError('');if(identity!==null)void load();return()=>{lifetime.current++;token.current++;};},[identity]);
  const retry=async(id:number)=>{
    if(busy.current||identity===null||denied)return;
    busy.current=true;setBusyId(id);setError('');setNotice('');const session=lifetime.current;
    try{await auth.request('/api/admin/email/retry',{method:'POST',body:JSON.stringify({id})});if(session!==lifetime.current)return;setNotice('Wiadomość skierowano do ponowienia. Status „Wysłano” pojawi się dopiero po potwierdzeniu dostawy przez SMTP.');await load();}
    catch(e){if(session===lifetime.current){rejectAuth(e);setError(e instanceof Error?e.message:'Nie można ponowić wiadomości.');await load();}}
    finally{busy.current=false;if(session===lifetime.current)setBusyId(null);}
  };
  const sendTest=async(event:React.FormEvent)=>{event.preventDefault();if(testBusy||!testRecipient.trim())return;setTestBusy(true);setError('');setNotice('');const session=lifetime.current;
    try{await auth.request('/api/admin/email/test',{method:'POST',body:JSON.stringify({recipient:testRecipient.trim()})});if(session!==lifetime.current)return;setNotice('Wiadomość testowa trafiła do kolejki. Sprawdź jej status po odświeżeniu.');setTestRecipient('');await load();}
    catch(e){if(session===lifetime.current){rejectAuth(e);setError(e instanceof Error?e.message:'Nie można dodać testu poczty.');}}
    finally{if(session===lifetime.current)setTestBusy(false);}
  };
  if(identity===null||denied)return <p className="staff-notice">Sesja administratora wymaga odświeżenia.</p>;
  const config=data?.configuration;
  return <div className="staff-screen"><div className="staff-panel-head staff-mail-heading"><div><h2><Mail size={21}/>Poczta sklepu</h2><p>Konfiguracja wysyłki i zapisane próby doręczenia.</p></div><button className="ops-action" disabled={loading||busyId!==null} onClick={()=>{setError('');void load();}}><RefreshCw size={16}/>Odśwież</button></div>{error&&<p className="staff-error" role="alert">{error}</p>}{notice&&<p className="staff-success" role="status"><CheckCircle2 size={17}/>{notice}</p>}
    {config&&<section className="staff-panel"><div className="staff-panel-head"><h2>Konfiguracja SMTP</h2><span className={'staff-mail-status '+(config.configured?'sent':'pending')}>{config.configured?'Skonfigurowano':'Wymaga konfiguracji'}</span></div><div className="staff-notice"><span>{config.configured?'SMTP jest skonfigurowany. Dostawę realizuje osobny proces wysyłkowy; kolejka nie potwierdza uruchomienia tego procesu.':'Brak pełnej konfiguracji SMTP. Wiadomości pozostają w kolejce i nie są oznaczane jako wysłane.'}</span></div><dl className="staff-mail-config"><div><dt>Serwer</dt><dd>{config.host||'—'}</dd></div><div><dt>Port / zabezpieczenie</dt><dd>{config.port||'—'} / {config.tls||'—'}</dd></div><div><dt>Adres nadawcy</dt><dd>{config.from_address||'—'}</dd></div></dl>{config.missing?.length>0&&<p className="staff-footnote">Brakujące ustawienia środowiska: {config.missing.join(', ')}. Konfigurację zmienia się na serwerze.</p>}</section>}
    <section className="staff-panel"><div className="staff-panel-head"><h2>Szablony wiadomości</h2></div><p className="staff-footnote">Każda wiadomość wychodzi w wersji HTML w barwach sklepu (logo, zielony nagłówek, przycisk) i jako zwykły tekst. Podgląd otwiera się w nowej karcie z przykładowymi danymi.</p><div className="admin-row-actions" style={{flexWrap:'wrap',gap:8}}>{previews.map(([kind,label])=><a key={kind} className="button button-outline" href={'/api/admin/email/preview?kind='+kind} target="_blank" rel="noreferrer">{label}</a>)}</div></section>
    {config&&<form className="staff-panel" onSubmit={event=>void sendTest(event)}><div className="staff-panel-head"><h2>Wyślij wiadomość testową</h2></div><p className="staff-footnote">Podaj adres, do którego masz dostęp. Wynik próby pojawi się w kolejce poniżej.</p><div className="staff-mail-test"><input type="email" required value={testRecipient} onChange={event=>setTestRecipient(event.target.value)} placeholder="adres@domena.pl" aria-label="Adres odbiorcy testowego"/><button type="submit" className="ops-action" disabled={testBusy||!config.configured}>{testBusy?'Dodawanie…':'Wyślij test'}</button></div>{!config.configured&&<p className="staff-footnote">Przycisk będzie dostępny po podłączeniu serwera SMTP.</p>}</form>}
    {data&&<><div className="staff-mail-counts">{Object.entries(data.counts).map(([status,count])=><div className="staff-panel" key={status}><span>{labels[status]||status}</span><strong>{count}</strong></div>)}</div><section className="staff-panel"><div className="staff-panel-head"><h2>Kolejka wiadomości</h2><p>Wyświetlane są wyłącznie metadane i zamaskowane adresy.</p></div><div className="staff-mail-list">{data.messages.map(message=><article key={message.id} className="staff-mail-row"><div><strong>{kinds[message.kind]||message.kind}</strong><span>{message.recipient||'Adres niedostępny'}</span><small>#{message.id} · {mailDate(message.created)}{message.order_id?' · Zamówienie #'+message.order_id:''}</small></div><div><span className={'staff-mail-status '+message.status}>{labels[message.status]||message.status}</span><small>Próby: {message.attempts}{message.sent?' · '+mailDate(message.sent):''}</small>{message.next_attempt&&message.status!=='sent'&&<small>Kolejna próba: {mailDate(message.next_attempt)}</small>}{message.last_error&&message.status!=='sent'&&<p className="staff-mail-error">{errorLabels[message.last_error]||'Wysyłka wymaga sprawdzenia.'}</p>}</div><button className="ops-action" disabled={busyId!==null||loading||!['failed','retry'].includes(message.status)} onClick={()=>void retry(message.id)}><RefreshCw size={15}/>{busyId===message.id?'Zapisywanie…':'Ponów'}</button></article>)}</div>{!data.messages.length&&<p className="staff-empty">Brak zapisanych wiadomości.</p>}</section></>}
    {loading&&!data&&<p className="staff-empty">Wczytywanie poczty…</p>}
  </div>;
}
