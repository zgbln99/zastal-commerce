"use client";
import {useEffect,useState} from "react";
import {Maximize2,Minimize2} from "lucide-react";
/** Toggles a kiosk layout for POS and the print station: hides admin chrome and asks the browser for fullscreen. */
export default function StaffFullscreen(){
 const [active,setActive]=useState(false);
 useEffect(()=>{
  document.body.classList.toggle("staff-fullscreen",active);
  const sync=()=>{if(!document.fullscreenElement)setActive(false);};
  document.addEventListener("fullscreenchange",sync);
  return()=>{document.body.classList.remove("staff-fullscreen");document.removeEventListener("fullscreenchange",sync);};
 },[active]);
 const toggle=async()=>{
  if(active){setActive(false);if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});return;}
  setActive(true);
  try{await document.documentElement.requestFullscreen?.();}catch{/* kiosk layout still applies without browser fullscreen */}
 };
 return <button type="button" className="ops-action staff-fullscreen-toggle" onClick={()=>void toggle()} aria-pressed={active}>{active?<Minimize2 size={16}/>:<Maximize2 size={16}/>}{active?"Zamknij pełny ekran":"Pełny ekran"}</button>;
}
