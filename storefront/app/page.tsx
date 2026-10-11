"use client";
import {useEffect,useState} from "react";
import HomeCanvas from "../components/HomeCanvas";
import {DEFAULT_HOME,type HomeConfig} from "../lib/home-layout";

export default function Home(){
 const [config,setConfig]=useState<HomeConfig>(DEFAULT_HOME);
 useEffect(()=>{
  let mounted=true;
  fetch("/api/store/home",{cache:"no-store",signal:AbortSignal.timeout(15000)})
   .then(async r=>{if(!r.ok)throw Error("CMS not ready");return r.json();})
   .then(data=>{if(mounted&&data?.config?.version===1&&Array.isArray(data.config.sections))setConfig(data.config);})
   .catch(()=>{ /* Durable default design while backoffice reconnects. */ });
  return()=>{mounted=false};
 },[]);
 return <HomeCanvas config={config}/>;
}
