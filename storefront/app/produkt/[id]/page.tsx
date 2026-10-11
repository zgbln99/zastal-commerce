import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductDetail from "./ProductDetail";
import "./product.css";
import { catalog } from "../../../lib/catalog";
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
 const {id}=await params;
 const item=catalog.find(x=>x.id===Number(id));
 if(!item)return {title:"Produkt",description:"Odzież i akcesoria Zastalu Zielona Góra"};
 return {title:item.name,description:[item.subtitle,"Kolekcja kibica Zastal Zielona Góra."].filter(Boolean).join(" "),openGraph:{title:item.name,description:item.subtitle,type:"website",images:[item.image]}};
}
export default async function ProductPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const productId=Number(id);
 if(!/^[1-9][0-9]*$/.test(id)||!Number.isSafeInteger(productId))notFound();
 return <ProductDetail key={productId} productId={productId}/>;
}
