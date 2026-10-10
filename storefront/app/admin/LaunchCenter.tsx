"use client";
import {useEffect,useState} from "react";
import {AlertCircle,ArrowUpRight,Building2,Check,CheckCircle2,ClipboardCheck,CreditCard,FileText,Globe2,LockKeyhole,PackageCheck,RefreshCw,Save,ShieldAlert,Truck,XCircle} from "lucide-react";
import {useAuth} from "../../components/AuthProvider";
import "./launch.css";

type Field = "seller_name"|"tax_id"|"business_address"|"support_email"|"support_phone"|"returns_address"|"terms_url"|"privacy_url"|"returns_url"|"shipping_url";
type Flag="brand_approved"|"catalog_reviewed"|"inventory_counted"|"supplier_confirmed";
type Settings=Record<Field,string>&Record<Flag,boolean>;
type CheckItem={id:string;label:string;ok:boolean;automated:boolean};
type LaunchData={phase:"prelaunch";checkout_enabled:false;sales_live:false;settings:Settings;checks:CheckItem[];completed:number;total:number;blocking:string[]};
const sections:{heading:string;intro:string;fields:{key:Field;label:string;placeholder:string}[]}[]=[
 {heading:"Dane sprzedawcy",intro:"Dane identyfikujące podmiot, który będzie formalnie prowadził sprzedaż.",fields:[
  {key:"seller_name",label:"Pełna nazwa podmiotu",placeholder:"Nazwa z rejestru CEIDG / KRS"},
  {key:"tax_id",label:"NIP",placeholder:"10 cyfr"},
  {key:"business_address",label:"Adres siedziby / dane rejestrowe",placeholder:"Ulica, nr, kod i miejscowość"},
  {key:"support_email",label:"E-mail kontaktowy sklepu",placeholder:"sklep@domena.pl"},
  {key:"support_phone",label:"Telefon kontaktowy",placeholder:"Numer kontaktowy"},
  {key:"returns_address",label:"Adres do obsługi zwrotów",placeholder:"Ulica, nr, kod i miejscowość"}
 ]},
 {heading:"Dokumenty i informacje dla klientów",intro:"Wskazujemy wyłącznie istniejące, zatwierdzone strony HTTPS. System nie generuje fikcyjnego regulaminu.",fields:[
  {key:"terms_url",label:"Regulamin sprzedaży",placeholder:"https://.../regulamin"},
  {key:"privacy_url",label:"Polityka prywatności",placeholder:"https://.../prywatnosc"},
  {key:"returns_url",label:"Odstąpienie i zwroty",placeholder:"https://.../zwroty"},
  {key:"shipping_url",label:"Warunki dostaw",placeholder:"https://.../dostawa"}
 ]}
];
const flagInfo:{key:Flag;heading:string;info:string}[]=[
 {key:"brand_approved",heading:"Identyfikacja klubu",info:"Zatwierdzono logo, zdjęcia, nazewnictwo i sposób użycia znaków klubowych."},
 {key:"catalog_reviewed",heading:"Produkty i ceny",info:"Klub sprawdził nazwy, zdjęcia, opisy, ceny oraz rozmiarówki wszystkich wystawionych produktów."},
 {key:"inventory_counted",heading:"Inwentaryzacja magazynu",info:"Zastąpiono poglądowe stany faktycznymi ilościami każdego SKU i rozmiaru."},
 {key:"supplier_confirmed",heading:"Transfery DTF",info:"Dostawcy, projekty nadruków, stany i procedury nanoszenia są zweryfikowane."}
];
export default function LaunchCenter(){
 const auth=useAuth();
 const [data,setData]=useState<LaunchData|null>(null);
 const [draft,setDraft]=useState<Settings|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 const load=async()=>{
  setBusy(true);setError("");
  try{const result=await auth.request<LaunchData>("/api/admin/launch");setData(result);setDraft(result.settings)}
  catch(e){setError(e instanceof Error?e.message:"Nie udało się pobrać konfiguracji")}
  finally{setBusy(false)}
 };
 useEffect(()=>{void load()},[auth.user?.id]);
 const save=async()=>{
  if(!draft||busy)return;
  setBusy(true);setError("");setSuccess("");
  try{const result=await auth.request<LaunchData>("/api/admin/launch",{method:"PATCH",body:JSON.stringify(draft)});
   setData(result);setDraft(result.settings);setSuccess("Ustawienia zapisane. Stan gotowości został ponownie obliczony.");
  }catch(e){setError(e instanceof Error?e.message:"Błąd zapisu")}
  finally{setBusy(false)}
 };
 const change=(key:Field,value:string)=>setDraft(x=>x?{...x,[key]:value}:x);
 const toggle=(key:Flag,value:boolean)=>setDraft(x=>x?{...x,[key]:value}:x);
 const dirty=Boolean(data&&draft&&JSON.stringify(data.settings)!==JSON.stringify(draft));
 return <div className="launch-center">
  <section className="launch-hero">
   <div><span className="launch-eyebrow">ZASTAL COMMERCE / LAUNCH MANAGEMENT</span><h2>URUCHOMIENIE<br/><em>SPRZEDAŻY.</em></h2><p>To jest zaplecze docelowego sklepu. Sprzedaż zostanie aktywowana dopiero po weryfikacji danych i podłączeniu rzeczywistych usług.</p><div className="launch-phase"><span className="launch-dot"/> TRYB PRZYGOTOWANIA · CHECKOUT ZABLOKOWANY</div></div>
   <div className="launch-score"><small>KONTROLA GOTOWOŚCI</small><strong>{data?data.completed:"—"}<span>/{data?data.total:"10"}</span></strong><p>Zweryfikowane etapy</p><div><span style={{width:data?data.completed/data.total*100+"%":"0%"}}/></div></div>
  </section>
  {error&&<p role="alert" className="launch-alert error"><AlertCircle size={18}/>{error}</p>}
  {success&&<p role="status" className="launch-alert success"><CheckCircle2 size={18}/>{success}</p>}
  {!data||!draft?<div className="launch-wait"><RefreshCw size={22}/> {busy?"Wczytujemy ustawienia…":"Brak danych konfiguracji."}</div>:<>
   <section className="launch-section"><header><div><span>01 / CONTROLS</span><h3>Lista gotowości</h3><p>Rzeczywisty status wdrożenia. Cztery integracje wymagają działania po stronie dostawców.</p></div></header><div className="launch-checks">{data.checks.map(item=><div key={item.id} className={item.ok?"complete":""}><span className="launch-check-icon">{item.ok?<Check size={17}/>:<XCircle size={18}/>}</span><div><strong>{item.label}</strong><small>{item.automated?"Wymaga integracji technicznej i testów z usługodawcą":"Kontrola dokumentów / zatwierdzenie przez klub"}</small></div><span>{item.ok?"GOTOWE":"NIEGOTOWE"}</span></div>)}</div></section>
   <div className="launch-columns"><div>
    {sections.map((section,i)=><section className="launch-section" key={section.heading}><header><div><span>{"0"+(i+2)} / MERCHANT</span><h3>{section.heading}</h3><p>{section.intro}</p></div>{i===0?<Building2 size={25}/>:<FileText size={25}/>}</header><div className="launch-fields">{section.fields.map(field=><label key={field.key}>{field.label}{field.key==="business_address"||field.key==="returns_address"?<textarea value={draft[field.key]} rows={2} maxLength={350} placeholder={field.placeholder} onChange={e=>change(field.key,e.target.value)}/>:<input type={field.key.endsWith("_url")?"url":field.key==="support_email"?"email":"text"} value={draft[field.key]} maxLength={field.key.endsWith("_url")?400:field.key==="support_email"?254:160} placeholder={field.placeholder} onChange={e=>change(field.key,e.target.value)}/>}</label>)}</div></section>)}
   </div><section className="launch-section"><header><div><span>04 / APPROVALS</span><h3>Potwierdzenia klubu</h3><p>Zaznacz dopiero po fizycznym lub formalnym sprawdzeniu każdego zakresu.</p></div><ClipboardCheck size={26}/></header><div className="launch-flags">{flagInfo.map(flag=><label key={flag.key} className={draft[flag.key]?"checked":""}><input type="checkbox" checked={draft[flag.key]} onChange={e=>toggle(flag.key,e.target.checked)}/><span><strong>{flag.heading}</strong><small>{flag.info}</small></span></label>)}</div><div className="launch-warning"><ShieldAlert size={25}/><div><strong>Warunek uruchomienia sklepu</strong><p>Nie ma tu przycisku „Włącz sprzedaż”. Operator płatności, kurierskie etykiety, wiadomości transakcyjne i rozliczenia muszą zostać rzeczywiście podłączone i przetestowane. Zaznaczenie listy nie odblokowuje płatności ani checkoutu.</p></div></div></section></div>
   <div className="launch-save"><div><strong>{dirty?"Masz niezapisane zmiany":"Konfiguracja jest aktualna"}</strong><small>Zmiany w panelu zapisują się w historii operacyjnej.</small></div><button className="launch-save-button" type="button" onClick={()=>void save()} disabled={!dirty||busy}><Save size={18}/>{busy?"ZAPISYWANIE...":"ZAPISZ USTAWIENIA"}</button></div>
  </>}
 </div>;
}
