import HomeCanvas from "../components/HomeCanvas";
import {DEFAULT_HOME,type HomeConfig} from "../lib/home-layout";

export const dynamic="force-dynamic";

/** SSR reads only public, published CMS content: no client flash of a stale draft. */
export default async function Home(){
 let config:HomeConfig=DEFAULT_HOME;
 try{
  const backend=process.env.ZASTAL_CMS_API||"http://127.0.0.1:8880";
  const response=await fetch(backend+"/api/store/home",{cache:"no-store",signal:AbortSignal.timeout(3000)});
  if(response.ok){
   const payload=await response.json();
   if(payload?.config?.version===1&&Array.isArray(payload.config.sections))config=payload.config;
  }
 }catch{/* Fall back to immutable authored starter when the API is unavailable. */}
 return <HomeCanvas config={config}/>;
}
