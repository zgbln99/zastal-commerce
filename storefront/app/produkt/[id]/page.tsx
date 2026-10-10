import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductDetail from "./ProductDetail";
import "./product.css";
export const metadata:Metadata={title:"Produkt",description:"Odzież i akcesoria Zastalu Zielona Góra"};
export default async function ProductPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const productId=Number(id);
 if(!/^[1-9][0-9]*$/.test(id)||!Number.isSafeInteger(productId))notFound();
 return <ProductDetail key={productId} productId={productId}/>;
}
