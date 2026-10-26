"use client";
import {useEffect,useState} from "react";
import HomeCanvas from "../../../components/HomeCanvas";
import {can,useAuth} from "../../../components/AuthProvider";
import {DEFAULT_HOME,type HomeConfig} from "../../../lib/home-layout";

/** Same component tree as the live homepage, fed by private editor state. */
export default function PreviewPage(){
 const auth=useAuth();
 const [config,setConfig]=useState<HomeConfig>(DEFAULT_HOME);
 useEffect(()=>{
  const listen=(event:MessageEvent)=>{
   if(event.origin!==window.location.origin||event.source!==window.parent)return;
   if(event.data?.kind!=="zastal:home:preview")return;
   const candidate=event.data.config;
   if(candidate?.version!==1||!Array.isArray(candidate.sections)||candidate.sections.length>25)return;
   setConfig(candidate);
  };
  window.addEventListener("message",listen);
  window.parent.postMessage({kind:"zastal:home:ready"},window.location.origin);
  return()=>window.removeEventListener("message",listen);
 },[]);
 if(auth.loading)return <main style={{padding:"3rem"}}>Ładowanie podglądu...</main>;
 if(!can(auth.user,"cms"))return <main style={{padding:"3rem"}}>Podgląd jest dostępny tylko w panelu administratora.</main>;
 return <HomeCanvas config={config}/>;
}
