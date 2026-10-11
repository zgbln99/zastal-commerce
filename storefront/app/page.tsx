"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, PackageCheck, Ruler, UserRound } from "lucide-react";
import ProductCard, { ProductImage } from "../components/ProductCard";
import CollectionCarousel from "../components/CollectionCarousel";
import { PersonalizationEditorial, AccessoriesEditorial } from "../components/ClubEditorial";
import { useStore } from "../components/StoreProvider";
import { catalog } from "../lib/catalog";

const categories = ["Wszystko", "Koszulki", "Bluzy", "Akcesoria", "Dzieci"];
const collections = [
  { category: "Koszulki", label: "Koszulki", detail: "Modele klubowe", id: 10, className: "shirts" },
  { category: "Bluzy", label: "Bluzy", detail: "Klasyczne i z kapturem", id: 1, className: "hoodies" },
  { category: "Dzieci", label: "Dla dzieci", detail: "Małe rozmiary, duże emocje", id: 9, className: "kids" },
  { category: "Akcesoria", label: "Akcesoria", detail: "Dodatki na co dzień", id: 8, className: "accessories" },
];
export default function Home() {
  const { products } = useStore();
  const [category, setCategory] = useState("Wszystko");
  const visible = category === "Wszystko" ? products : products.filter(product => product.category === category);
  const retro = products.find(product => product.id === 2) || catalog[1];
  const printProduct = products.find(product => product.personalization_enabled && product.id === 1) || products.find(product => product.personalization_enabled);
  const accessories = products.filter(product => product.category === "Akcesoria");
  return <div className="home-page"><CollectionCarousel/>
    <section className="container home-collections" aria-labelledby="collections-heading"><div className="home-section-heading"><div><span className="home-kicker">01 / KATEGORIE</span><h2 id="collections-heading">Kolekcje</h2></div><Link className="home-text-link" href="/sklep">Cały sklep <ArrowUpRight size={17}/></Link></div><div className="home-collection-grid">{collections.map(collection => {
      const product = products.find(item => item.id === collection.id) || products.find(item => item.category === collection.category) || catalog.find(item => item.id === collection.id)!;
      return <Link className={"home-collection collection-" + collection.className} key={collection.category} href={"/sklep?category=" + collection.category}><div className="home-collection-image"><ProductImage product={product}/></div><div className="home-collection-label"><div><h3>{collection.label}</h3><span>{collection.detail}</span></div><ArrowUpRight size={21}/></div></Link>;
    })}</div></section>
    <PersonalizationEditorial product={printProduct}/>
    <section className="container merchandise-catalog" aria-labelledby="products-heading"><div className="home-section-heading"><div><span className="home-kicker">03 / PRODUKTY</span><h2 id="products-heading">W klubowym sklepie</h2></div><Link className="home-text-link" href="/sklep">Filtruj i sortuj <ArrowRight size={17}/></Link></div><div className="collection-tabs" aria-label="Kategorie produktów">{categories.map(item => <button key={item} className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item === "Dzieci" ? "Dla dzieci" : item}<span>{item === "Wszystko" ? products.length : products.filter(product => product.category === item).length}</span></button>)}</div><div className="product-grid merchandise-grid">{visible.slice(0,8).map((product,index) => <ProductCard key={product.id} product={product} eager={index<4}/>)}</div>{!visible.length && <p className="account-empty">Brak produktów w tej kategorii.</p>}<div className="home-catalog-link"><Link href={category === "Wszystko" ? "/sklep" : "/sklep?category=" + encodeURIComponent(category)}>Zobacz wszystkie produkty <ArrowUpRight size={17}/></Link></div></section>
    <section className="container home-retro"><div className="home-retro-photo"><span aria-hidden="true">RETRO</span><ProductImage product={retro}/></div><div className="home-retro-copy"><span className="home-kicker">04 / ZASTAL RETRO</span><h2>Klasyczny znak.<br/>Klubowa bluza.</h2><p>Retro logo Zastalu na zielonej bluzie. Prosty wzór, który nie wychodzi z mody.</p><Link className="button button-dark" href="/sklep?q=retro">Zobacz kolekcję <ArrowUpRight size={18}/></Link></div></section>
    <AccessoriesEditorial products={accessories}/>
    <section className="container home-service-links"><Link href="/pomoc#dostawa"><PackageCheck size={25} strokeWidth={1.4}/><div><strong>Dostawa i odbiór</strong><span>Sprawdź dostępne sposoby dostawy</span></div><ArrowUpRight size={17}/></Link><Link href="/konto"><UserRound size={25} strokeWidth={1.4}/><div><strong>Twoje konto</strong><span>Zamówienia i ustawienia w jednym miejscu</span></div><ArrowUpRight size={17}/></Link><Link href="/pomoc#rozmiary"><Ruler size={25} strokeWidth={1.4}/><div><strong>Dobierz rozmiar</strong><span>Informacje przed zakupem</span></div><ArrowUpRight size={17}/></Link></section>
  </div>;
}
