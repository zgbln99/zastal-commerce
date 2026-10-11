"use client";
import {useEffect,useState} from "react";
import {ApiError,useAuth} from "../../components/AuthProvider";
import {useStore} from "../../components/StoreProvider";
import {normalizeImages,uploadBatch,persistGallery,type GalleryResponse,type ProductMedia} from "../../lib/product-media.mjs";
import {uploadMedia} from "../../lib/media-upload";
export type GalleryDraft={images:ProductMedia[];revision:number;loaded:boolean;dirty:boolean;conflict:boolean};
export const emptyGallery=():GalleryDraft=>({images:[],revision:0,loaded:true,dirty:false,conflict:false});
const roles={packshot:"Produkt / packshot",model:"Na modelu",detail:"Detal",lifestyle:"Lifestyle"};
export default function ProductGalleryEditor({productId,name,value,onChange,onSaved,onBusy,parentBusy=false}:{productId?:number;name:string;value:GalleryDraft;onChange:(value:GalleryDraft)=>void;onSaved:()=>Promise<void>;onBusy:(busy:boolean)=>void;parentBusy?:boolean}){
 const auth=useAuth(),store=useStore();
 const [error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[progress,setProgress]=useState({done:0,total:0}),[failed,setFailed]=useState<{file:File;error:string}[]>([]),[remote,setRemote]=useState<GalleryResponse|null>(null),[dragged,setDragged]=useState<string|null>(null);
 const working=(state:boolean)=>{setBusy(state);onBusy(state);};
 useEffect(()=>{
  if(!productId||value.loaded)return;
  let cancelled=false;
  auth.request<GalleryResponse>(`/api/admin/products/${productId}/gallery`).then(out=>{if(!cancelled)onChange({images:normalizeImages(out.images),revision:out.revision,loaded:true,dirty:false,conflict:false});}).catch(ex=>{if(!cancelled)setError(ex.message);});
  return()=>{cancelled=true;};
 },[productId,value.loaded,auth.request]);
 const edit=(images:ProductMedia[])=>{onChange({...value,images,dirty:true});setMessage("");};
 const update=(id:string,patch:Partial<ProductMedia>)=>edit(value.images.map(img=>img.id===id?{...img,...patch}:img));
 const move=(from:number,to:number)=>{if(from<0||to<0||to>=value.images.length||from===to)return;const images=[...value.images], [image]=images.splice(from,1);images.splice(to,0,image);edit(images);};
 const upload=async(files:File[])=>{
  if(!files.length)return;
  if(files.length+value.images.length>20){setError("Galeria może zawierać maksymalnie 20 zdjęć. Wybierz mniej plików.");return;}
  working(true);setError("");setProgress({done:0,total:files.length});
  try{
   const result=await uploadBatch(files,f=>uploadMedia(f,auth.request),setProgress);
   const images=[...value.images];let duplicates=0;
   for(const item of result.uploaded){if(images.some(img=>img.url===item.url)){duplicates++;continue;}images.push({id:crypto.randomUUID(),url:item.url,role:"packshot",alt:name.slice(0,250),illustrative:true,source_url:""});}
   if(result.uploaded.length)edit(images);
   setFailed(result.failed);
   setMessage(`${result.uploaded.length-duplicates} dodanych zdjęć${duplicates?`; pominięto ${duplicates} duplikatów`:""}. Zapisz galerię, aby przypisać je do produktu.`);
  }finally{setProgress({done:0,total:0});working(false);}
 };
 const save=async()=>{
  if(!productId||!value.loaded||value.conflict)return;
  working(true);setError("");setMessage("");
  try{
   const out=await persistGallery(productId,value.images,value.revision,auth.request);
   onChange({images:normalizeImages(out.images),revision:out.revision,loaded:true,dirty:false,conflict:false});
   setRemote(null);setMessage("Galeria zapisana. Pierwsze zdjęcie jest okładką produktu.");await store.refresh();await onSaved();
  }catch(ex){if(ex instanceof ApiError&&ex.status===409)onChange({...value,conflict:true});setError(ex instanceof Error?ex.message:"Nie zapisano galerii.");}
  finally{working(false);}
 };
 const reload=async()=>{
  if(!productId)return;working(true);setError("");
  try{setRemote(await auth.request<GalleryResponse>(`/api/admin/products/${productId}/gallery`));setMessage("Wersja serwera pobrana. Twoje niezapisane zdjęcia i opisy pozostają w edytorze.");}catch(ex){setError(ex instanceof Error?ex.message:"Nie pobrano galerii.");}finally{working(false);}
 };
 return <fieldset className="admin-gallery-editor" disabled={busy||parentBusy}>
  <legend>Galeria zdjęć produktu</legend><p>Pierwsze zdjęcie jest okładką. Usunięcie odłącza zdjęcie od produktu; plik pozostaje w bibliotece. Role nie potwierdzają autentyczności zdjęcia.</p>
  {!value.loaded&&<><p role="status">Wczytywanie galerii…</p>{error&&<button type="button" onClick={()=>void auth.request<GalleryResponse>(`/api/admin/products/${productId}/gallery`).then(out=>{onChange({images:normalizeImages(out.images),revision:out.revision,loaded:true,dirty:false,conflict:false});setError("");}).catch(ex=>setError(ex.message))}>Spróbuj pobrać ponownie</button>}</>}
  {value.loaded&&<><label className="admin-product-upload">Dodaj wiele zdjęć<input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e=>{void upload(Array.from(e.target.files||[]));e.target.value="";}}/><small>JPG, PNG, WebP · plik wejściowy do 25 MB · proporcjonalna optymalizacja do 1,2 MB</small></label>
  {busy&&progress.total>0&&<div role="status">Przetwarzanie / wysyłanie: {progress.done} / {progress.total}<progress value={progress.done} max={progress.total}/></div>}
  {failed.length>0&&<div role="alert"><ul>{failed.map((failure,i)=><li key={i}>{failure.file.name}: {failure.error}</li>)}</ul><button type="button" onClick={()=>void upload(failed.map(x=>x.file))}>Ponów nieudane pliki</button></div>}
  {!value.images.length&&<p>Brak zdjęć w galerii. Dotychczasowe zdjęcie produktu pozostaje dostępne jako materiał poglądowy. Role „Na modelu” i „Lifestyle” czekają na pasujące materiały.</p>}
  <div className="admin-gallery-list">{value.images.map((img,i)=><article key={img.id} className={dragged===img.id?"dragging":""} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();move(value.images.findIndex(x=>x.id===dragged),i);setDragged(null);}}>
   <div className="admin-gallery-preview"><button type="button" className="gallery-drag" draggable onDragStart={e=>{setDragged(img.id);e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",img.id);}} onDragEnd={()=>setDragged(null)} aria-label={`Przeciągnij zdjęcie ${i+1}`}>↕ Przeciągnij</button><img src={img.url} alt={img.alt} onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src="/assets/product-unavailable.svg";}}/>{img.illustrative&&<small>Materiał poglądowy</small>}<strong>{i===0?"Okładka":`Zdjęcie ${i+1}`}</strong></div>
   <div className="admin-gallery-fields"><label>Rola<select value={img.role} onChange={e=>update(img.id,{role:e.target.value as ProductMedia["role"]})}>{Object.entries(roles).map(([role,label])=><option key={role} value={role}>{label}</option>)}</select></label><label>Opis alternatywny<input value={img.alt} maxLength={250} onChange={e=>update(img.id,{alt:e.target.value})}/></label><label>Źródło (opcjonalny adres HTTPS)<input type="url" value={img.source_url} maxLength={400} placeholder="https://…" onChange={e=>update(img.id,{source_url:e.target.value})}/></label><label className="admin-checkbox"><input type="checkbox" checked={img.illustrative} onChange={e=>{if(e.target.checked||window.confirm("Potwierdzam, że to autentyczne zdjęcie dokładnie tego produktu, koloru i wzoru. Czy usunąć oznaczenie „Materiał poglądowy”?"))update(img.id,{illustrative:e.target.checked});}}/>Materiał poglądowy</label><div className="admin-gallery-actions"><button type="button" disabled={i===0} onClick={()=>move(i,i-1)} aria-label={`Przesuń zdjęcie ${i+1} w górę`}>↑ W górę</button><button type="button" disabled={i===value.images.length-1} onClick={()=>move(i,i+1)} aria-label={`Przesuń zdjęcie ${i+1} w dół`}>↓ W dół</button><button type="button" onClick={()=>edit(value.images.filter(x=>x.id!==img.id))}>Odłącz zdjęcie</button></div></div>
  </article>)}</div>
  {value.conflict&&<div className="account-error" role="alert"><p>Galeria została zmieniona w innym edytorze. Twoje zmiany są zachowane. Pobierz wersję serwera i wybierz, jak je uzgodnić.</p><button type="button" onClick={()=>void reload()}>Pobierz wersję serwera</button>{remote&&<div><p>Wersja serwera {remote.revision} · {remote.images.length} zdjęć</p><div className="admin-gallery-conflict-preview">{remote.images.map(img=><figure key={img.id}><img src={img.url} alt={img.alt}/><figcaption>{img.alt} · {img.role}{img.illustrative?" · Materiał poglądowy":""}</figcaption></figure>)}</div><button type="button" onClick={()=>{if(window.confirm("Zastąpić niezapisane zmiany wersją serwera?")){onChange({images:normalizeImages(remote.images),revision:remote.revision,loaded:true,dirty:false,conflict:false});setRemote(null);setError("");}}}>Użyj wersji serwera</button><button type="button" onClick={()=>{if(window.confirm("Zachować moje zmiany i przygotować zapis zastępujący pobraną wersję serwera? Sprawdź różnice przed kolejnym zapisem.")){onChange({...value,revision:remote.revision,conflict:false});setRemote(null);setError("");}}}>Zachowaj moje zmiany do ponownego zapisu</button></div>}</div>}
  {productId?<button type="button" className="button button-outline" disabled={!value.dirty||value.conflict} onClick={()=>void save()}>Zapisz tylko galerię</button>:<p>Zdjęcia zostaną przypisane po utworzeniu produktu.</p>}
  </>}{error&&<p className="account-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 </fieldset>;
}
