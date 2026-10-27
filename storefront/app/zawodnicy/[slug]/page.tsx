import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlayerClient from "./PlayerClient";
import { getPlayers } from "../../../lib/catalog-paths";
import { JsonLdScript, breadcrumbJsonLd } from "../../../lib/json-ld";
import { absolute, siteOrigin } from "../../../lib/site";

const ROSTER_SOURCE = "https://basketzg.pl/players";

async function resolve(slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return null;
  const roster = await getPlayers();
  return roster.find(player => player.slug === slug) || null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const player = await resolve(slug);
  if (!player) return { title: "Zawodnik", robots: { index: false, follow: true } };
  const title = `${player.name} ${player.number}`;
  const description = `${player.name}${player.position ? ", " + player.position : ""}, numer ${player.number}. Koszulka Zastalu z nazwiskiem ${player.print_name} ${player.number} w oficjalnym sklepie klubu.`;
  const canonical = absolute("/zawodnicy/" + player.slug);
  return { title, description, alternates: { canonical }, openGraph: { title, description, type: "profile", url: canonical, images: player.photo ? [{ url: absolute(player.photo), alt: player.name }] : [] } };
}

/** One page per squad member: the club's own photo (uploaded in the panel), the number, and every printable product with the player preselected. */
export default async function PlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const player = await resolve(slug);
  if (!player) notFound();
  const person = { "@context": "https://schema.org", "@type": "Person", name: player.name, url: absolute("/zawodnicy/" + player.slug), ...(player.photo ? { image: absolute(player.photo) } : {}), ...(player.position ? { jobTitle: player.position } : {}),
    memberOf: { "@type": "SportsTeam", name: "Zastal Zielona Góra", sport: "Basketball", url: ROSTER_SOURCE }, identifier: player.number };
  return <>
    <JsonLdScript data={[breadcrumbJsonLd([{ name: "Strona główna", path: "/" }, { name: "Zawodnicy", path: "/zawodnicy" }, { name: player.name }]), person]}/>
    <PlayerClient player={player} origin={siteOrigin()} source={ROSTER_SOURCE}/>
  </>;
}
