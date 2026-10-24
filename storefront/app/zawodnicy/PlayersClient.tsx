"use client";
import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { useStore } from "../../components/StoreProvider";
/** Shop by player: every roster entry links to a personalised product with the player preselected. */
export default function PlayersClient() {
  const store = useStore();
  useEffect(() => { if (store.playersStatus !== "ready") void store.refreshPlayers(); }, [store]);
  const printable = store.products.filter(p => p.personalization_enabled && p.verified && p.released !== false);
  const primary = printable[0];
  return <div className="container players-page">
    <div className="breadcrumbs"><Link href="/">Strona główna</Link><ChevronRight size={11}/><span>Zawodnicy</span></div>
    <div className="page-heading"><h1>Kadra na koszulce</h1><p>Wybierz zawodnika, a jego nazwisko i numer trafią na koszulkę lub bluzę z nadrukiem.</p></div>
    {store.playersStatus === "error" && <p className="field-error">Nie udało się pobrać listy zawodników. <button className="inline-link" onClick={() => void store.refreshPlayers()}>Spróbuj ponownie</button></p>}
    {store.playersStatus === "loading" && <p className="quiet-note">Wczytujemy kadrę…</p>}
    <div className="players-grid">{store.players.map(player => <article className="player-card" key={player.id}>
      <span className="player-number" aria-hidden="true">{player.number}</span>
      <h2>{player.name}</h2><small>Nadruk: {player.print_name} {player.number}</small>
      {primary ? <Link className="inline-link" href={`/produkt/${primary.id}?zawodnik=${player.id}`}>{printable.length > 1 ? "Koszulka z nazwiskiem" : primary.name} <ArrowRight size={15}/></Link> : <span className="quiet-note">Produkty z nadrukiem wkrótce.</span>}
      {printable.length > 1 && <div className="player-more">{printable.slice(1, 3).map(p => <Link key={p.id} href={`/produkt/${p.id}?zawodnik=${player.id}`}>{p.name}</Link>)}</div>}
    </article>)}</div>
    {store.playersStatus === "ready" && !store.players.length && <p className="account-empty">Lista zawodników jest w przygotowaniu.</p>}
  </div>;
}
