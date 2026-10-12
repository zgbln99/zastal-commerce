import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, ChevronRight } from "lucide-react";
import "./help.css";

export const metadata: Metadata = {
  title: "Informacje o sklepie",
  description: "Informacje o przygotowaniu sprzedaży Zastal Store, doborze rozmiaru, nadrukach, dostawach oraz ochronie danych.",
};

export default function Help() {
  return <div className="container help-page">
    <div className="breadcrumbs"><Link href="/">Strona główna</Link><ChevronRight size={11}/><span>Informacje o sklepie</span></div>
    <div className="page-heading"><span className="eyebrow">ZASTAL ZIELONA GÓRA / STORE</span><h1>Informacje o sklepie</h1><p>Wszystko, co warto wiedzieć przed startem zakupów online.</p></div>
    <div className="help-layout">
      <nav className="help-nav" aria-label="Tematy pomocy">
        <a href="#zamowienia">Zakupy i zamówienia</a>
        <a href="#dostawa">Dostawa i odbiór</a>
        <a href="#rozmiary">Rozmiary i nadruki</a>
        <a href="#wersja-demo">Etap uruchomienia</a>
        <a href="#prywatnosc">Konto i prywatność</a>
        <a href="#kontakt">Kontakt</a>
      </nav>
      <div className="help-content">
        <section id="zamowienia">
          <span className="eyebrow">01 / ZAKUPY</span><h2>Zakupy w Zastal Store</h2>
          <p>Nowy sklep przygotowujemy do uruchomienia sprzedaży internetowej. Na razie możesz zapoznać się z ofertą, przeglądać warianty, zapisywać produkty na liście ulubionych i układać koszyk.</p>
          <div className="help-note"><strong>Nowe zamówienia są obecnie wstrzymane.</strong><p>Nie pobieramy płatności, nie przyjmujemy nowych zamówień i nie tworzymy rzeczywistych przesyłek. Włączenie sprzedaży nastąpi dopiero po zakończeniu integracji i formalności.</p></div>
          <details><summary>Czy mogę już zapłacić BLIK-iem lub kartą?</summary><p>Jeszcze nie. Operator płatności nie jest podłączony do tej instalacji. Nie wpisuj w sklepie numerów kart ani kodów BLIK.</p></details>
          <details><summary>Co z wcześniejszymi zamówieniami w systemie?</summary><p>Wcześniej zapisane zamówienia techniczne pozostają w historii w celu przetestowania obsługi sklepu. Nie są potwierdzeniem opłaconego zakupu.</p></details>
          <details><summary>Czy koszyk będzie zachowany?</summary><p>Tak. Koszyk jest przechowywany lokalnie w tej przeglądarce. Jego stan może zniknąć po wyczyszczeniu danych przeglądarki lub przejściu na inne urządzenie.</p></details>
        </section>
        <section id="dostawa">
          <span className="eyebrow">02 / DOSTAWA</span><h2>Dostawa i odbiór</h2>
          <p>Warianty wysyłki, ich koszty i terminy realizacji zostaną opublikowane po podpisaniu odpowiednich umów i przetestowaniu integracji z przewoźnikami.</p>
          <p>Nie pokazujemy niezweryfikowanych stawek dostawy ani fikcyjnych progów darmowej wysyłki. Sklep nie przyjmuje obecnie adresów do rzeczywistych zamówień.</p>
        </section>
        <section id="rozmiary">
          <span className="eyebrow">03 / PRODUKTY</span><h2>Rozmiary i personalizacja</h2>
          <p>Odzież ma osobne warianty rozmiarów, a ich dostępność pochodzi z ewidencji magazynowej sklepu. Dane o rozmiarach, składzie materiału i pielęgnacji będą uzupełniane na podstawie informacji producentów.</p>
          <p>Na wybranych produktach możesz skonfigurować nadruk z własnym nazwiskiem i numerem albo wybrać zawodnika z dostępnej listy. Opcje personalizacji widać na karcie konkretnego produktu.</p>
          <p>Nadruki DTF są kupowane od zewnętrznego dostawcy w postaci gotowych transferów, które następnie aplikuje się na odzież. Przed sprzedażą wymagają potwierdzenia wzory, koszty i terminy realizacji.</p>
          <Link className="inline-link" href="/sklep">Przejrzyj produkty <ArrowRight size={15}/></Link>
        </section>
        <section id="wersja-demo">
          <span className="eyebrow">04 / URUCHOMIENIE</span><h2>Co przygotowujemy?</h2>
          <p>Sklep ma już katalog, wyszukiwarkę, koszyk, personalizację wybranych produktów oraz zaplecze do obsługi magazynu, etykiet i nanoszenia nadruków. W panelu obsługi jest też lista zadań potrzebnych przed uruchomieniem sprzedaży.</p>
          <p>Sprzedaż online czeka na konfigurację płatności i dostaw oraz uzupełnienie danych sprzedawcy. Konto możesz już założyć i korzystać z jego ustawień. Wiadomości e-mail będą wysyłane po podłączeniu skrzynki sklepu.</p>
          <div className="help-note"><strong>Do czasu uruchomienia możesz skorzystać z dotychczasowego sklepu klubu.</strong><p>To odrębna instalacja przygotowywana do wdrożenia. Nie należy traktować jej jako działającej platformy do dokonywania zakupów.</p></div>
          <a href="https://zastal.store/" target="_blank" rel="noreferrer" className="inline-link">Dotychczasowy sklep klubowy <ArrowUpRight size={15}/></a>
        </section>
        <section id="prywatnosc">
          <span className="eyebrow">05 / DANE</span><h2>Konto i prywatność</h2>
          <p>Koszyk, ulubione oraz lista ostatnio oglądanych produktów są zapisywane lokalnie na urządzeniu. Lista ostatnio oglądanych nie jest synchronizowana z kontem klienta; usunięcie danych tej przeglądarki czyści także tę listę.</p>
          <p>Rejestracja nowych kont jest tymczasowo wyłączona. Wcześniej utworzone konta pozostają dostępne do logowania; dane logowania i historia konta są obsługiwane przez zabezpieczone API.</p>
          <p>Przed włączeniem sprzedaży zostaną udostępnione odpowiednie dokumenty dotyczące przetwarzania danych klientów, zasad sprzedaży oraz prawa odstąpienia od umowy.</p>
        </section>
        <section id="kontakt">
          <span className="eyebrow">06 / ZASTAL</span><h2>Kontakt</h2>
          <p>Aktualne informacje o klubie oraz oficjalne kanały kontaktu znajdziesz na jego stronie internetowej.</p>
          <a className="button button-dark" href="https://basketzg.pl/" target="_blank" rel="noreferrer">Przejdź na stronę Zastalu <ArrowUpRight size={17}/></a>
        </section>
      </div>
    </div>
    <div className="help-bottom"><Link className="inline-link" href="/sklep">Wróć do produktów <ArrowRight size={17}/></Link></div>
  </div>;
}
