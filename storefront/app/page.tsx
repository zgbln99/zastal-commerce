"use client";
import {useState} from "react";
import Link from "next/link";
import {ArrowRight} from "lucide-react";
import ProductCard,{ProductImage} from "../components/ProductCard";
import {useStore} from "../components/StoreProvider";
import {catalog} from "../lib/catalog";
const categories=["Wszystko","Koszulki","Bluzy","Akcesoria","Dzieci"];
export default function Home(){
 const {products}=useStore();const [category,setCategory]=useState("Wszystko");
 const hoodie=products.find(p=>p.id===1)||catalog[0],shirt=products.find(p=>p.id===10)||catalog[9];
 const visible=category==="Wszystko"?products:products.filter(p=>p.category===category);
 return <><section className="container merchandise-banner"><div className="merchandise-banner-copy"><span>ZASTAL ZIELONA GÓRA</span><h1>Sklep kibica</h1><p>Odzież i akcesoria klubowe.<br/>Dla dorosłych i dzieci.</p><Link className="button button-dark" href="/sklep">Zobacz cały sklep <ArrowRight size={16}/></Link></div><Link className="banner-product banner-hoodie" href="/produkt/1"><ProductImage product={hoodie} eager/><span><strong>Bluzy klubowe</strong><small>Zobacz produkt <ArrowRight size={13}/></small></span></Link><Link className="banner-product banner-shirt" href="/produkt/10"><ProductImage product={shirt} eager/><span><strong>Koszulki Zastalu</strong><small>Zobacz produkt <ArrowRight size={13}/></small></span></Link></section>
 <section className="container merchandise-catalog"><div className="merchandise-section-heading"><h2>Produkty</h2><Link href="/sklep">Filtruj i sortuj <ArrowRight size={14}/></Link></div><div className="collection-tabs" aria-label="Kategorie produktów">{categories.map(c=><button key={c} className={category===c?"active":""} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c==="Dzieci"?"Dla dzieci":c}<span>{c==="Wszystko"?products.length:products.filter(p=>p.category===c).length}</span></button>)}</div><div className="product-grid merchandise-grid">{visible.map(p=><ProductCard key={p.id} product={p}/>)}</div>{!visible.length&&<p className="account-empty">Brak produktów w tej kategorii.</p>}</section>
 <section className="container store-service-links"><Link href="/pomoc#dostawa"><strong>Dostawa i odbiór</strong><span>Zobacz dostępne sposoby dostawy</span><ArrowRight size={17}/></Link><Link href="/konto"><strong>Moje konto</strong><span>Zamówienia i ustawienia konta</span><ArrowRight size={17}/></Link><Link href="/pomoc#rozmiary"><strong>Wybór rozmiaru</strong><span>Sprawdź informacje przed zakupem</span><ArrowRight size={17}/></Link></section></>;
}
