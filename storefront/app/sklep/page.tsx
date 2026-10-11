import type {Metadata} from "next";
import ShopClient from "./ShopClient";
import { Suspense } from "react";
import "./shop.css";
import "../shop-category.css";
export const metadata:Metadata={
 title:"Wszystkie produkty",
 description:"Odkryj klubową kolekcję Zastal Zielona Góra. Odzież, koszulki, bluzy, akcesoria i produkty dziecięce — oferta sklepu w przygotowaniu do uruchomienia sprzedaży.",
};
export default function Shop(){return <Suspense fallback={<div className="container page-heading"><h1>Sklep Zastalu</h1><p>Wczytujemy katalog…</p></div>}><ShopClient/></Suspense>;}
