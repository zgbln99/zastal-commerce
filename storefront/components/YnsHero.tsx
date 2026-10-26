"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { useStore } from "./StoreProvider";
import { DEFAULT_HOME, titleLines, type SectionSettings } from "../lib/home-layout";
import { buildHeroSlides } from "../lib/carousel.mjs";

/**
 * Your Next Store's restrained headline + CTA hero adapted to Zastal's
 * published CMS slides and approved product media (MIT source credited
 * in docs/licenses/YOUR_NEXT_STORE-MIT.txt).
 *
 * One editorial hero is deliberately displayed; the rest of the CMS and
 * gallery data remain intact, without a forced autoplay carousel.
 */
export default function YnsHero({ settings }: { settings?: SectionSettings }) {
  const { products } = useStore();
  const config = settings ?? DEFAULT_HOME.sections[0].settings;
  const slides = useMemo(() => buildHeroSlides(config, products), [config, products]);
  const first = slides[0];
  if (!first) return null;

  return <section className="yns-hero" aria-label="Kolekcja Zastal Store">
    <div className="yns-hero-copy">
      <h1>{titleLines(first.title).map((line, index) => <span key={index}>{line}</span>)}</h1>
      <p className="yns-hero-description">{first.description}</p>
      {first.cta_text && <Link className="yns-button-primary" href={first.cta_url || "/sklep"}>{first.cta_text}<ArrowRight size={18}/></Link>}
    </div>
    <div className={`yns-hero-media yns-media-${first.image_role || "packshot"}`}>
      <img src={first.image} alt={first.image_alt || "Kolekcja Zastal Store"} fetchPriority="high" decoding="async"/>
    </div>
  </section>;
}
