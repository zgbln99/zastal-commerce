import { Suspense } from "react";
import type { Metadata } from "next";
import CheckoutClient from "./CheckoutClient";
export const metadata: Metadata={title:"Zamówienie",robots:{index:false,follow:false}};
export default function Checkout(){return <Suspense fallback={<div className="container page-heading"><h1>Zamówienie</h1><p>Wczytujemy podsumowanie…</p></div>}><CheckoutClient/></Suspense>}
