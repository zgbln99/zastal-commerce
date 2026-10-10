import type {Metadata} from "next";
import ShopClient from "./ShopClient";
import "./shop.css";
export const metadata:Metadata={
 title:"Wszystkie produkty | Zastal Store",
 description:"Odkryj klubową kolekcję Zastal Zielona Góra. Odzież, koszulki, bluzy, akcesoria i produkty dziecięce — demonstracja sklepu.",
};
export default function Shop(){return <ShopClient/>;}
