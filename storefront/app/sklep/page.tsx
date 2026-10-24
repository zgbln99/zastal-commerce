import type {Metadata} from "next";
import ShopClient from "./ShopClient";
import { Suspense } from "react";
export const metadata:Metadata={
 title:"Wszystkie produkty",
 description:"Odkryj kolekcję Zastalu Zielona Góra: koszulki, bluzy, akcesoria i odzież dziecięcą. Sprawdź rozmiary, dostępność i opcje personalizacji.",
};
export default function Shop(){return <Suspense fallback={<div className="container page-heading"><h1>Sklep Zastalu</h1><p>Wczytujemy katalog…</p></div>}><ShopClient/></Suspense>;}
