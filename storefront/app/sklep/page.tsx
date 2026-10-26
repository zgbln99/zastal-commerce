import { permanentRedirect } from "next/navigation";
import { CATEGORY_PATHS, shopUrl } from "../../lib/urls.mjs";
import type {Metadata} from "next";
import ShopClient from "./ShopClient";
import { Suspense } from "react";
import "./shop.css";
import "../shop-category.css";
export const metadata:Metadata={
 title:"Wszystkie produkty",
 description:"Odkryj kolekcję Zastalu Zielona Góra: koszulki, bluzy, akcesoria i odzież dziecięcą. Sprawdź rozmiary, dostępność i opcje personalizacji.",
};
export default async function Shop({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const values=await searchParams;const category=typeof values.category==="string"?values.category:"";if(CATEGORY_PATHS[category]){const params=new URLSearchParams();for(const [k,v] of Object.entries(values)){if(Array.isArray(v))v.forEach(x=>params.append(k,x));else if(v!==undefined)params.set(k,v);}permanentRedirect(shopUrl(category,params));}return <Suspense fallback={<div className="container page-heading"><h1>Sklep Zastalu</h1><p>Wczytujemy katalog…</p></div>}><ShopClient/></Suspense>;}
