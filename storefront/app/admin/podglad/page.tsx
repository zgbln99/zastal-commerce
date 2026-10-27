"use client";
import {useEffect,useState} from "react";
import HomeCanvas from "../../../components/HomeCanvas";
import StoreShell from "../../../components/StoreShell";
import {can,useAuth} from "../../../components/AuthProvider";
import {DEFAULT_HOME,type HomeConfig} from "../../../lib/home-layout";
import "../home-editor.css";

/** Same component tree as the live homepage (with the shop header and footer), fed by private editor state.
 *  Protocol with the editor: it posts {kind:"zastal:home:preview",config} and {kind:"zastal:home:select",id};
 *  this page answers {kind:"zastal:home:ready"} and {kind:"zastal:home:picked",id} when a section is clicked. */
export default function PreviewPage(){
 const auth=useAuth();
 const [config,setConfig]=useState<HomeConfig>(DEFAULT_HOME);
 const [selected,setSelected]=useState("");
 useEffect(()=>{
  const listen=(event:MessageEvent)=>{
   if(event.origin!==window.location.origin||event.source!==window.parent)return;
   const data=event.data;
   if(data?.kind==="zastal:home:preview"){
    const candidate=data.config;
    if(candidate?.version!==1||!Array.isArray(candidate.sections)||candidate.sections.length>25)return;
    setConfig(candidate);
   }
   if(data?.kind==="zastal:home:select"&&typeof data.id==="string"){
    setSelected(data.id);
    if(data.scroll)window.requestAnimationFrame(()=>document.querySelector(`[data-section-id="${CSS.escape(data.id)}"]`)?.scrollIntoView({behavior:"smooth",block:"start"}));
   }
  };
  // The preview is for composing, not browsing: a click selects the section under the cursor and never follows a link or opens a dialog.
  const pick=(event:MouseEvent)=>{
   const target=event.target as Element|null;
   event.preventDefault();event.stopPropagation();
   const id=target?.closest("[data-section-id]")?.getAttribute("data-section-id");
   if(id){setSelected(id);window.parent.postMessage({kind:"zastal:home:picked",id},window.location.origin)}
  };
  const block=(event:SubmitEvent)=>event.preventDefault();
  window.addEventListener("message",listen);
  document.addEventListener("click",pick,true);
  document.addEventListener("submit",block,true);
  window.parent.postMessage({kind:"zastal:home:ready"},window.location.origin);
  return()=>{window.removeEventListener("message",listen);document.removeEventListener("click",pick,true);document.removeEventListener("submit",block,true)};
 },[]);
 if(auth.loading)return <main style={{padding:"3rem"}}>Ładowanie podglądu...</main>;
 if(!can(auth.user,"cms"))return <main style={{padding:"3rem"}}>Podgląd jest dostępny tylko w panelu administratora.</main>;
 return <StoreShell><HomeCanvas config={config} editing selectedId={selected}/></StoreShell>;
}
