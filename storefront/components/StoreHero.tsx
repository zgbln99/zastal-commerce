import Link from "next/link";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { fanPhoto } from "../lib/catalog";

/**
 * The opening image is a genuine club supporter photograph.
 * Single campaign story by design: no carousel, fabricated mock-ups or
 * duplicate product tiles competing with the message.
 */
export default function StoreHero() {
  return <section className="flagship-hero" aria-labelledby="flagship-hero-heading">
    <img className="flagship-hero-photo" src={fanPhoto} alt="Kibice Zastalu Zielona Góra na trybunach podczas meczu" fetchPriority="high" decoding="async"/>
    <span className="flagship-hero-shade" aria-hidden="true"/>
    <div className="flagship-hero-topline">
      <span>ZASTAL ZIELONA GÓRA</span>
      <span>SKLEP KIBICA / 1946</span>
    </div>
    <div className="flagship-hero-content">
      <p className="flagship-overline"><span/> KLUBOWA KOLEKCJA</p>
      <h1 id="flagship-hero-heading">W barwach<br/><em>Zastalu.</em></h1>
      <p className="flagship-hero-lead">Koszulki, bluzy i dodatki dla kibiców z Zielonej Góry.</p>
      <div className="flagship-hero-actions">
        <Link href="/sklep" className="flagship-button-primary">Przejdź do sklepu <ArrowUpRight size={18}/></Link>
        <Link href="/sklep?category=Koszulki" className="flagship-button-quiet">Zobacz koszulki <ArrowRight size={17}/></Link>
      </div>
    </div>
    <div className="flagship-hero-footer">
      <div><span className="flagship-pulse" aria-hidden="true"/> ZIELONA GÓRA / POLSKA</div>
      <span>NA TRYBUNACH I POZA HALĄ</span>
    </div>
  </section>;
}
