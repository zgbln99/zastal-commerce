"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {ArrowDown,ArrowUp,CalendarClock,Check,CheckCircle2,Copy,Eye,EyeOff,GripVertical,History,ImagePlus,Layers3,Maximize2,Minimize2,Monitor,Plus,RefreshCw,Save,Send,Smartphone,Trash2,X,ExternalLink,AlertCircle,Undo2,Redo2} from "lucide-react";
import {ApiError,can,useAuth} from "../../components/AuthProvider";
import {useStore} from "../../components/StoreProvider";
import {DEFAULT_HOME,EDIT_FIELDS,SECTION_DESCRIPTIONS,makeSection,type Field,type HomeConfig,type HomeResponse,type SectionKind} from "../../lib/home-layout";
import {campaignReady,productImages,type ProductMedia} from "../../lib/product-media.mjs";
import {uploadMedia} from "../../lib/media-upload";
import {buildHeroSlides} from "../../lib/carousel.mjs";
import {describeDiff,diffHome} from "../../lib/home-diff.mjs";
import {cleanNumber,normalizeNumbers} from "../../lib/home-normalize.mjs";
import {CategoryPicker,ProductPicker} from "./home-pickers";
import "./home-editor.css";

const TYPES:SectionKind[]=["hero","categories","products","personalization","retro","accessories","banner","text","services","campaign","ticker"];
type Revision={id:number;revision:number;action:string;created:string};
type Media={url:string;name:string;bytes:number};
type LocalDraft={base:number;config:HomeConfig;at:number};
const FORMAT=new Intl.DateTimeFormat("pl-PL",{dateStyle:"medium",timeStyle:"short"});
const clone=<T,>(data:T):T=>JSON.parse(JSON.stringify(data));
const catalogueImages=[{url:"/assets/photos/fans.webp",name:"Kibice Zastalu"}];
const FRAME={desktop:{width:1440,height:900},mobile:{width:390,height:844}};
const typing=(target:EventTarget|null)=>target instanceof HTMLElement&&(target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
const sectionName=(type:string)=>SECTION_DESCRIPTIONS[type as SectionKind]?.name||type;
const fieldName=(type:string,key:string)=>(EDIT_FIELDS[type as SectionKind]||[]).find(f=>f.key===key)?.label||key;
/** Server messages name settings by key; show the label and the allowed range instead. */
const friendly=(message:string)=>message.replace(/Nieprawidłowa wartość pola: (\w+)/,(whole,key:string)=>{
 const f=Object.values(EDIT_FIELDS).flat().find(x=>x.key===key);
 return f?`Pole „${f.label}” ma niedozwoloną wartość${f.min!==undefined&&f.max!==undefined?` (dozwolone ${f.min}–${f.max})`:""}. Popraw je i zapisz ponownie.`:whole;
});
/** Whole-number field: typing is free, a value inside the range applies at once, anything else is corrected when you leave the field. */
function NumberField({value,field,onChange}:{value:number;field:Field;onChange:(value:number)=>void}){
 const [text,setText]=useState(String(value));
 useEffect(()=>{setText(String(value))},[value]);
 const commit=()=>{const clean=cleanNumber(text,field);setText(String(clean));if(clean!==value)onChange(clean)};
 return <input type="text" inputMode="numeric" value={text} onChange={e=>{const next=e.target.value.replace(/[^\d]/g,"");setText(next);if(next!==""){const n=Number(next);if(n>=(field.min??0)&&n<=(field.max??999999)&&n!==value)onChange(n)}}} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commit()}}} aria-describedby={undefined} title={field.min!==undefined?`${field.min}–${field.max}`:undefined}/>;
}

