"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {ArrowDown,ArrowUp,Check,CheckCircle2,ChevronLeft,Copy,Eye,EyeOff,History,ImagePlus,Layers3,Monitor,Plus,RefreshCw,Save,Send,Smartphone,Trash2,X,ExternalLink,AlertCircle,Undo2,Redo2} from "lucide-react";
import {useAuth} from "../../components/AuthProvider";
import {useStore} from "../../components/StoreProvider";
import {DEFAULT_HOME,EDIT_FIELDS,SECTION_DESCRIPTIONS,copyConfig,makeSection,type Field,type HomeConfig,type HomeResponse,type HomeSection,type SectionKind,type SectionSettings} from "../../lib/home-layout";
import {campaignReady,productImages,type ProductMedia} from "../../lib/product-media.mjs";
import {uploadMedia} from "../../lib/media-upload";
import "./home-editor.css";

const TYPES:SectionKind[]=["hero","categories","products","personalization","retro","accessories","banner","text","services","campaign"];
type Revision={id:number;revision:number;action:string;created:string};
type Media={url:string;name:string;bytes:number};
const FORMAT=new Intl.DateTimeFormat("pl-PL",{dateStyle:"medium",timeStyle:"short"});
const clone=<T,>(data:T):T=>JSON.parse(JSON.stringify(data));
const catalogueImages=[{url:"/assets/photos/fans.webp",name:"Kibice Zastalu"},...Array.from({length:12},(_,i)=>({url:"/assets/photos/product-"+(i+1)+".webp",name:"Produkt #"+(i+1)}))];

