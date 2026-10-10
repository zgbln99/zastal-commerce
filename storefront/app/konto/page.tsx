import {Suspense} from "react";
import AccountClient from "./AccountClient";
export const metadata={title:"Moje konto"};
export default function AccountPage(){return <Suspense fallback={<div className="container account-page">Wczytywanie konta…</div>}><AccountClient/></Suspense>;}
