"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Heart, Menu, Search, ShoppingBag, UserRound } from "lucide-react";

type Props = {
  pathname: string;
  count: number;
  favorites: number;
  signedIn: boolean;
  checkoutEnabled: boolean;
  openCart: () => void;
  openSearch: () => void;
  openMenu: () => void;
};

/**
 * Adapted from the compact, centered navigation pattern in
 * Your Next Store (MIT, copyright 2024 Your Next Store, Inc.).
 * All links and interactions remain on the existing Zastal Store backend.
 */
export default function YnsHeader({
  pathname, count, favorites, signedIn, checkoutEnabled, openCart, openSearch, openMenu
}: Props) {
  const searchParams = useSearchParams();
  const currentCategory = searchParams?.get("category") ?? null;
  const currentQuery = searchParams?.get("q") ?? null;
  const links = [
    { href: "/sklep", label: "Wszystkie produkty" },
    { href: "/sklep?category=Koszulki", label: "Koszulki" },
    { href: "/sklep?category=Bluzy", label: "Bluzy" },
    { href: "/sklep?category=Akcesoria", label: "Akcesoria" },
    { href: "/sklep?category=Dzieci", label: "Dla dzieci" },
    { href: "/sklep?q=retro", label: "Retro" },
    { href: "/zawodnicy", label: "Zawodnicy" }
  ];
  const isCurrent = (href: string) => {
    const [path, query] = href.split("?");
    if (pathname !== path) return false;
    if (!query) return !currentCategory && !currentQuery;
    const params = new URLSearchParams(query);
    return params.get("category") === currentCategory && params.get("q") === currentQuery;
  };
  return <>
    <div className="yns-announcement">
      <Link href="/pomoc">{checkoutEnabled ? "Dostawa i odbiór osobisty" : "Zamówienia online chwilowo niedostępne"}</Link>
    </div>
    <header className="yns-header">
      <div className="yns-header-inner">
        <button type="button" className="yns-icon yns-mobile-nav" onClick={openMenu} aria-label="Otwórz menu"><Menu size={22}/></button>
        <Link href="/" className="yns-brand" aria-label="Zastal Store — strona główna">
          <img src="/assets/zastal-logo.svg" alt="Zastal Zielona Góra"/>
          <span className="yns-brand-divider" aria-hidden="true"/>
          <strong>STORE</strong>
        </Link>
        <nav className="yns-navlinks" aria-label="Nawigacja główna">
          {links.map(link => <Link key={link.href} href={link.href} className={isCurrent(link.href) ? "yns-nav-current" : ""} aria-current={isCurrent(link.href) ? "page" : undefined}>{link.label}</Link>)}
        </nav>
        <div className="yns-header-actions">
          <button type="button" className="yns-icon" onClick={openSearch} title="Szukaj (Ctrl+K)" aria-label="Szukaj produktów"><Search size={21}/></button>
          <Link href="/konto" className="yns-icon yns-account" aria-label={signedIn ? "Moje konto" : "Zaloguj się"}><UserRound size={21}/></Link>
          <Link href="/ulubione" className="yns-icon yns-favorites" aria-label={`Ulubione: ${favorites}`}><Heart size={21}/>{favorites > 0 && <span className="yns-action-count">{favorites}</span>}</Link>
          <button type="button" className="yns-cart-button" onClick={openCart} aria-label={`Otwórz koszyk (${count})`}>
            <ShoppingBag size={21}/><span className="yns-cart-label">Koszyk</span><span className="yns-cart-count">{count}</span>
          </button>
        </div>
      </div>
    </header>
  </>;
}
