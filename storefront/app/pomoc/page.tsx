import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { storeStatus } from "../../lib/store-status";
import OrderLookup from "../../components/OrderLookup";
import "./help.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Informacje o sklepie",
  description: "Zakupy, dostawa, rozmiary, personalizacja, zwroty i ochrona danych w oficjalnym sklepie Zastalu Zielona Góra.",
};

type Config = { shipping_methods?: { code: string; name: string; kind: string; price: number; free_from: number | null; note?: string }[]; payment_methods?: { id: string; name: string }[]; pickup_address?: string; pickup_hours?: string; legal?: { terms_url?: string; privacy_url?: string; returns_url?: string; shipping_url?: string }; seller?: { name?: string; support_email?: string; support_phone?: string }; pages?: { slug: string; title: string; published_title?: string }[] };
const pln = (value: number) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value / 100);

async function config(): Promise<Config> {
  try {
    const response = await fetch((process.env.ZASTAL_CMS_API || "http://127.0.0.1:8880") + "/api/store/status", { cache: "no-store", signal: AbortSignal.timeout(2500) });
    return response.ok ? ((await response.json())?.config || {}) : {};
  } catch { return {}; }
}

/** Help centre: the live version describes real delivery and payment options from the published configuration. */
export default async function Help() {
  const live = (await storeStatus()).live;
  const cfg = live ? await config() : {};
  const pages = (cfg.pages || []).map(page => ({ slug: page.slug, title: page.published_title || page.title }));
  return <div className="container help-page">
    <div className="breadcrumbs"><Link href="/">Strona główna</Link><ChevronRight size={11}/><span>Informacje o sklepie</span></div>
    <div className="page-heading"><span className="eyebrow">ZASTAL ZIELONA GÓRA / STORE</span><h1>Informacje o sklepie</h1><p>{live ? "Sprawdź rozmiary, dostawę i zasady zamówień." : "Rozmiary, personalizacja, dostawa i Twoje zamówienia."}</p></div>
    <div className="help-layout">
      <nav className="help-nav" aria-label="Tematy pomocy">
        <a href="#zamowienia">Zakupy i zamówienia</a>
        <a href="#dostawa">Dostawa i odbiór</a>
        <a href="#rozmiary">Rozmiary i nadruki</a>
        {live ? <a href="#zwroty">Zwroty i reklamacje</a> : <a href="#preorder">Przedsprzedaż</a>}
        <a href="#prywatnosc">Konto i prywatność</a>
        <a href="#kontakt">Kontakt</a>
      </nav>
      <div className="help-content">
        <section id="zamowienia">
          <span className="eyebrow">01 / ZAKUPY</span><h2>Zakupy w Zastal Store</h2>
          {live ? <>
            <p>Dodaj produkty do koszyka, podaj dane dostawy i wybierz płatność. Potwierdzenie zamówienia i kolejne statusy wysyłamy e-mailem; status sprawdzisz też na stronie zamówienia i w koncie klienta.</p>
            <p>Ceny są cenami brutto w złotych i zawierają VAT. Dostępne płatności: {(cfg.payment_methods || []).map(method => method.name).join(", ") || "podane przy składaniu zamówienia"}.</p>
            <details><summary>Co po złożeniu zamówienia?</summary><p>Zamówienie opłacone online lub potwierdzone trafia do kompletacji. Produkty z personalizacją wykonujemy po potwierdzeniu płatności, dlatego ich realizacja trwa dłużej. O wysyłce lub gotowości do odbioru poinformujemy e-mailem.</p></details>
            <details><summary>Zamówienie czeka na płatność — co zrobić?</summary><p>Status zamówienia zmieni się po potwierdzeniu wpłaty. Jeśli płatność online nie powiodła się, wróć do strony zamówienia i użyj przycisku „Zapłać ponownie”. Nieopłacone zamówienia są anulowane po upływie terminu podanego w potwierdzeniu.</p></details>
            <details><summary>Czy mogę dostać fakturę?</summary><p>Tak. Zaznacz „Chcę otrzymać fakturę na firmę” w podsumowaniu zamówienia i podaj dane oraz NIP.</p></details><OrderLookup/>
          </> : <>
            <p>Wybierz produkt i rozmiar. Jeśli dostępna jest personalizacja, dodaj ją przed przejściem do koszyka.</p>
            <div className="help-note"><strong>Zamówienia online są chwilowo niedostępne.</strong><p>Wybrane produkty możesz zachować w koszyku. Nie pobieramy teraz płatności.</p></div>
            <details><summary>Czy mogę już zapłacić BLIK-iem lub kartą?</summary><p>Płatności online są obecnie niedostępne.</p></details>
            <details><summary>Czy koszyk będzie zachowany?</summary><p>Tak. Koszyk jest przechowywany lokalnie w tej przeglądarce.</p></details>
          </>}
        </section>
        <section id="dostawa">
          <span className="eyebrow">02 / DOSTAWA</span><h2>Dostawa i odbiór</h2>
          {live ? <>
            <ul className="help-list">{(cfg.shipping_methods || []).map(method => <li key={method.code}><strong>{method.name}</strong> — {method.price ? pln(method.price) : "bezpłatnie"}{method.free_from != null && method.price ? `, bezpłatnie od ${pln(method.free_from)}` : ""}{method.note ? ` · ${method.note}` : ""}</li>)}</ul>
            {cfg.pickup_address && <p>Odbiór osobisty: {cfg.pickup_address}{cfg.pickup_hours ? ` · ${cfg.pickup_hours}` : ""}.</p>}
            <p>Wysyłamy na terenie Polski. Numer przesyłki i link do śledzenia otrzymasz e-mailem po nadaniu.</p>
            {cfg.legal?.shipping_url && <a className="inline-link" href={cfg.legal.shipping_url} target="_blank" rel="noreferrer">Pełne warunki dostaw <ArrowRight size={15}/></a>}
          </> : <>
            <p>Sposób dostawy i jej koszt sprawdzisz przed potwierdzeniem zamówienia. Informację o terminie realizacji znajdziesz przy produkcie lub w szczegółach zamówienia.</p>
            <p>Koszt dostawy zobaczysz w podsumowaniu zamówienia, zanim zdecydujesz się na zakup.</p>
          </>}
        </section>
        <section id="rozmiary">
          <span className="eyebrow">03 / PRODUKTY</span><h2>Rozmiary i personalizacja</h2>
          <p>Wybierz rozmiar na karcie produktu, aby sprawdzić dostępność. Podane wymiary porównaj z ubraniem, które dobrze na Tobie leży.</p>
          <p>Na wybranej odzieży dodasz własne nazwisko i numer lub wybierzesz zawodnika z listy. Przed zakupem sprawdź pisownię i numer. Podgląd pokazuje przybliżone położenie nadruku.</p>
          <p>Dostępne zdobienia i cenę personalizacji znajdziesz przy produkcie.</p>
          <Link className="inline-link" href="/sklep">Przejrzyj produkty <ArrowRight size={15}/></Link>
        </section>
        {live ? <section id="zwroty">
          <span className="eyebrow">04 / ZWROTY</span><h2>Zwroty i reklamacje</h2>
          <p>Zwrot lub reklamację zgłosisz na stronie zamówienia (link z e-maila) albo w koncie klienta. Konsument może odstąpić od umowy zawartej na odległość w ciągu 14 dni od otrzymania towaru; produkty personalizowane nazwiskiem i numerem są wykonywane na zamówienie i mogą nie podlegać zwrotowi, reklamacje wad przysługują niezależnie.</p>
          <p>Zwrot środków następuje tą samą metodą płatności po przyjęciu towaru.</p>
          {cfg.legal?.returns_url && <a className="inline-link" href={cfg.legal.returns_url} target="_blank" rel="noreferrer">Zasady zwrotów i reklamacji <ArrowRight size={15}/></a>}
        </section> : <section id="preorder">
          <span className="eyebrow">04 / PRZEDSPRZEDAŻ</span><h2>Zakupy w przedsprzedaży</h2>
          <p>Produkt oznaczony jako preorder zamawiasz przed jego dostępnością od ręki. Przewidywany termin wysyłki znajdziesz na karcie produktu.</p>
          <p>Sprawdź termin przed zakupem. Produkt z przedsprzedaży może być gotowy później niż pozostałe rzeczy w Twoim koszyku.</p>
        </section>}
        <section id="prywatnosc">
          <span className="eyebrow">05 / DANE</span><h2>Konto i prywatność</h2>
          <p>Na koncie sprawdzisz zamówienia i zgłosisz zwrot lub reklamację. Do logowania użyj adresu e-mail. Koszyk, ulubione i ostatnio oglądane produkty są zapisywane w tej przeglądarce.</p>
          <p>Dane zamówienia przetwarzamy w celu realizacji umowy; dane kart płatniczych obsługuje wyłącznie operator płatności, sklep ich nie przechowuje.</p>
          {cfg.legal?.privacy_url ? <a className="inline-link" href={cfg.legal.privacy_url} target="_blank" rel="noreferrer">Polityka prywatności <ArrowRight size={15}/></a> : <p>Dokumenty dotyczące zakupów i ochrony danych będą dostępne przed złożeniem zamówienia.</p>}
          {pages.length > 0 && <ul className="help-list">{pages.map(page => <li key={page.slug}><Link href={"/informacje/" + page.slug}>{page.title}</Link></li>)}</ul>}
        </section>
        <section id="kontakt">
          <span className="eyebrow">06 / ZASTAL</span><h2>Kontakt</h2>
          {live && cfg.seller?.name ? <p>{cfg.seller.name}{cfg.seller.support_email ? ` · ${cfg.seller.support_email}` : ""}{cfg.seller.support_phone ? ` · tel. ${cfg.seller.support_phone}` : ""}</p> : <p>Aktualne informacje o klubie oraz oficjalne kanały kontaktu znajdziesz na jego stronie internetowej.</p>}
          <a className="button button-dark" href="https://basketzg.pl/" target="_blank" rel="noreferrer">Przejdź na stronę Zastalu <ArrowUpRight size={17}/></a>
        </section>
      </div>
    </div>
    <div className="help-bottom"><Link className="inline-link" href="/sklep">Wróć do produktów <ArrowRight size={17}/></Link></div>
  </div>;
}
