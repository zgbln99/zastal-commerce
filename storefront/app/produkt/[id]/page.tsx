import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {catalog} from "../../../lib/catalog";
import ProductDetail from "./ProductDetail";
import "./product.css";
export function generateStaticParams(){return catalog.map(p=>({id:String(p.id)}))}
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
 const {id}=await params;
 const p=catalog.find(x=>x.id===Number(id));
 return {title:p?p.name+" | Zastal Store":"Produkt | Zastal Store",description:p?.subtitle||"Kolekcja Zastal Zielona Góra"};
}
export default async function ProductPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const p=catalog.find(x=>x.id===Number(id));
 if(!p)notFound();
 return <ProductDetail item={p}/>;
}
