"use client";
import Link from "next/link";
import { ArrowRight, ChevronRight, Heart } from "lucide-react";
import { useStore } from "../../components/StoreProvider";
import ProductCard from "../../components/ProductCard";
export default function Favorites() {
 const store=useStore(); const products=store.products.filter(p=>store.favorites.includes(p.id));
 return <div className="container wishlist-page"><div className="breadcrumbs"><Link href="/">Strona główna</Link><ChevronRight size={11}/><span>Ulubione</span></div><div className="wishlist-intro"><div className="page-heading"><h1>Ulubione {products.length>0&&<span>({products.length})</span>}</h1><p>Produkty zapisane na później. Lista zostaje w tej przeglądarce.</p></div><Link className="inline-link" href="/sklep">Wróć do sklepu <ArrowRight size={17}/></Link></div>{!store.hydrated?<div className="empty-state"><p>Wczytujemy Twój wybór…</p></div>:products.length?<div className="product-grid">{products.map(p=><ProductCard key={p.id} product={p}/>)}</div>:<div className="empty-state"><Heart size={39} strokeWidth={1.2}/><h2>Jeszcze nic tu nie ma</h2><p>Kliknij serduszko przy produkcie, aby zapisać go i łatwo wrócić do niego później.</p><Link className="button button-dark" href="/sklep">Zobacz produkty <ArrowRight size={17}/></Link></div>}</div>;
}
