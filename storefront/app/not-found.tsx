import Link from "next/link";
import { ArrowRight } from "lucide-react";
export default function NotFound(){return <div className="container not-found-page"><div className="empty-state"><span className="eyebrow">404</span><h1>Nie ma takiej strony</h1><p>Produkt lub strona nie są dostępne. Wróć do katalogu i sprawdź aktualną kolekcję.</p><Link className="button button-dark" href="/sklep">Przejdź do sklepu <ArrowRight size={17}/></Link></div></div>}