export default function HomeEditor(){
 const auth=useAuth(),store=useStore();
 const [loaded,setLoaded]=useState(false),[saving,setSaving]=useState(false),[busy,setBusy]=useState(false);
 const [remote,setRemote]=useState<HomeResponse|null>(null),[draft,setDraft]=useState<HomeConfig>(clone(DEFAULT_HOME));
 const [selection,setSelection]=useState<string>("hero-main");
 const [message,setMessage]=useState(""),[error,setError]=useState("");
 const [device,setDevice]=useState<"desktop"|"mobile">("desktop");
 const [libraryOpen,setLibraryOpen]=useState(false),[media,setMedia]=useState<Media[]>([]);
 const [imageTarget,setImageTarget]=useState("image");
 const [uploading,setUploading]=useState(false);
 const [versionsOpen,setVersionsOpen]=useState(false),[revisions,setRevisions]=useState<Revision[]>([]);
 const [addOpen,setAddOpen]=useState(false);
 const [dragging,setDragging]=useState<string|null>(null);
 const [undo,setUndo]=useState<HomeConfig[]>([]),[redo,setRedo]=useState<HomeConfig[]>([]);
 const [slideTab,setSlideTab]=useState(1);
 const [fullscreen,setFullscreen]=useState(false);
 const [publishOpen,setPublishOpen]=useState(false),[published,setPublished]=useState<HomeConfig|null>(null),[publishedFailed,setPublishedFailed]=useState(false);
 const [mode,setMode]=useState<"now"|"later">("now"),[when,setWhen]=useState("");
 const [recovery,setRecovery]=useState<LocalDraft|null>(null);
 const [box,setBox]=useState({width:0,height:0});
 const preview=useRef<HTMLIFrameElement|null>(null),stage=useRef<HTMLDivElement|null>(null);
 const selected=draft.sections.find(x=>x.id===selection)||draft.sections[0];
 const isDirty=remote?JSON.stringify(draft)!==JSON.stringify(remote.config):false;
 const enabled=draft.sections.filter(x=>x.enabled).length;
 const draftKey="zastal:home-draft:"+(auth.user?.id??"staff");
 const post=(data:object)=>{preview.current?.contentWindow?.postMessage(data,window.location.origin);};
 const notify=()=>post({kind:"zastal:home:preview",config:draft});
 useEffect(()=>{notify();},[draft,device,loaded]);
 useEffect(()=>{const ready=(event:MessageEvent)=>{
  if(event.origin!==window.location.origin||event.source!==preview.current?.contentWindow)return;
  if(event.data?.kind==="zastal:home:ready"){notify();post({kind:"zastal:home:select",id:selected?.id||""});}
  if(event.data?.kind==="zastal:home:picked"&&typeof event.data.id==="string"&&draft.sections.some(x=>x.id===event.data.id))setSelection(event.data.id);
 };window.addEventListener("message",ready);return()=>window.removeEventListener("message",ready);},[draft,selected?.id]);
 useEffect(()=>{
  if(!isDirty)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
  window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
 },[isDirty]);
 // The stage fills the available space; the preview is a real 1440 px (or 390 px) page scaled down to fit.
 useEffect(()=>{
  const el=stage.current;if(!el)return;
  const measure=()=>setBox({width:el.clientWidth,height:el.clientHeight});
  measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();
 },[loaded]);
 useEffect(()=>{document.body.classList.toggle("staff-fullscreen",fullscreen);return()=>document.body.classList.remove("staff-fullscreen");},[fullscreen]);
 // The editor has its own title bar, so the page heading above it only costs height.
 useEffect(()=>{document.body.classList.add("staff-editor");return()=>document.body.classList.remove("staff-editor");},[]);
 // Unsaved work survives a closed tab: kept per revision, offered back after the next load.
 useEffect(()=>{
  if(!remote||recovery)return;
  try{if(isDirty)localStorage.setItem(draftKey,JSON.stringify({base:remote.revision,config:draft,at:Date.now()}));else localStorage.removeItem(draftKey);}catch{/* private mode */}
 },[draft,remote,recovery]);
 const load=async()=>{
  setBusy(true);setError("");
  try{
   const res=await auth.request<HomeResponse>("/api/admin/home");
   setRemote(res);setDraft(clone(res.config));
   setSelection(res.config.sections[0]?.id||"");
   setUndo([]);setRedo([]);setLoaded(true);setRecovery(null);
   try{
    const stored=JSON.parse(localStorage.getItem(draftKey)||"null") as LocalDraft|null;
    if(stored&&stored.base===res.revision&&stored.config?.version===1&&Array.isArray(stored.config.sections)&&JSON.stringify(stored.config)!==JSON.stringify(res.config))setRecovery(stored);
    else localStorage.removeItem(draftKey);
   }catch{/* no stored draft */}
  }catch(ex){setError(ex instanceof Error?ex.message:"Nie udało się pobrać strony.")}
  finally{setBusy(false)}
 };
 useEffect(()=>{if(can(auth.user,"cms"))void load();},[auth.user?.id]);
 const restoreLocal=()=>{
  if(!recovery||!remote)return;
  setUndo([clone(remote.config)]);setRedo([]);setDraft(clone(recovery.config));
  setSelection(recovery.config.sections[0]?.id||"");setRecovery(null);
  setMessage("Przywrócono niezapisane zmiany z tej przeglądarki.");
 };
 const discardLocal=()=>{try{localStorage.removeItem(draftKey)}catch{/* ignore */}setRecovery(null)};
 const select=(id:string)=>{setSelection(id);post({kind:"zastal:home:select",id,scroll:true});};

 const edit=(recipe:(d:HomeConfig)=>void)=>{
  setUndo(old=>[...old.slice(-29),clone(draft)]);setRedo([]);
  setDraft(previous=>{const next=clone(previous);recipe(next);return next;});
  setMessage("");setError("");
 };
 const updateSection=(id:string,key:string,value:string|number|boolean)=>{
  edit(d=>{const part=d.sections.find(s=>s.id===id);if(part)part.settings[key]=value});
 };
 const reorder=(from:string,to:string)=>{
  edit(d=>{const a=d.sections.findIndex(x=>x.id===from),b=d.sections.findIndex(x=>x.id===to);if(a<0||b<0)return;const [part]=d.sections.splice(a,1);d.sections.splice(b,0,part)});
 };
 const action=(id:string,type:"up"|"down"|"toggle"|"delete"|"duplicate")=>{
  const part=draft.sections.find(s=>s.id===id);if(!part)return;
  if(type==="delete"&&part.type==="hero"&&part.enabled&&!draft.sections.some(s=>s.type==="hero"&&s.enabled&&s.id!==id)){setError("Zostaw przynajmniej jeden aktywny baner główny.");return}
  const pos=draft.sections.findIndex(s=>s.id===id);
  if(type==="up"&&pos===0)return;
  if(type==="down"&&pos===draft.sections.length-1)return;
  if(type==="toggle"&&part.type==="hero"&&part.enabled&&!draft.sections.some(s=>s.type==="hero"&&s.enabled&&s.id!==id)){setError("Nie można wyłączyć jedynego banera głównego.");return}
  if(type==="toggle"&&part.type==="campaign"&&!part.enabled&&!campaignReady(part.settings,store.products)){setError("Dodaj zdjęcie, jego opis i powiązane produkty przed włączeniem kampanii.");return}
  edit(d=>{
   const i=d.sections.findIndex(s=>s.id===id);
   if(type==="toggle")d.sections[i].enabled=!d.sections[i].enabled;
   if(type==="delete")d.sections.splice(i,1);
   if(type==="duplicate"&&d.sections.length<25){const copy=clone(d.sections[i]);copy.id="section-"+crypto.randomUUID().slice(0,8);d.sections.splice(i+1,0,copy);setSelection(copy.id)}
   if(type==="up"||type==="down"){const j=i+(type==="up"?-1:1);[d.sections[i],d.sections[j]]=[d.sections[j],d.sections[i]]}
  });
  if(type==="delete")setSelection(draft.sections.find(s=>s.id!==id)?.id||"");
 };
 const add=(kind:SectionKind)=>{
  if(draft.sections.length>=25){setError("Maksymalnie 25 sekcji na stronie.");return}
  const part=makeSection(kind);
  edit(d=>d.sections.push(part));
  setSelection(part.id);setAddOpen(false);
 };
 const useUndo=()=>{
  if(!undo.length)return;
  setRedo(x=>[...x,clone(draft)]);setDraft(clone(undo[undo.length-1]));setUndo(x=>x.slice(0,-1));
 };
 const useRedo=()=>{
  if(!redo.length)return;
  setUndo(x=>[...x,clone(draft)]);setDraft(clone(redo[redo.length-1]));setRedo(x=>x.slice(0,-1));
 };
 const save=async(current:HomeConfig=draft):Promise<HomeResponse|null>=>{
  if(!remote)return null;
  setSaving(true);setMessage("");setError("");
  try{
   const result=await auth.request<HomeResponse>("/api/admin/home",{method:"PATCH",body:JSON.stringify({config:normalizeNumbers(current,EDIT_FIELDS).config,revision:remote.revision})});
   setRemote(result);setDraft(clone(result.config));setUndo([]);setRedo([]);
   setMessage("Zapisano szkic. Zmiany nie są jeszcze widoczne w sklepie.");
   return result;
  }catch(ex){setError((ex instanceof Error?ex.message:"Nie zapisano zmian.")+(ex instanceof ApiError&&ex.status===409?" Pobrano aktualną wersję z serwera.":""));if(ex instanceof ApiError&&ex.status===409)void load();return null}
  finally{setSaving(false)}
 };
 const openPublish=async()=>{
  if(!remote||saving||busy)return;
  setPublishOpen(true);setPublished(null);setPublishedFailed(false);setMode("now");
  try{
   const res=await fetch("/api/store/home",{cache:"no-store"});
   const body=await res.json();
   if(body?.config?.version===1&&Array.isArray(body.config.sections))setPublished(body.config);else setPublishedFailed(true);
  }catch{setPublishedFailed(true)}
 };
 const publish=async()=>{
  if(!remote||saving||busy)return;
  setBusy(true);setMessage("");setError("");
  try{
   let version=remote;
   if(isDirty){
    version=await auth.request<HomeResponse>("/api/admin/home",{method:"PATCH",body:JSON.stringify({config:normalizeNumbers(draft,EDIT_FIELDS).config,revision:remote.revision})});
    setRemote(version);setDraft(clone(version.config));
   }
   const out=await auth.request<HomeResponse>("/api/admin/home/publish",{method:"POST",body:JSON.stringify({revision:version.revision})});
   setRemote(out);setDraft(clone(out.config));setUndo([]);setRedo([]);setPublishOpen(false);
   setMessage("Opublikowano stronę główną. Nowy układ jest widoczny dla klientów.");
  }catch(ex){setPublishOpen(false);setError((ex instanceof Error?ex.message:"Nie udało się opublikować strony.")+(ex instanceof ApiError&&ex.status===409?" Pobrano aktualną wersję z serwera.":""));if(ex instanceof ApiError&&ex.status===409)void load();}
  finally{setBusy(false)}
 };
 const schedule=async()=>{
  if(!remote||saving||busy)return;
  const moment=new Date(when);
  if(!when||Number.isNaN(moment.getTime())||moment.getTime()<Date.now()+120000){setError("Wybierz termin co najmniej kilka minut w przyszłości.");return}
  setBusy(true);setMessage("");setError("");
  try{
   let version=remote;
   if(isDirty){
    version=await auth.request<HomeResponse>("/api/admin/home",{method:"PATCH",body:JSON.stringify({config:normalizeNumbers(draft,EDIT_FIELDS).config,revision:remote.revision})});
    setRemote(version);setDraft(clone(version.config));
   }
   const out=await auth.request<HomeResponse>("/api/admin/home/schedule",{method:"POST",body:JSON.stringify({revision:version.revision,at:moment.toISOString()})});
   setRemote(out);setDraft(clone(out.config));setUndo([]);setRedo([]);setPublishOpen(false);
   setMessage("Zaplanowano publikację na "+FORMAT.format(moment)+". Klienci zobaczą stronę dokładnie w tej wersji.");
  }catch(ex){setPublishOpen(false);setError((ex instanceof Error?ex.message:"Nie udało się zaplanować publikacji.")+(ex instanceof ApiError&&ex.status===409?" Pobrano aktualną wersję z serwera.":""));if(ex instanceof ApiError&&ex.status===409)void load();}
  finally{setBusy(false)}
 };
 const cancelSchedule=async()=>{
  if(!remote||busy||!window.confirm("Anulować zaplanowaną publikację? Strona dla klientów pozostanie bez zmian."))return;
  setBusy(true);setError("");
  try{const out=await auth.request<HomeResponse>("/api/admin/home/schedule/cancel",{method:"POST",body:"{}"});setRemote(out);setMessage("Anulowano zaplanowaną publikację.")}
  catch(ex){setError(ex instanceof Error?ex.message:"Nie udało się anulować planu.")}
  finally{setBusy(false)}
 };
 const showVersions=async()=>{
  try{setRevisions(await auth.request<Revision[]>("/api/admin/home/revisions"));setVersionsOpen(true)}
  catch(ex){setError(ex instanceof Error?ex.message:"Nie odczytano historii")}
 };
 const restore=async(id:number)=>{
  if(!remote||!window.confirm("Przywrócić tę wersję do szkicu? Opublikowana strona pozostanie bez zmian."))return;
  setBusy(true);setError("");
  try{
   const out=await auth.request<HomeResponse>("/api/admin/home/restore",{method:"POST",body:JSON.stringify({revision_id:id,revision:remote.revision})});
   setRemote(out);setDraft(clone(out.config));setSelection(out.config.sections[0]?.id||"");
   setUndo([]);setRedo([]);setVersionsOpen(false);
   setMessage("Przywrócono szkic z historii. Aby pokazać go klientom, kliknij Opublikuj.");
  }catch(ex){setError(ex instanceof Error?ex.message:"Przywrócenie nie powiodło się")}
  finally{setBusy(false)}
 };
 const loadMedia=async(target="image")=>{
  setImageTarget(target);setLibraryOpen(true);
  try{setMedia(await auth.request<Media[]>("/api/admin/home/media"))}
  catch(ex){setError(ex instanceof Error?ex.message:"Nie odczytano biblioteki mediów")}
 };
 const upload=async(file:File,target="image")=>{
  setUploading(true);setError("");
  try{
   const url=await uploadMedia(file,auth.request);
   setMedia(x=>[{url,name:file.name,bytes:file.size},...x]);
   if(selected)edit(d=>{const part=d.sections.find(x=>x.id===selected.id);if(!part)return;part.settings[target]=url;if(part.type==="campaign"||part.type==="hero"){const prefix=target.replace(/image$/,"");part.settings[prefix+"image_alt"]="";part.settings[prefix+"image_illustrative"]=true;if(part.type==="hero")part.settings[prefix+"image_role"]="packshot";}});
   setLibraryOpen(false);setMessage("Zdjęcie dodano do biblioteki i szkicu. Zapisz i opublikuj, aby pokazać je klientom.");
  }catch(ex){setError(ex instanceof Error?ex.message:"Nie udało się przesłać zdjęcia")}
  finally{setUploading(false)}
 };
 const campaignChoices=selected?.type==="campaign"?store.products.filter(p=>String(selected.settings.product_ids).split(",").map(x=>Number(x.trim())).includes(p.id)).flatMap(p=>productImages(p).filter(img=>img.role==="model"||img.role==="lifestyle").map(img=>({product:p,image:img}))):[];
 const chooseCampaignImage=(img:ProductMedia)=>{
  if(!selected)return;
  edit(d=>{const part=d.sections.find(x=>x.id===selected.id);if(part)Object.assign(part.settings,{image:img.url,image_alt:img.alt,image_role:img.role,image_illustrative:img.illustrative});});
 };
 const selectImage=(url:string)=>{
  if(!selected)return;
  edit(d=>{const part=d.sections.find(x=>x.id===selected.id);if(!part)return;part.settings[imageTarget]=url;
   if(part.type==="hero"){
    const prefix=imageTarget.replace(/image$/,"");
    const match=store.products.flatMap(product=>productImages(product)).find(img=>img.url===url);
    const fans=url==="/assets/photos/fans.webp";
    part.settings[prefix+"image_alt"]=match?.alt||(fans?"Kibice Zastalu Zielona Góra na trybunach":"");
    part.settings[prefix+"image_role"]=match?.role||(fans?"lifestyle":"packshot");
    part.settings[prefix+"image_illustrative"]=match?.illustrative??!fans;
   }
  });setLibraryOpen(false);
 };
 const field=(f:Field)=>{
  if(!selected)return null;
  if(selected.type==="campaign"&&f.key==="product_ids"){
   const ids=String(selected.settings.product_ids||"").split(",").map(Number).filter(Boolean);
   return <fieldset key={f.key} className="home-campaign-products"><legend>Produkty kampanii</legend>{store.products.map(p=><label key={p.id}><input type="checkbox" checked={ids.includes(p.id)} onChange={e=>{const next=e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id);edit(d=>{const part=d.sections.find(x=>x.id===selected.id);if(!part)return;part.settings.product_ids=next.join(",");const image=String(part.settings.image);if(ids.includes(p.id)&&!e.target.checked&&productImages(p).some(img=>img.url===image)){part.settings.image="";part.settings.image_alt="";part.settings.image_illustrative=true;part.enabled=false;}});}}/>{p.name}</label>)}</fieldset>;
  }
  if(selected.type==="campaign"&&f.key==="image")return <div key={f.key} className="home-edit-field"><span>Zdjęcie kampanii</span><div className="home-edit-image">{selected.settings.image?<img src={String(selected.settings.image)} alt={String(selected.settings.image_alt)}/>:<span>Brak zdjęcia</span>}</div>{selected.settings.image_illustrative===true&&selected.settings.image&&<small>Materiał poglądowy</small>}<label>Zdjęcie z galerii powiązanego produktu<select value={String(selected.settings.image||"")} onChange={e=>{const choice=campaignChoices.find(x=>x.image.url===e.target.value);if(choice)chooseCampaignImage(choice.image);}}><option value="">Wybierz zdjęcie</option>{selected.settings.image&&!campaignChoices.some(x=>x.image.url===selected.settings.image)&&<option value={String(selected.settings.image)}>Własny przesłany obraz</option>}{campaignChoices.map(({product,image})=><option key={product.id+image.id} value={image.url}>{product.name} · {image.alt||image.role}{image.illustrative?" · Materiał poglądowy":""}</option>)}</select></label>{!campaignChoices.length&&<small>Brak zdjęć „Na modelu” lub „Lifestyle” w galeriach wybranych produktów. Dodaj pasujące materiały w galerii produktu lub prześlij zdjęcie poniżej.</small>}<label className="home-edit-media-btn">{uploading?"Przetwarzanie / wysyłanie…":"Prześlij pasujące zdjęcie"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>{if(e.target.files?.[0])void upload(e.target.files[0]);e.target.value="";}}/></label><small>JPG, PNG, WebP do 25 MB · automatycznie dopasujemy zdjęcie do sklepu. Uzupełnij opis i potwierdź zgodność produktu, koloru i wzoru.</small></div>;
  if(selected.type==="campaign"&&f.key==="image_illustrative")return <label key={f.key} className="home-campaign-truth"><input type="checkbox" checked={selected.settings.image_illustrative!==false} onChange={e=>{if(e.target.checked||window.confirm("Potwierdzam, że zdjęcie przedstawia dokładnie produkty kampanii, ich kolor i wzór. Czy usunąć oznaczenie „Materiał poglądowy”?"))updateSection(selected.id,"image_illustrative",e.target.checked);}}/>Materiał poglądowy</label>;
  if(selected.type==="products"&&f.key==="product_ids")return <ProductPicker key={f.key} label="Wybrane produkty" hint="Puste = produkty z katalogu według kategorii" value={String(selected.settings.product_ids||"")} products={store.products} onChange={v=>updateSection(selected.id,"product_ids",v)}/>;
  if(selected.type==="categories"&&f.key==="categories")return <CategoryPicker key={f.key} label="Kategorie w kolejności na stronie" value={String(selected.settings.categories||"")} onChange={v=>updateSection(selected.id,"categories",v)}/>;
  let val=selected.settings[f.key]??f.defaultValue;
  if(selected.type==="hero"&&selected.settings[f.key]===undefined&&/image_(role|illustrative)$/.test(f.key)){
   const number=f.key.match(/^slide_(2|3)_/)?.[1]||"1";
   const resolved=buildHeroSlides(selected.settings,store.products).find(slide=>slide.id===`slide-${number}`);
   if(resolved)val=f.key.endsWith("image_role")?resolved.image_role:resolved.image_illustrative;
  }
  const change=(v:string|number|boolean)=>updateSection(selected.id,f.key,v);
  return <label className="home-edit-field" key={f.key}><span>{f.label}</span>
   {f.type==="short"||f.type==="url"?<input value={String(val??"")} onChange={e=>change(e.target.value)} maxLength={f.type==="url"?390:250} placeholder={f.type==="url"?"/sklep":"Wpisz tekst"} spellCheck/>:null}
   {f.type==="long"?<textarea value={String(val??"")} onChange={e=>change(e.target.value)} maxLength={1300} rows={4}/>:null}
   {f.type==="number"?<NumberField value={Number(val??f.defaultValue??f.min??0)} field={f} onChange={change}/>:null}
   {f.type==="color"?<div className="home-edit-color"><input type="color" value={String(val)} onChange={e=>change(e.target.value)}/><input value={String(val)} onChange={e=>change(e.target.value)} maxLength={7}/></div>:null}
   {f.type==="select"?<select value={String(val)} onChange={e=>change(typeof val==="number"?Number(e.target.value):e.target.value)}>{f.options?.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select>:null}
   {f.type==="toggle"?<button type="button" className={"home-edit-toggle "+(val?"on":"")} aria-pressed={val===true} onClick={()=>change(!val)}><span/>{val?"Włączone":"Wyłączone"}</button>:null}
   {f.type==="product"?<select value={Number(val)||1} onChange={e=>change(Number(e.target.value))}>{store.products.map(p=><option value={p.id} key={p.id}>#{p.id} {p.name}</option>)}</select>:null}
   {f.type==="image"?<><div className="home-edit-image">{String(val??"")?<img src={String(val)} alt="Aktualny obraz sekcji"/>:<span>Brak obrazu</span>}</div><button type="button" className="home-edit-media-btn" onClick={()=>void loadMedia(f.key)}><ImagePlus size={16}/> Wybierz lub prześlij zdjęcie</button>{val&&selected.type==="hero"&&<button type="button" className="home-edit-media-btn" onClick={()=>{const prefix=f.key.replace(/image$/,"");edit(d=>{const part=d.sections.find(x=>x.id===selected.id);if(!part)return;part.settings[f.key]="";delete part.settings[prefix+"image_alt"];delete part.settings[prefix+"image_role"];delete part.settings[prefix+"image_illustrative"];});}}>Użyj domyślnego zdjęcia</button>}</>:null}
   {f.hint&&<small>{f.hint}</small>}
  </label>;
 };
 // Shortcuts always see the current handlers: Ctrl/Cmd+S saves, Ctrl/Cmd+Z / Shift+Z / Y step through changes (not while typing in a field).
 const keys=useRef({save:()=>{},undo:()=>{},redo:()=>{}});
 keys.current={save:()=>{if(isDirty&&!saving&&!busy)void save()},undo:useUndo,redo:useRedo};
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{
   if(!(event.ctrlKey||event.metaKey)||event.altKey)return;
   const key=event.key.toLowerCase();
   if(key==="s"){event.preventDefault();keys.current.save();return}
   if(typing(event.target))return;
   if(key==="z"){event.preventDefault();event.shiftKey?keys.current.redo():keys.current.undo()}
   if(key==="y"){event.preventDefault();keys.current.redo()}
  };
  window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
 },[]);
 const diff=useMemo(()=>published?diffHome(published,draft,{section:sectionName,field:fieldName}):null,[published,draft]);
 const status=isDirty?{tone:"warn",text:"Niezapisane zmiany"}:remote?.draft_changed?{tone:"info",text:"Szkic czeka na publikację"}:{tone:"ok",text:"Opublikowano"};
 // Preview geometry: real page size, scaled to the free space.
 const fw=FRAME[device].width,pad=24;
 const scale=box.width?Math.min(1,(box.width-pad)/fw,device==="mobile"?(box.height-pad)/FRAME.mobile.height:1):1;
 const fh=device==="desktop"?Math.max(480,Math.round((box.height-pad)/scale)):FRAME.mobile.height;
 const hero=selected?.type==="hero";
 const slideLabels=["Slajd 1","Slajd 2 · Bluzy","Slajd 3 · Koszulki"];
 return <section className={"home-builder"+(fullscreen?" fullscreen":"")}>
  <header className="home-builder-bar"><div className="home-builder-title"><h2>Edytor strony głównej</h2>{loaded&&<span className={"home-builder-status "+status.tone}>{status.text}</span>}<p>{loaded?"Wersja "+remote?.revision+" · opublikowana "+remote?.published_revision:"Pobieranie strony..."}</p></div>
   <div className="home-builder-toolbar"><button onClick={useUndo} disabled={!undo.length} title="Cofnij (Ctrl+Z)" aria-label="Cofnij"><Undo2 size={17}/></button><button onClick={useRedo} disabled={!redo.length} title="Ponów (Ctrl+Y)" aria-label="Ponów"><Redo2 size={17}/></button>
   <button onClick={()=>void showVersions()} disabled={!loaded}><History size={17}/><span>Historia</span></button>
   <button onClick={()=>setFullscreen(x=>!x)} title={fullscreen?"Zamknij pełny ekran":"Pełny ekran"} aria-pressed={fullscreen}>{fullscreen?<Minimize2 size={17}/>:<Maximize2 size={17}/>}<span>{fullscreen?"Zamknij":"Pełny ekran"}</span></button>
   <button className="home-builder-save" onClick={()=>void save()} disabled={!loaded||saving||busy||!isDirty} title="Zapisz szkic (Ctrl+S)"><Save size={17}/><span>Zapisz szkic</span></button>
   <button className="home-builder-publish" onClick={()=>void openPublish()} disabled={!loaded||saving||busy}><Send size={17}/><span>Opublikuj</span></button></div>
  </header>
  {error&&<div className="home-builder-message error" role="alert"><AlertCircle size={18}/>{friendly(error)}<button aria-label="Zamknij komunikat" onClick={()=>setError("")}><X size={17}/></button></div>}
  {message&&<div className="home-builder-message success" role="status"><CheckCircle2 size={18}/>{message}<button aria-label="Zamknij komunikat" onClick={()=>setMessage("")}><X size={17}/></button></div>}
  {recovery&&<div className="home-builder-message recover" role="status"><AlertCircle size={18}/><span>Znaleziono niezapisane zmiany z {FORMAT.format(new Date(recovery.at))}.</span><span className="home-builder-recover-actions"><button onClick={restoreLocal}>Przywróć</button><button onClick={discardLocal}>Odrzuć</button></span></div>}
  {remote?.scheduled_at&&<div className="home-builder-message schedule" role="status"><CalendarClock size={18}/><span>Zaplanowana publikacja: <b>{FORMAT.format(new Date(remote.scheduled_at))}</b> · wersja {remote.scheduled_revision}. Późniejsze zmiany szkicu nie wejdą do tej publikacji.</span><button className="home-builder-recover-actions" disabled={busy} onClick={()=>void cancelSchedule()}>Anuluj plan</button></div>}
  <div className="home-builder-workspace">
   <aside className="home-builder-outline"><div className="home-builder-side-head"><div><Layers3 size={17}/> Sekcje <b>{draft.sections.length}</b></div><small>{enabled} aktywnych</small></div>
    <div className="home-builder-list">{draft.sections.map((sec,index)=><div key={sec.id} className={"home-builder-item "+(sec.id===selection?"active":"")+(sec.enabled?"":" disabled")+(dragging===sec.id?" dragging":"")} draggable onDragStart={e=>{setDragging(sec.id);e.dataTransfer.effectAllowed="move"}} onDragEnd={()=>setDragging(null)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(dragging&&dragging!==sec.id)reorder(dragging,sec.id);setDragging(null)}}>
     <span className="home-builder-grip" aria-hidden="true"><GripVertical size={15}/></span>
     <button type="button" className="home-builder-item-main" onClick={()=>select(sec.id)} aria-current={sec.id===selection}><span><strong>{SECTION_DESCRIPTIONS[sec.type].name}</strong><small>{String(sec.settings.title||sec.settings.eyebrow||"Bez nagłówka").replace(/\|/g," ").slice(0,40)}</small></span></button>
     <div className="home-builder-item-actions" onClick={e=>e.stopPropagation()}>
      <button aria-label="Przesuń w górę" title="Przesuń w górę" disabled={index===0} onClick={()=>action(sec.id,"up")}><ArrowUp size={14}/></button>
      <button aria-label="Przesuń w dół" title="Przesuń w dół" disabled={index===draft.sections.length-1} onClick={()=>action(sec.id,"down")}><ArrowDown size={14}/></button>
      <button aria-label={sec.enabled?"Ukryj":"Pokaż"} title={sec.enabled?"Ukryj":"Pokaż"} className="always" onClick={()=>action(sec.id,"toggle")}>{sec.enabled?<Eye size={14}/>:<EyeOff size={14}/>}</button>
     </div>
    </div>)}</div>
    <button className="home-builder-add" onClick={()=>setAddOpen(true)}><Plus size={17}/> Dodaj sekcję</button>
   </aside>
   <div className="home-builder-stage"><div className="home-builder-stage-head"><div><span className="home-builder-stage-dot"/> Podgląd na żywo · kliknij sekcję, aby ją edytować</div><div><button className={device==="desktop"?"on":""} onClick={()=>setDevice("desktop")} title="Komputer" aria-label="Widok komputera"><Monitor size={17}/></button><button className={device==="mobile"?"on":""} onClick={()=>setDevice("mobile")} title="Telefon" aria-label="Widok telefonu"><Smartphone size={17}/></button><a href="/" target="_blank" rel="noreferrer" title="Opublikowany sklep" aria-label="Otwórz opublikowany sklep"><ExternalLink size={17}/></a></div></div>
    <div className={"home-builder-stage-scroll "+device} ref={stage}>
     <div className="home-builder-preview-wrap" style={{width:fw*scale,height:fh*scale}}><iframe ref={preview} src="/admin/podglad" title="Interaktywny podgląd edytowanej strony" style={{width:fw,height:fh,transform:"scale("+scale+")"}} onLoad={()=>{notify();post({kind:"zastal:home:select",id:selected?.id||""})}}/></div>
    </div>
   </div>
   <aside className="home-builder-properties"><div className="home-builder-side-head"><div>{selected?sectionName(selected.type):"Ustawienia sekcji"}</div>{selected&&<button title="Duplikuj sekcję" aria-label="Duplikuj sekcję" onClick={()=>action(selected.id,"duplicate")}><Copy size={17}/></button>}</div>
    {selected?<><div className="home-builder-prop-intro"><p>{SECTION_DESCRIPTIONS[selected.type].about}</p></div>
     {hero&&<div className="home-builder-tabs" role="tablist" aria-label="Slajdy banera">{slideLabels.map((label,i)=><button key={label} role="tab" aria-selected={slideTab===i+1} className={slideTab===i+1?"on":""} onClick={()=>setSlideTab(i+1)}>{label}</button>)}</div>}
     <div className="home-builder-fields">{hero?EDIT_FIELDS.hero.filter(f=>slideTab===1?!f.key.startsWith("slide_"):f.key.startsWith(`slide_${slideTab}_`)).map(field):EDIT_FIELDS[selected.type].map(field)}</div>
     <div className="home-builder-prop-footer"><button onClick={()=>action(selected.id,"toggle")}>{selected.enabled?<EyeOff size={15}/>:<Eye size={15}/>} {selected.enabled?"Ukryj sekcję":"Pokaż sekcję"}</button><button className="danger" onClick={()=>action(selected.id,"delete")}><Trash2 size={16}/> Usuń</button></div>
    </>:<p className="home-builder-placeholder">Wybierz sekcję po lewej albo kliknij ją w podglądzie.</p>}
   </aside>
  </div>
  {addOpen&&<div className="home-builder-overlay" role="dialog" aria-modal="true" aria-label="Dodaj sekcję" onClick={()=>setAddOpen(false)}><div className="home-builder-dialog" onClick={e=>e.stopPropagation()}><div className="home-builder-dialog-head"><div><h3>Dodaj sekcję</h3><p>Nowa sekcja trafia na koniec strony, przesuniesz ją w panelu po lewej.</p></div><button aria-label="Zamknij" onClick={()=>setAddOpen(false)}><X size={21}/></button></div><div className="home-builder-types">{TYPES.map(type=><button key={type} onClick={()=>add(type)}><span className="home-builder-type-icon"><Plus size={20}/></span><span><strong>{SECTION_DESCRIPTIONS[type].name}</strong><small>{SECTION_DESCRIPTIONS[type].about}</small></span></button>)}</div></div></div>}
  {libraryOpen&&<div className="home-builder-overlay" role="dialog" aria-modal="true" aria-label="Biblioteka zdjęć" onClick={()=>setLibraryOpen(false)}><div className="home-builder-dialog" onClick={e=>e.stopPropagation()}><div className="home-builder-dialog-head"><div><h3>Zdjęcia i grafiki</h3></div><button aria-label="Zamknij" onClick={()=>setLibraryOpen(false)}><X size={21}/></button></div>
   <label className="home-builder-upload"><ImagePlus size={26}/><strong>{uploading?"Wysyłanie zdjęcia...":"Prześlij nowe zdjęcie"}</strong><small>JPG, PNG lub WebP do 25 MB · automatyczne dopasowanie zdjęcia</small><input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>{if(e.target.files?.[0])void upload(e.target.files[0],imageTarget)}}/></label>
   <div className="home-builder-media-grid">{[...media,...catalogueImages.map(img=>({...img,bytes:0})),...store.products.filter(p=>p.verified).flatMap(p=>productImages(p).map(img=>({url:img.url,name:p.name+" · "+(img.alt||img.role)+(img.illustrative?" · Materiał poglądowy":""),bytes:0})))].filter((item,index,items)=>items.findIndex(other=>other.url===item.url)===index).map(item=><button key={item.url} onClick={()=>{selectImage(item.url)}}><img src={item.url} alt={item.name}/><span>{item.name}</span></button>)}</div>
  </div></div>}
  {versionsOpen&&<div className="home-builder-overlay" role="dialog" aria-modal="true" aria-label="Historia strony" onClick={()=>setVersionsOpen(false)}><div className="home-builder-dialog home-builder-history" onClick={e=>e.stopPropagation()}><div className="home-builder-dialog-head"><div><h3>Poprzednie wersje</h3></div><button aria-label="Zamknij" onClick={()=>setVersionsOpen(false)}><X size={21}/></button></div><p>Przywracanie nie publikuje zmian — zapisuje wskazaną wersję do szkicu.</p><div>{revisions.map(rev=><div className="home-builder-version" key={rev.id}><span><strong>Wersja {rev.revision}</strong><small>{FORMAT.format(new Date(rev.created))} · {rev.action==="published"?"Opublikowana":rev.action==="draft"?"Szkic":"Pierwotna"}</small></span><button disabled={busy} onClick={()=>void restore(rev.id)}><RefreshCw size={15}/> Przywróć</button></div>)}</div></div></div>}
  {publishOpen&&<div className="home-builder-overlay" role="dialog" aria-modal="true" aria-label="Publikacja strony głównej" onClick={()=>!busy&&setPublishOpen(false)}><div className="home-builder-dialog home-builder-publish-dialog" onClick={e=>e.stopPropagation()}><div className="home-builder-dialog-head"><div><h3>Opublikować stronę główną?</h3><p>Wybierz, czy klienci mają zobaczyć zmiany od razu, czy o ustalonej godzinie.</p></div><button aria-label="Zamknij" disabled={busy} onClick={()=>setPublishOpen(false)}><X size={21}/></button></div>
   {publishedFailed?<p className="home-builder-note">Nie udało się pobrać opublikowanej wersji, więc nie pokażemy listy zmian. Możesz opublikować mimo to.</p>
    :!diff?<p className="home-builder-note">Porównuję z opublikowaną stroną…</p>
    :diff.total===0?<p className="home-builder-note">Brak zmian względem opublikowanej strony.</p>
    :<ul className="home-builder-changes">{describeDiff(diff).map(line=><li key={line}><Check size={15}/>{line}</li>)}</ul>}
   <div className="home-builder-when" role="radiogroup" aria-label="Kiedy opublikować"><button role="radio" aria-checked={mode==="now"} className={mode==="now"?"on":""} onClick={()=>setMode("now")}>Teraz</button><button role="radio" aria-checked={mode==="later"} className={mode==="later"?"on":""} onClick={()=>{setMode("later");if(!when){const t=new Date(Date.now()+7200000);t.setMinutes(0,0,0);setWhen(new Date(t.getTime()-t.getTimezoneOffset()*60000).toISOString().slice(0,16))}}}><CalendarClock size={15}/> Zaplanuj</button></div>
   {mode==="later"&&<label className="home-builder-when-field">Data i godzina publikacji<input type="datetime-local" value={when} min={new Date(Date.now()-new Date().getTimezoneOffset()*60000+300000).toISOString().slice(0,16)} onChange={e=>setWhen(e.target.value)}/><small>Strona zmieni się sama w tym momencie, bez udziału panelu. Publikowana jest wersja zapisana teraz.</small></label>}
   <div className="home-builder-dialog-foot"><button disabled={busy} onClick={()=>setPublishOpen(false)}>Wróć do edycji</button>{mode==="now"?<button className="primary" disabled={busy||(!publishedFailed&&(!diff||diff.total===0))} onClick={()=>void publish()}><Send size={16}/> {busy?"Publikowanie…":"Opublikuj teraz"}</button>:<button className="primary" disabled={busy||!when} onClick={()=>void schedule()}><CalendarClock size={16}/> {busy?"Zapisywanie…":"Zaplanuj publikację"}</button>}</div>
  </div></div>}
 </section>;
}