export default function HomeEditor(){
 const auth=useAuth(),store=useStore();
 const [loaded,setLoaded]=useState(false),[saving,setSaving]=useState(false),[busy,setBusy]=useState(false);
 const [remote,setRemote]=useState<HomeResponse|null>(null),[draft,setDraft]=useState<HomeConfig>(clone(DEFAULT_HOME));
 const [selection,setSelection]=useState<string>("hero-main");
 const [message,setMessage]=useState(""),[error,setError]=useState("");
 const [device,setDevice]=useState<"desktop"|"mobile">("desktop");
 const [libraryOpen,setLibraryOpen]=useState(false),[media,setMedia]=useState<Media[]>([]);
 const [uploading,setUploading]=useState(false);
 const [versionsOpen,setVersionsOpen]=useState(false),[revisions,setRevisions]=useState<Revision[]>([]);
 const [addOpen,setAddOpen]=useState(false);
 const [dragging,setDragging]=useState<string|null>(null);
 const [undo,setUndo]=useState<HomeConfig[]>([]),[redo,setRedo]=useState<HomeConfig[]>([]);
 const preview=useRef<HTMLIFrameElement|null>(null);
 const selected=draft.sections.find(x=>x.id===selection)||draft.sections[0];
 const isDirty=remote?JSON.stringify(draft)!==JSON.stringify(remote.config):false;
 const enabled=draft.sections.filter(x=>x.enabled).length;
 const notify=()=>{preview.current?.contentWindow?.postMessage({kind:"zastal:home:preview",config:draft},window.location.origin);};
 useEffect(()=>{notify();},[draft,device,loaded]);
 useEffect(()=>{const ready=(event:MessageEvent)=>{if(event.origin===window.location.origin&&event.source===preview.current?.contentWindow&&event.data?.kind==="zastal:home:ready")notify();};window.addEventListener("message",ready);return()=>window.removeEventListener("message",ready);},[draft]);
 useEffect(()=>{
  if(!isDirty)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
  window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
 },[isDirty]);
 const load=async()=>{
  setBusy(true);setError("");
  try{
   const res=await auth.request<HomeResponse>("/api/admin/home");
   setRemote(res);setDraft(clone(res.config));
   setSelection(res.config.sections[0]?.id||"");
   setUndo([]);setRedo([]);setLoaded(true);
  }catch(ex){setError(ex instanceof Error?ex.message:"Nie udało się pobrać strony.")}
  finally{setBusy(false)}
 };
 useEffect(()=>{if(auth.user?.role==="admin")void load();},[auth.user?.id]);
 const edit=(recipe:(d:HomeConfig)=>void)=>{
  setUndo(old=>[...old.slice(-29),clone(draft)]);setRedo([]);
  setDraft(previous=>{const next=clone(previous);recipe(next);return next;});
  setMessage("");setError("");
 };
 const updateSection=(id:string,key:string,value:string|number|boolean)=>{
  edit(d=>{const part=d.sections.find(s=>s.id===id);if(part)part.settings[key]=value});
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
   const result=await auth.request<HomeResponse>("/api/admin/home",{method:"PATCH",body:JSON.stringify({config:current,revision:remote.revision})});
   setRemote(result);setDraft(clone(result.config));setUndo([]);setRedo([]);
   setMessage("Zapisano szkic. Zmiany nie są jeszcze widoczne w sklepie.");
   return result;
  }catch(ex){setError(ex instanceof Error?ex.message:"Nie zapisano zmian.");return null}
  finally{setSaving(false)}
 };
 const publish=async()=>{
  if(!remote||saving||busy)return;
  setBusy(true);setMessage("");setError("");
  try{
   let version=remote;
   if(isDirty){
    version=await auth.request<HomeResponse>("/api/admin/home",{method:"PATCH",body:JSON.stringify({config:draft,revision:remote.revision})});
   }
   const out=await auth.request<HomeResponse>("/api/admin/home/publish",{method:"POST",body:JSON.stringify({revision:version.revision})});
   setRemote(out);setDraft(clone(out.config));setUndo([]);setRedo([]);
   setMessage("Opublikowano stronę główną. Nowy układ jest widoczny dla klientów.");
  }catch(ex){setError(ex instanceof Error?ex.message:"Nie udało się opublikować strony.")}
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
 const loadMedia=async()=>{
  setLibraryOpen(true);
  try{setMedia(await auth.request<Media[]>("/api/admin/home/media"))}
  catch(ex){setError(ex instanceof Error?ex.message:"Nie odczytano biblioteki mediów")}
 };
 const upload=async(file:File)=>{
  setUploading(true);setError("");
  try{
   const url=await uploadMedia(file,auth.request);
   setMedia(x=>[{url,name:file.name,bytes:file.size},...x]);
   if(selected)edit(d=>{const part=d.sections.find(x=>x.id===selected.id);if(!part)return;part.settings.image=url;if(part.type==="campaign"){part.settings.image_alt="";part.settings.image_illustrative=true;}});
   setLibraryOpen(false);setMessage("Zdjęcie dodano do biblioteki i szkicu. Zapisz i opublikuj, aby pokazać je klientom.");
  }catch(ex){setError(ex instanceof Error?ex.message:"Nie udało się przesłać zdjęcia")}
  finally{setUploading(false)}
 };
 const campaignChoices=selected?.type==="campaign"?store.products.filter(p=>String(selected.settings.product_ids).split(",").map(x=>Number(x.trim())).includes(p.id)).flatMap(p=>productImages(p).filter(img=>img.role==="model"||img.role==="lifestyle").map(img=>({product:p,image:img}))):[];
 const chooseCampaignImage=(img:ProductMedia)=>{
  if(!selected)return;
  edit(d=>{const part=d.sections.find(x=>x.id===selected.id);if(part)Object.assign(part.settings,{image:img.url,image_alt:img.alt,image_role:img.role,image_illustrative:img.illustrative});});
 };
 const field=(f:Field)=>{
  if(!selected)return null;
  if(selected.type==="campaign"&&f.key==="product_ids"){
   const ids=String(selected.settings.product_ids||"").split(",").map(Number).filter(Boolean);
   return <fieldset key={f.key} className="home-campaign-products"><legend>Produkty kampanii</legend>{store.products.map(p=><label key={p.id}><input type="checkbox" checked={ids.includes(p.id)} onChange={e=>{const next=e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id);edit(d=>{const part=d.sections.find(x=>x.id===selected.id);if(!part)return;part.settings.product_ids=next.join(",");const image=String(part.settings.image);if(ids.includes(p.id)&&!e.target.checked&&productImages(p).some(img=>img.url===image)){part.settings.image="";part.settings.image_alt="";part.settings.image_illustrative=true;part.enabled=false;}});}}/>{p.name}</label>)}</fieldset>;
  }
  if(selected.type==="campaign"&&f.key==="image")return <div key={f.key} className="home-edit-field"><span>Zdjęcie kampanii</span><div className="home-edit-image">{selected.settings.image?<img src={String(selected.settings.image)} alt={String(selected.settings.image_alt)}/>:<span>Brak zdjęcia</span>}</div>{selected.settings.image_illustrative===true&&selected.settings.image&&<small>Materiał poglądowy</small>}<label>Zdjęcie z galerii powiązanego produktu<select value={String(selected.settings.image||"")} onChange={e=>{const choice=campaignChoices.find(x=>x.image.url===e.target.value);if(choice)chooseCampaignImage(choice.image);}}><option value="">Wybierz zdjęcie</option>{selected.settings.image&&!campaignChoices.some(x=>x.image.url===selected.settings.image)&&<option value={String(selected.settings.image)}>Własny przesłany obraz</option>}{campaignChoices.map(({product,image})=><option key={product.id+image.id} value={image.url}>{product.name} · {image.alt||image.role}{image.illustrative?" · Materiał poglądowy":""}</option>)}</select></label>{!campaignChoices.length&&<small>Brak zdjęć „Na modelu” lub „Lifestyle” w galeriach wybranych produktów. Dodaj pasujące materiały w galerii produktu lub prześlij zdjęcie poniżej.</small>}<label className="home-edit-media-btn">{uploading?"Przetwarzanie / wysyłanie…":"Prześlij pasujące zdjęcie"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>{if(e.target.files?.[0])void upload(e.target.files[0]);e.target.value="";}}/></label><small>JPG, PNG, WebP do 25 MB · automatycznie dopasujemy zdjęcie do sklepu. Uzupełnij opis i potwierdź zgodność produktu, koloru i wzoru.</small></div>;
  if(selected.type==="campaign"&&f.key==="image_illustrative")return <label key={f.key} className="home-campaign-truth"><input type="checkbox" checked={selected.settings.image_illustrative!==false} onChange={e=>{if(e.target.checked||window.confirm("Potwierdzam, że zdjęcie przedstawia dokładnie produkty kampanii, ich kolor i wzór. Czy usunąć oznaczenie „Materiał poglądowy”?"))updateSection(selected.id,"image_illustrative",e.target.checked);}}/>Materiał poglądowy</label>;
  const val=selected.settings[f.key];
  const change=(v:string|number|boolean)=>updateSection(selected.id,f.key,v);
  return <label className="home-edit-field" key={f.key}><span>{f.label}</span>
   {f.type==="short"||f.type==="url"?<input value={String(val??"")} onChange={e=>change(e.target.value)} maxLength={f.type==="url"?390:250} placeholder={f.type==="url"?"/sklep":"Wpisz tekst"} spellCheck/>:null}
   {f.type==="long"?<textarea value={String(val??"")} onChange={e=>change(e.target.value)} maxLength={1300} rows={4}/>:null}
   {f.type==="number"?<input type="number" value={Number(val??0)} min={f.min} max={f.max} onChange={e=>change(Math.max(f.min??0,Math.min(f.max??999,Number(e.target.value)||0)))}/>:null}
   {f.type==="color"?<div className="home-edit-color"><input type="color" value={String(val)} onChange={e=>change(e.target.value)}/><input value={String(val)} onChange={e=>change(e.target.value)} maxLength={7}/></div>:null}
   {f.type==="select"?<select value={String(val)} onChange={e=>change(typeof val==="number"?Number(e.target.value):e.target.value)}>{f.options?.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select>:null}
   {f.type==="toggle"?<button type="button" className={"home-edit-toggle "+(val?"on":"")} aria-pressed={val===true} onClick={()=>change(!val)}><span/>{val?"Włączone":"Wyłączone"}</button>:null}
   {f.type==="product"?<select value={Number(val)||1} onChange={e=>change(Number(e.target.value))}>{store.products.map(p=><option value={p.id} key={p.id}>#{p.id} {p.name}</option>)}</select>:null}
   {f.type==="image"?<><div className="home-edit-image">{String(val)?<img src={String(val)} alt="Aktualny obraz sekcji"/>:<span>Brak obrazu</span>}</div><button type="button" className="home-edit-media-btn" onClick={()=>void loadMedia()}><ImagePlus size={16}/> Wybierz lub prześlij zdjęcie</button></>:null}
   {f.hint&&<small>{f.hint}</small>}
  </label>;
 };
 return <section className="home-builder">
  <header className="home-builder-bar"><div><span className="home-builder-eyebrow">STORE DESIGN / HOME PAGE</span><h2>Edytor strony głównej</h2><p>{loaded?"Wersja "+remote?.revision+" · publikacja "+remote?.published_revision:"Pobieranie strony..."}</p></div>
   <div className="home-builder-toolbar"><button onClick={useUndo} disabled={!undo.length} title="Cofnij"><Undo2 size={17}/></button><button onClick={useRedo} disabled={!redo.length} title="Ponów"><Redo2 size={17}/></button>
   <button onClick={()=>void showVersions()} disabled={!loaded}><History size={17}/><span>Historia</span></button>
   <button className="home-builder-save" onClick={()=>void save()} disabled={!loaded||saving||busy||!isDirty}><Save size={17}/><span>Zapisz szkic</span></button>
   <button className="home-builder-publish" onClick={()=>void publish()} disabled={!loaded||saving||busy}><Send size={17}/><span>Opublikuj</span></button></div>
  </header>
  {error&&<div className="home-builder-message error" role="alert"><AlertCircle size={18}/>{error}<button onClick={()=>setError("")}><X size={17}/></button></div>}
  {message&&<div className="home-builder-message success" role="status"><CheckCircle2 size={18}/>{message}<button onClick={()=>setMessage("")}><X size={17}/></button></div>}
  {isDirty&&<p className="home-builder-unsaved"><span/> Niezapisane zmiany — widoczne tylko w podglądzie edytora</p>}
  <div className="home-builder-workspace">
   <aside className="home-builder-outline"><div className="home-builder-side-head"><div><Layers3 size={18}/> Sekcje <b>{draft.sections.length}</b></div><small>{enabled} aktywnych</small></div>
    <div className="home-builder-list">{draft.sections.map((sec,index)=><div key={sec.id} className={"home-builder-item "+(sec.id===selection?"active":"")+(sec.enabled?"":" disabled")+(dragging===sec.id?" dragging":"")} draggable onDragStart={e=>{setDragging(sec.id);e.dataTransfer.effectAllowed="move"}} onDragEnd={()=>setDragging(null)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!dragging||dragging===sec.id)return;edit(d=>{const from=d.sections.findIndex(x=>x.id===dragging),to=d.sections.findIndex(x=>x.id===sec.id);if(from<0||to<0)return;const [part]=d.sections.splice(from,1);d.sections.splice(to,0,part)});setDragging(null)}}>
     <button type="button" className="home-builder-item-main" onClick={()=>setSelection(sec.id)}><b>{String(index+1).padStart(2,"0")}</b><span><strong>{SECTION_DESCRIPTIONS[sec.type].name}</strong><small>{String(sec.settings.title||sec.settings.eyebrow||"Sekcja").slice(0,42)}</small></span></button>
     <div className="home-builder-item-actions" onClick={e=>e.stopPropagation()}>
      <button aria-label="Przesuń w górę" title="Przesuń w górę" disabled={index===0} onClick={()=>action(sec.id,"up")}><ArrowUp size={14}/></button>
      <button aria-label="Przesuń w dół" title="Przesuń w dół" disabled={index===draft.sections.length-1} onClick={()=>action(sec.id,"down")}><ArrowDown size={14}/></button>
      <button aria-label={sec.enabled?"Ukryj":"Pokaż"} title={sec.enabled?"Ukryj":"Pokaż"} onClick={()=>action(sec.id,"toggle")}>{sec.enabled?<Eye size={14}/>:<EyeOff size={14}/>}</button>
     </div>
    </div>)}</div>
    <button className="home-builder-add" onClick={()=>setAddOpen(true)}><Plus size={18}/> Dodaj sekcję</button>
   </aside>
   <div className="home-builder-stage"><div className="home-builder-stage-head"><div><span className="home-builder-stage-dot"/> PODGLĄD NA ŻYWO</div><div><button className={device==="desktop"?"on":""} onClick={()=>setDevice("desktop")} title="Komputer"><Monitor size={17}/></button><button className={device==="mobile"?"on":""} onClick={()=>setDevice("mobile")} title="Telefon"><Smartphone size={17}/></button><a href="/" target="_blank" rel="noreferrer" title="Opublikowany sklep"><ExternalLink size={17}/></a></div></div>
    <div className={"home-builder-stage-scroll "+device}>
     <div className="home-builder-preview-wrap"><iframe ref={preview} src="/admin/podglad" title="Interaktywny podgląd edytowanej strony" onLoad={notify}/></div>
    </div>
    <div className="home-builder-stage-foot">Ten podgląd korzysta z tych samych komponentów co publiczna strona. Zmiany są prywatne do publikacji.</div>
   </div>
   <aside className="home-builder-properties"><div className="home-builder-side-head"><div>Ustawienia sekcji</div>{selected&&<button title="Duplikuj" onClick={()=>action(selected.id,"duplicate")}><Copy size={17}/></button>}</div>
    {selected?<><div className="home-builder-prop-intro"><span>{SECTION_DESCRIPTIONS[selected.type].name.toUpperCase()}</span><p>{SECTION_DESCRIPTIONS[selected.type].about}</p></div>
     <div className="home-builder-fields">{EDIT_FIELDS[selected.type].map(field)}</div>
     <div className="home-builder-prop-footer"><button onClick={()=>action(selected.id,"toggle")}>{selected.enabled?<EyeOff size={15}/>:<Eye size={15}/>} {selected.enabled?"Ukryj sekcję":"Pokaż sekcję"}</button><button className="danger" onClick={()=>action(selected.id,"delete")}><Trash2 size={16}/> Usuń</button></div>
    </>:<p className="home-builder-placeholder">Wybierz sekcję po lewej.</p>}
   </aside>
  </div>
  {addOpen&&<div className="home-builder-overlay" role="dialog" aria-modal="true" aria-label="Dodaj sekcję" onClick={()=>setAddOpen(false)}><div className="home-builder-dialog" onClick={e=>e.stopPropagation()}><div className="home-builder-dialog-head"><div><span>BIBLIOTEKA SEKCJI</span><h3>Dodaj element strony</h3></div><button onClick={()=>setAddOpen(false)}><X size={21}/></button></div><div className="home-builder-types">{TYPES.map(type=><button key={type} onClick={()=>add(type)}><span className="home-builder-type-icon"><Plus size={20}/></span><span><strong>{SECTION_DESCRIPTIONS[type].name}</strong><small>{SECTION_DESCRIPTIONS[type].about}</small></span></button>)}</div></div></div>}
  {libraryOpen&&<div className="home-builder-overlay" role="dialog" aria-modal="true" aria-label="Biblioteka zdjęć" onClick={()=>setLibraryOpen(false)}><div className="home-builder-dialog" onClick={e=>e.stopPropagation()}><div className="home-builder-dialog-head"><div><span>MEDIA LIBRARY</span><h3>Zdjęcia i grafiki</h3></div><button onClick={()=>setLibraryOpen(false)}><X size={21}/></button></div>
   <label className="home-builder-upload"><ImagePlus size={26}/><strong>{uploading?"Wysyłanie zdjęcia...":"Prześlij nowe zdjęcie"}</strong><small>JPG, PNG lub WebP do 25 MB · automatyczne dopasowanie zdjęcia</small><input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>{if(e.target.files?.[0])void upload(e.target.files[0])}}/></label>
   <div className="home-builder-media-grid">{[...media,...catalogueImages.map(img=>({...img,bytes:0}))].map(item=><button key={item.url} onClick={()=>{if(selected)updateSection(selected.id,"image",item.url);setLibraryOpen(false)}}><img src={item.url} alt={item.name}/><span>{item.name}</span></button>)}</div>
  </div></div>}
  {versionsOpen&&<div className="home-builder-overlay" role="dialog" aria-modal="true" aria-label="Historia strony" onClick={()=>setVersionsOpen(false)}><div className="home-builder-dialog home-builder-history" onClick={e=>e.stopPropagation()}><div className="home-builder-dialog-head"><div><span>HISTORIA / ROLLBACK</span><h3>Poprzednie wersje</h3></div><button onClick={()=>setVersionsOpen(false)}><X size={21}/></button></div><p>Przywracanie nie publikuje zmian — zapisuje wskazaną wersję do szkicu.</p><div>{revisions.map(rev=><div className="home-builder-version" key={rev.id}><span><strong>Wersja {rev.revision}</strong><small>{FORMAT.format(new Date(rev.created))} · {rev.action==="published"?"Opublikowana":rev.action==="draft"?"Szkic":"Pierwotna"}</small></span><button disabled={busy} onClick={()=>void restore(rev.id)}><RefreshCw size={15}/> Przywróć</button></div>)}</div></div></div>}
 </section>;
}
