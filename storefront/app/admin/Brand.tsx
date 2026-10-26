"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {ArrowDown,ArrowUp,ImagePlus,Plus,Save,Trash2,Trophy} from "lucide-react";
import {useAuth} from "../../components/AuthProvider";
type Competition={key:string;name:string;url:string;image:string;enabled:boolean};
type Config={tagline:string;competitions:Competition[]};
const readFile=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Nie udało się odczytać pliku."));reader.readAsDataURL(file);});
/** Tagline under the shop name and the competition logotypes (league, cup) shown in the menu bar, the drawer and the footer. */
export default function Brand(){
 const auth=useAuth();
 const [config,setConfig]=useState<Config|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[uploading,setUploading]=useState<number|null>(null);
 const files=useRef<Record<number,HTMLInputElement|null>>({});
 const load=useCallback(async()=>{try{setConfig(await auth.request<Config>("/api/admin/brand"));setError("");}catch(e){setError(e instanceof Error?e.message:"Nie można pobrać ustawień marki.");}},[auth.request]);
 useEffect(()=>{void load();},[load]);
 const edit=(index:number,patch:Partial<Competition>)=>setConfig(c=>c&&{...c,competitions:c.competitions.map((item,i)=>i===index?{...item,...patch}:item)});
 const move=(index:number,step:number)=>setConfig(c=>{if(!c)return c;const next=[...c.competitions];const target=index+step;if(target<0||target>=next.length)return c;[next[index],next[target]]=[next[target],next[index]];return {...c,competitions:next};});
 const upload=async(index:number,file:File|undefined)=>{if(!file)return;if(!["image/png","image/webp"].includes(file.type)){setError("Logo wgraj jako PNG z przezroczystością albo WebP.");return;}if(file.size>1_000_000){setError("Plik logo może mieć maksymalnie 1 MB.");return;}
  setUploading(index);setError("");try{const image=await readFile(file);const result=await auth.request<{url:string}>("/api/admin/brand/logo",{method:"POST",body:JSON.stringify({image})});edit(index,{image:result.url});}
  catch(e){setError(e instanceof Error?e.message:"Nie udało się wgrać logo.");}finally{setUploading(null);}};
 const save=async(e:React.FormEvent)=>{e.preventDefault();if(!config||busy)return;setBusy(true);setError("");setMessage("");
  try{setConfig(await auth.request<Config>("/api/admin/brand",{method:"PATCH",body:JSON.stringify(config)}));setMessage("Zapisano. Logotypy i podpis są już widoczne w sklepie.");}
  catch(err){setError(err instanceof Error?err.message:"Nie udało się zapisać.");}finally{setBusy(false);}};
 if(!config)return <p className="staff-empty">{error||"Wczytywanie ustawień marki…"}</p>;
 return <form onSubmit={save}>
  {error&&<p className="account-error" role="alert">{error}</p>}{message&&<p className="admin-list-success" role="status">{message}</p>}
  <section className="admin-panel"><div className="admin-list-actions"><p><Trophy size={16}/> Logotypy rozgrywek pokazują się w pasku menu, w menu na telefonie i w stopce. Wgraj oficjalne pliki otrzymane od ligi i FIBA (PNG z przezroczystym tłem). Rozgrywki bez pliku nie są pokazywane w sklepie.</p></div>
   <div className="admin-form-grid"><label>Podpis pod nazwą sklepu<input value={config.tagline} maxLength={60} onChange={e=>setConfig({...config,tagline:e.target.value})}/><small>Np. „Oficjalny sklep klubu”. Widoczny w stopce i w nagłówku e-maili.</small></label></div>
  </section>
  <section className="admin-panel"><div className="admin-list-actions"><p>Rozgrywki ({config.competitions.length}/6)</p><button type="button" className="button button-outline" disabled={config.competitions.length>=6} onClick={()=>setConfig({...config,competitions:[...config.competitions,{key:"",name:"",url:"",image:"",enabled:true}]})}><Plus size={15}/> Dodaj rozgrywki</button></div>
   <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Logo</th><th>Nazwa</th><th>Adres www</th><th>Widoczne</th><th>Kolejność</th><th></th></tr></thead><tbody>
    {config.competitions.map((item,index)=><tr key={index}>
     <td><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{width:88,height:44,display:"flex",alignItems:"center",justifyContent:"center",background:"#f2f5ee",borderRadius:8,overflow:"hidden"}}>{item.image?<img src={item.image} alt="" style={{maxWidth:80,maxHeight:40,objectFit:"contain"}}/>:<small>brak</small>}</span>
      <input ref={el=>{files.current[index]=el;}} type="file" accept="image/png,image/webp" hidden onChange={e=>void upload(index,e.target.files?.[0])}/>
      <button type="button" className="button button-outline" disabled={uploading===index} onClick={()=>files.current[index]?.click()}><ImagePlus size={14}/> {uploading===index?"Wgrywanie…":item.image?"Zmień":"Wgraj"}</button>{item.image&&<button type="button" className="inline-link" onClick={()=>edit(index,{image:""})}>Usuń logo</button>}</div></td>
     <td><input value={item.name} required maxLength={60} placeholder="Orlen Basket Liga" onChange={e=>edit(index,{name:e.target.value})}/></td>
     <td><input value={item.url} maxLength={300} placeholder="https://…" inputMode="url" onChange={e=>edit(index,{url:e.target.value})}/></td>
     <td><label className="pos-confirm"><input type="checkbox" checked={item.enabled} onChange={e=>edit(index,{enabled:e.target.checked})}/><span>{item.enabled?"tak":"nie"}</span></label></td>
     <td><div className="admin-row-actions"><button type="button" className="icon-btn" aria-label="W górę" disabled={index===0} onClick={()=>move(index,-1)}><ArrowUp size={15}/></button><button type="button" className="icon-btn" aria-label="W dół" disabled={index===config.competitions.length-1} onClick={()=>move(index,1)}><ArrowDown size={15}/></button></div></td>
     <td><button type="button" className="icon-btn" aria-label="Usuń rozgrywki" onClick={()=>setConfig({...config,competitions:config.competitions.filter((_,i)=>i!==index)})}><Trash2 size={15}/></button></td>
    </tr>)}
   </tbody></table></div>
   {!config.competitions.length&&<p className="account-empty">Brak rozgrywek. Dodaj ligę i puchar, w których gra Zastal.</p>}
   <div className="admin-list-actions" style={{marginTop:16}}><button className="button button-dark" type="submit" disabled={busy}><Save size={15}/> {busy?"Zapisywanie…":"Zapisz"}</button></div>
  </section>
 </form>;
}
