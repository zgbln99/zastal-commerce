import {Suspense} from "react";
import type {Metadata} from "next";
import EmailAction from "./EmailAction";
export const metadata:Metadata={title:"Potwierdzenie e-mail",robots:{index:false,follow:false}};
export default function EmailPage(){return <Suspense fallback={<div className="container account-page">Wczytywanie…</div>}><EmailAction/></Suspense>;}
