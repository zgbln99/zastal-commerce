"use client";
import {useState} from "react";
import PrintPreview from "../../components/PrintPreview";
import type {PrintArea,PrintLayout} from "../../lib/commerce.mjs";
type Area=keyof PrintLayout["areas"];
const fonts:Record<PrintLayout["font"],string>={block:"Blokowy (standard)",condensed:"Zwężony",rounded:"Zaokrąglony"};
const defaultBox:Record<Area,PrintArea>={name:{x:30,y:16,w:40,h:5},number:{x:33,y:24,w:34,h:20}};
/** Admin editor: pick the approved photo, drag name/number boxes, set colour and font; preview uses the customer component. */
export default function PrintLayoutEditor({value,onChange,images,fallbackImage}:{value:PrintLayout|null;onChange:(layout:PrintLayout|null)=>void;images:{url:string;alt:string}[];fallbackImage:string}){
 const [sample,setSample]=useState({name:"KOWALSKI",number:"23"});
 const options=[...images.map(img=>({url:img.url,label:img.alt||img.url})),...(fallbackImage&&!images.some(img=>img.url===fallbackImage)?[{url:fallbackImage,label:"Zdjęcie zapasowe produktu"}]:[])];
 const enable=()=>onChange({image:options[0]?.url||"",areas:{...defaultBox},color:"#ffffff",font:"block",calibrated:false,note:""});
 const update=(patch:Partial<PrintLayout>)=>value&&onChange({...value,...patch});
 const setBox=(area:Area,box:PrintArea|undefined)=>{if(!value)return;const areas={...value.areas};if(box)areas[area]=box;else delete areas[area];onChange({...value,areas});};
 const number=(area:Area,axis:keyof PrintArea,raw:string)=>{const box=value?.areas[area];if(!box)return;const n=Number(raw);if(!Number.isFinite(n))return;setBox(area,{...box,[axis]:Math.max(0,Math.min(100,Math.round(n*100)/100))});};
 if(!value)return <fieldset className="admin-print-layout"><legend>Podgląd nadruku na zdjęciu</legend><p>Bez układu klient zobaczy schemat koszulki. Dodaj układ, aby pokazać nazwisko i numer na zatwierdzonym zdjęciu tego produktu.</p><button type="button" className="button button-outline" disabled={!options.length} onClick={enable}>Skonfiguruj układ nadruku</button>{!options.length&&<small className="form-hint">Najpierw dodaj zdjęcie do galerii lub adres zdjęcia zapasowego.</small>}</fieldset>;
 return <fieldset className="admin-print-layout"><legend>Podgląd nadruku na zdjęciu</legend>
  <div className="admin-print-layout-grid"><div className="admin-print-layout-stage"><PrintPreview layout={value} name={sample.name} number={sample.number} editable onMove={(area,box)=>setBox(area,box)}/><small>Przeciągnij pola na zdjęciu lub wpisz współrzędne w procentach szerokości i wysokości zdjęcia.</small><div className="account-field-row"><label>Przykładowe nazwisko<input value={sample.name} maxLength={20} onChange={e=>setSample({...sample,name:e.target.value})}/></label><label>Przykładowy numer<input value={sample.number} maxLength={2} onChange={e=>setSample({...sample,number:e.target.value})}/></label></div></div>
  <div className="admin-print-layout-fields">
   <label>Zdjęcie (mockup)<select value={value.image} onChange={e=>update({image:e.target.value})}>{!options.some(o=>o.url===value.image)&&<option value={value.image}>{value.image}</option>}{options.map(o=><option key={o.url} value={o.url}>{o.label}</option>)}</select></label>
   {(["name","number"] as Area[]).map(area=>{const box=value.areas[area];return <div key={area} className="admin-print-area"><label className="admin-checkbox"><input type="checkbox" checked={!!box} onChange={e=>setBox(area,e.target.checked?defaultBox[area]:undefined)}/>{area==="name"?"Pole nazwiska":"Pole numeru"}</label>{box&&<div className="admin-print-area-inputs">{(["x","y","w","h"] as (keyof PrintArea)[]).map(axis=><label key={axis}><span>{axis.toUpperCase()} %</span><input type="number" min={0} max={100} step={0.5} value={box[axis]} onChange={e=>number(area,axis,e.target.value)}/></label>)}</div>}</div>;})}
   <div className="account-field-row"><label>Kolor nadruku<input type="color" value={value.color} onChange={e=>update({color:e.target.value})}/></label><label>Krój<select value={value.font} onChange={e=>update({font:e.target.value as PrintLayout["font"]})}>{Object.entries(fonts).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
   <label className="admin-checkbox"><input type="checkbox" checked={value.calibrated} onChange={e=>{if(!e.target.checked||window.confirm("Potwierdzam, że ten układ został porównany z gotowym, fizycznym egzemplarzem produktu i oddaje wielkość oraz położenie nadruku."))update({calibrated:e.target.checked});}}/>Układ skalibrowany na gotowym egzemplarzu (klient widzi mniejsze zastrzeżenie)</label>
   <label>Uwaga produkcyjna (opcjonalnie)<input value={value.note||""} maxLength={200} placeholder="np. numer 18 cm, nazwisko 5 cm, transfer z partii 2026" onChange={e=>update({note:e.target.value})}/></label>
   <button type="button" className="inline-link" onClick={()=>onChange(null)}>Usuń układ (wróć do schematu)</button>
  </div></div>
 </fieldset>;
}
