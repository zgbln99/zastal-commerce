"use client";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { useStore } from "../../components/StoreProvider";
import ProductCard from "../../components/ProductCard";
import GiftCardBalance from "../../components/GiftCardBalance";
export default function GiftCardClient() {
  const store = useStore();
  const cards = store.products.filter(p => p.gift_card && p.verified);
  return <div className="container gift-page">
    <div className="breadcrumbs"><Link href="/">Strona główna</Link><ChevronRight size={11}/><span>Karta podarunkowa</span></div>
    <div className="page-heading"><h1>Karta podarunkowa</h1><p>Prezent dla kibica, który sam wybierze rozmiar. Kupujesz online, kod przychodzi e-mailem, a karta działa w sklepie internetowym i przy kasie w klubie.</p></div>
    <div className="gift-layout">
      <section className="gift-how"><h2>Jak to działa</h2><ol><li><strong>Wybierz wartość</strong> i dodaj kartę do koszyka. Możesz podać e-mail obdarowanego i krótką wiadomość.</li><li><strong>Zapłać online.</strong> Kod karty wysyłamy od razu po zaksięgowaniu płatności, bez wysyłki kurierem.</li><li><strong>Obdarowany płaci kodem</strong> w podsumowaniu zamówienia albo pokazuje go przy kasie. Saldo można wykorzystać w kilku zakupach.</li></ol><p className="quiet-note">Karta jest ważna 12 miesięcy od wydania i nie podlega wymianie na gotówkę. Niewykorzystane saldo zostaje na karcie.</p></section>
      <GiftCardBalance/>
    </div>
    {cards.length > 0 ? <section className="gift-products"><h2>Wybierz wartość karty</h2><div className="product-grid">{cards.map(p => <ProductCard key={p.id} product={p} eager/>)}</div></section> : store.sales.checkoutEnabled ? <p className="account-empty">Karty podarunkowe pojawią się w sprzedaży wkrótce. Kartę można też kupić przy kasie w sklepie klubowym.</p> : <p className="account-empty">Sprzedaż kart podarunkowych online ruszy razem ze sklepem. Kartę można kupić przy kasie w sklepie klubowym.</p>}
    <div className="help-bottom"><Link className="inline-link" href="/sklep">Przejdź do sklepu <ArrowRight size={17}/></Link></div>
  </div>;
}
