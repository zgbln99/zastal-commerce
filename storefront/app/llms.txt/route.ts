import { getAllProducts, categoryPaths } from "../../lib/catalog-paths";
import { storeStatus } from "../../lib/store-status";
import { siteOrigin, STORE_DESCRIPTION, CATEGORY_SLUGS, categoryLabel } from "../../lib/site";
import { formatMoney } from "../../lib/money";

export const dynamic = "force-dynamic";

/** Plain-text guide for AI assistants: what the store sells, where the pages are, how to contact the club shop. */
export async function GET() {
  const origin = siteOrigin();
  const [products, status] = await Promise.all([getAllProducts(), storeStatus()]);
  const lines = [
    "# Zastal Store",
    "",
    `> ${STORE_DESCRIPTION}`,
    "",
    status.live ? "Sprzedaż online jest otwarta: dostawa na terenie Polski (kurier, automat paczkowy) lub odbiór osobisty w sklepie klubowym. Płatność online (PayU), przelew albo przy odbiorze." : "Sprzedaż online zostanie uruchomiona wkrótce; katalog jest już dostępny.",
    "",
    "## Strony",
    `- Sklep: ${origin}/sklep`,
    ...Object.keys(CATEGORY_SLUGS).map(slug => `- ${categoryLabel(CATEGORY_SLUGS[slug])}: ${origin}/kategoria/${slug}`),
    `- Zawodnicy (koszulki z nazwiskiem): ${origin}/zawodnicy`,
    `- Karta podarunkowa: ${origin}/karta-podarunkowa`,
    `- Pomoc, dostawa, rozmiary, zwroty: ${origin}/pomoc`,
    `- Kontakt: ${origin}/kontakt`,
    "",
    "## Produkty",
    ...products.map(p => `- [${p.name}](${origin}${p.path}): ${p.category}${p.subtitle ? ", " + p.subtitle : ""}${status.live && p.price ? ", " + formatMoney({ amount: p.price }) : ""}`),
    "",
    "## Zasady",
    "- Ceny w złotych brutto, zawierają VAT.",
    "- Produkty z nadrukiem nazwiska i numeru są wykonywane na zamówienie.",
    "- Zwroty i reklamacje: zasady na stronie pomocy.",
    "",
    ...categoryPaths().map(() => "").slice(0, 0),
  ];
  return new Response(lines.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
