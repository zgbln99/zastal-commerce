"use client";
import {useMemo,useState} from "react";
import {AlertCircle,ArrowDownToLine,CheckCircle2,FileSpreadsheet,RefreshCw,UploadCloud,Warehouse} from "lucide-react";
import {useAuth} from "../../components/AuthProvider";
import "./inventory-import.css";

type Variant={id:number;name:string;sku:string;size:string;stock:number};
type Row={sku:string;stock:number};
type Result={ok:true;rows:number;changed:number;changes:{sku:string;old:number;new:number;delta:number}[]};

export default function InventoryImport({inventory,onRefresh}:{inventory:Variant[];onRefresh:()=>Promise<boolean>}){
 const auth=useAuth();
 const [name,setName]=useState("");
 const [reason,setReason]=useState("Inwentaryzacja magazynu");
 const [rows,setRows]=useState<Row[]>([]);
 const [parseError,setParseError]=useState("");
 const [apiError,setApiError]=useState("");
 const [result,setResult]=useState<Result|null>(null);
 const [busy,setBusy]=useState(false);
 const local=useMemo(()=>new Map(inventory.map(v=>[v.sku,v])),[inventory]);
 const changes=useMemo(()=>rows.map(row=>({...row,old:local.get(row.sku)?.stock??0,delta:row.stock-(local.get(row.sku)?.stock??0)})),[rows,local]);
 const download=()=>{
  const text="\uFEFFsku;stan\n"+inventory.map(v=>v.sku+";"+v.stock).join("\n")+"\n";
  const url=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="zastal-stany-magazynowe.csv";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const parse=async(file:File)=>{
  setName(file.name);setResult(null);setParseError("");setApiError("");setRows([]);
  if(file.size>25000){setParseError("Plik jest za duży. Maksymalnie 25 KB, 100 wariantów.");return}
  try{
   const content=(await file.text()).replace(/^\uFEFF/,"").trim();
   const lines=content.split(/\r?\n/).filter(line=>line.trim().length>0);
   if(lines.length<2||lines.length>101)throw Error("Import wymaga od 1 do 100 wierszy.");
   const separator=lines[0].includes(";")?";":",";
   const header=lines[0].split(separator).map(s=>s.trim().toLowerCase());
   if(header.length!==2||header[0]!=="sku"||!["stan","stock"].includes(header[1]))
     throw Error("Pierwsza linia musi brzmieć: sku;stan");
   const seen=new Set<string>();
   const parsed:Row[]=[];
   for(let i=1;i<lines.length;i++){
    const cells=lines[i].split(separator).map(x=>x.trim());
    if(cells.length!==2)throw Error("Nieprawidłowa liczba kolumn w wierszu "+(i+1));
    const [sku,stock]=cells;
    if(!local.has(sku))throw Error("SKU nie istnieje w magazynie: "+sku);
    if(seen.has(sku))throw Error("Powtórzony SKU: "+sku);
    if(!/^\d+$/.test(stock)||Number(stock)>100000)throw Error("Nieprawidłowa liczba sztuk w wierszu "+(i+1));
    seen.add(sku);parsed.push({sku,stock:Number(stock)});
   }
   setRows(parsed);
  }catch(e){setParseError(e instanceof Error?e.message:"Nie można odczytać pliku CSV")}
 };
 const save=async()=>{
  if(busy||!rows.length||reason.trim().length<3)return;
  setBusy(true);setApiError("");setResult(null);
  try{
   const response=await auth.request<Result>("/api/admin/inventory/import",{method:"POST",body:JSON.stringify({rows,reason})});
   setResult(response);setRows([]);setName("");await onRefresh();
  }catch(e){setApiError(e instanceof Error?e.message:"Nie udało się zaktualizować stanów")}
  finally{setBusy(false)}
 };
 return <div className="stock-import">
  <header className="stock-import-hero"><div><span>INVENTORY / BATCH OPERATIONS</span><h2>IMPORT STANÓW<br/><em>MAGAZYNOWYCH.</em></h2><p>Przygotuj rzeczywisty spis produktów w arkuszu, zapisz jako CSV i zaktualizuj stany każdego rozmiaru w jednej transakcji.</p></div><FileSpreadsheet size={80} strokeWidth={1}/></header>
  <div className="stock-import-grid">
   <section className="stock-import-panel"><span className="stock-import-kicker">KROK 01</span><h3>Pobierz szablon</h3><p>Plik zawiera istniejące numery SKU oraz bieżący stan. Zmień wyłącznie liczby sztuk; nie zmieniaj identyfikatorów.</p><button className="stock-import-secondary" onClick={download}><ArrowDownToLine size={17}/>POBIERZ CSV Z MAGAZYNU</button><div className="stock-import-hint"><Warehouse size={18}/>{inventory.length} wariantów w katalogu, uwzględniając rozmiary.</div></section>
   <section className="stock-import-panel"><span className="stock-import-kicker">KROK 02</span><h3>Wczytaj poprawiony plik</h3><label className="stock-import-drop"><UploadCloud size={31}/><strong>{name||"Wybierz plik CSV"}</strong><small>Kolumny: sku;stan · do 100 wariantów · maks. 25 KB</small><input type="file" accept=".csv,text/csv" onChange={e=>{const file=e.target.files?.[0];if(file)void parse(file)}}/></label></section>
  </div>
  {(parseError||apiError)&&<div className="stock-import-alert error"><AlertCircle size={18}/>{parseError||apiError}</div>}
  {result&&<div className="stock-import-alert success"><CheckCircle2 size={19}/>Import zakończony. Przeanalizowano {result.rows} wariantów; zaktualizowano {result.changed}. Historia zmian została zapisana.</div>}
  {rows.length>0&&<section className="stock-import-panel stock-import-preview">
   <div className="stock-import-preview-head"><div><span className="stock-import-kicker">KROK 03</span><h3>Sprawdź zmiany przed zapisaniem</h3><p>Nieznane lub powtórzone SKU i nieprawidłowe stany zostają odrzucone przed importem.</p></div><strong>{changes.filter(x=>x.delta!==0).length} ZMIAN</strong></div>
   <div className="stock-import-table-wrap"><table><thead><tr><th>SKU</th><th>BYŁO</th><th>BĘDZIE</th><th>RÓŻNICA</th></tr></thead><tbody>{changes.map(r=><tr key={r.sku}><td>{r.sku}</td><td>{r.old}</td><td>{r.stock}</td><td className={r.delta<0?"stock-import-negative":r.delta>0?"stock-import-positive":""}>{r.delta>0?"+":""}{r.delta}</td></tr>)}</tbody></table></div>
   <div className="stock-import-save"><label>UZASADNIENIE KOREKTY<input minLength={3} maxLength={160} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||reason.trim().length<3} onClick={()=>void save()}>{busy?"ZAPISYWANIE...":"ZATWIERDŹ IMPORT"} <RefreshCw size={17}/></button></div>
  </section>}
  <div className="stock-import-footer-note"><AlertCircle size={18}/> Import nie włącza sprzedaży. Po ukończeniu spisu i potwierdzeniu ilości zatwierdź magazyn w zakładce „Uruchomienie sklepu”.</div>
 </div>;
}
