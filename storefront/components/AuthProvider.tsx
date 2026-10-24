"use client";
import {createContext,useCallback,useContext,useEffect,useRef,useState} from "react";
import {Check,Copy,KeyRound} from "lucide-react";
import Modal from "./Modal";
export type User={id:number;identifier:string;name:string;role:string;created:string;email_verified?:boolean;capabilities?:string[]};
export const isStaff=(user:User|null|undefined)=>Array.isArray(user?.capabilities);
export const can=(user:User|null|undefined,capability:string)=>!!user?.capabilities?.includes(capability);
export type Session={user:User|null;csrf_token:string;recovery_key?:string};
export class ApiError extends Error{constructor(message:string,public status:number,public code=""){super(message);this.name="ApiError";}}
export type ApiRequest=<T>(path:string,options?:RequestInit)=>Promise<T>;
type Auth={user:User|null;loading:boolean;error:string;request:ApiRequest;refresh:()=>Promise<Session>;logout:()=>Promise<void>};
const Context=createContext<Auth|null>(null);
export function useAuth(){const value=useContext(Context);if(!value)throw new Error("AuthProvider missing");return value;}
export default function AuthProvider({children}:{children:React.ReactNode}){
 const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [recoveryKey,setRecoveryKey]=useState(""),[saved,setSaved]=useState(false),[copied,setCopied]=useState(false);
 const csrf=useRef(""),generation=useRef(0),channel=useRef<BroadcastChannel|null>(null),pending=useRef<Promise<Session>|null>(null);
 const current=useRef<Session>({user:null,csrf_token:""});
 const apply=useCallback((session:Session,broadcast=false)=>{
  generation.current++;current.current=session;csrf.current=session.csrf_token;setUser(session.user);setError("");
  if(session.recovery_key){setRecoveryKey(session.recovery_key);setSaved(false);setCopied(false);}
  if(broadcast)channel.current?.postMessage("session_changed");
 },[]);
 const refresh=useCallback(async()=>{
  if(pending.current)return pending.current;
  const before=generation.current;
  const promise=(async()=>{
   try{const r=await fetch("/api/auth/session",{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok||typeof data.csrf_token!=="string")throw new ApiError(data.error||"Nie można odczytać sesji konta.",r.status);if(before===generation.current)apply(data);return current.current;}
   catch(e){if(before===generation.current)setError("Nie można połączyć się z kontem. Spróbuj ponownie.");throw e;}
   finally{pending.current=null;setLoading(false);}
  })();pending.current=promise;return promise;
 },[apply]);
 const request=useCallback(async<T,>(path:string,options:RequestInit={}):Promise<T>=>{
  if(!path.startsWith("/api/")||path.startsWith("//"))throw new Error("Only same-origin API paths are permitted");
  const method=(options.method||"GET").toUpperCase();if(method!=="GET"&&!csrf.current)await refresh();
  const headers=new Headers(options.headers);headers.set("Content-Type","application/json");if(method!=="GET")headers.set("X-CSRF-Token",csrf.current);
  let r:Response;try{r=await fetch(path,{...options,method,headers,cache:"no-store",credentials:"same-origin",signal:options.signal||AbortSignal.timeout(15000)});}catch{throw new ApiError("Nie otrzymaliśmy odpowiedzi serwera. Spróbuj ponownie.",0);}
  const data=await r.json().catch(()=>null);
  if(!r.ok){if(r.status===401&&data?.code==="session_required")apply({user:null,csrf_token:""},true);if(data?.code==="csrf_invalid"){await refresh().catch(()=>{});throw new ApiError("Sesja została odświeżona. Spróbuj ponownie.",r.status,data.code);}throw new ApiError(data?.error||"Nie udało się wykonać operacji.",r.status,data?.code);}
  if(data&&typeof data.csrf_token==="string"&&"user"in data)apply(data,true);
  if(data===null)throw new ApiError("Niepoprawna odpowiedź serwera.",r.status);return data as T;
 },[apply,refresh]);
 const logout=useCallback(async()=>{await request("/api/auth/logout",{method:"POST",body:"{}"});},[request]);
 useEffect(()=>{void refresh().catch(()=>{});if(typeof BroadcastChannel!=="undefined"){channel.current=new BroadcastChannel("zastal_account");channel.current.onmessage=()=>void refresh().catch(()=>{});}const focus=()=>void refresh().catch(()=>{});window.addEventListener("focus",focus);return()=>{channel.current?.close();channel.current=null;window.removeEventListener("focus",focus);};},[refresh]);
 return <Context.Provider value={{user,loading,error,request,refresh,logout}}>{children}{recoveryKey&&<Modal title="Zapisz klucz odzyskiwania" onClose={()=>{}} className="recovery-key-modal"><KeyRound size={28}/><h2>Zapisz klucz odzyskiwania</h2><p>Ten klucz pozwoli odzyskać konto, jeśli zapomnisz hasła. Przechowuj go w menedżerze haseł. Pokażemy go tylko teraz.</p><code>{recoveryKey}</code><button className="button button-outline" onClick={async()=>{try{await navigator.clipboard.writeText(recoveryKey);setCopied(true);}catch{setCopied(false);}}}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?"Skopiowano":"Kopiuj klucz"}</button><label className="recovery-saved"><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>Mam klucz zapisany w bezpiecznym miejscu</label><button className="button button-dark" disabled={!saved} onClick={()=>{setRecoveryKey("");setSaved(false);}}>Przejdź do konta</button><small>Klucz jest poufny. Nie wysyłaj go innym osobom.</small></Modal>}</Context.Provider>;
}
