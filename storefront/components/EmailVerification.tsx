"use client";
import {useEffect,useRef,useState} from "react";
import {CheckCircle2,Mail} from "lucide-react";
import {useAuth} from "./AuthProvider";
export default function EmailVerification(){
 const auth=useAuth(),[configured,setConfigured]=useState<boolean|null>(null),[unavailable,setUnavailable]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const version=useRef(0);
 useEffect(()=>{const id=++version.current;setMessage("");setBusy(false);setConfigured(null);setUnavailable(false);auth.request<{configured:boolean}>("/api/auth/email/status").then(v=>{if(id===version.current)setConfigured(v.configured);}).catch(()=>{if(id===version.current)setUnavailable(true);});return()=>{version.current++;};},[auth.user?.id,auth.request]);
 if(auth.user?.role!=="customer")return null;
 if(auth.user.email_verified)return <p className="email-verified"><CheckCircle2 size={16}/> Adres e-mail potwierdzony</p>;
 const resend=async()=>{const id=version.current;setBusy(true);setMessage("");try{await auth.request("/api/account/email/verification",{method:"POST",body:"{}"});if(id===version.current)setMessage("Link został dodany do kolejki wysyłki. Sprawdź pocztę, także folder spam.");}catch(e){if(id===version.current)setMessage(e instanceof Error?e.message:"Nie udało się wysłać linku.");}finally{if(id===version.current)setBusy(false);}};
 return <div className="email-verification"><Mail size={19}/><div><strong>Potwierdź adres e-mail</strong><p>{unavailable?"Nie można teraz sprawdzić dostępności wysyłki. Odśwież stronę i spróbuj ponownie.":configured===null?"Sprawdzamy dostępność wysyłki wiadomości…":configured===false?"Wysyłka wiadomości jest chwilowo niedostępna. Twoje konto jest już utworzone.":"Wiadomość z linkiem potwierdzającym czeka na wysłanie. Gdy ją otrzymasz, otwórz link, aby potwierdzić adres."}</p>{message&&<p role="status">{message}</p>}<button className="inline-link" disabled={busy||configured!==true||unavailable} onClick={()=>void resend()}>{busy?"Przygotowywanie…":"Wyślij link ponownie"}</button></div></div>;
}
