/** Product description skeletons inserted from the admin form. Fields in square brackets must be filled before saving. */
const CARE = "## Pielęgnacja\n- Pranie w 30°C na lewej stronie, bez wybielaczy\n- Nie prasować bezpośrednio nadruku\n- Suszyć na płasko, nie w suszarce";
export const DESCRIPTION_TEMPLATES: Record<string, string> = {
  Koszulki: "[Jedno zdanie: dla kogo jest ta koszulka i na jaką okazję, np. na mecz, trening albo na co dzień.]\n\n## Materiał i krój\n- Materiał: [np. bawełna 100%, 180 g/m²]\n- Krój: [np. klasyczny, prosty; wybierz swój zwykły rozmiar]\n- Kolor: [np. zieleń klubowa]\n\n## Nadruk\n- [Co jest z przodu i z tyłu, np. herb Zastalu na piersi, napis na plecach]\n- Technika: [nadruk DTF / haft / sitodruk]\n\n" + CARE,
  Bluzy: "[Jedno zdanie: dla kogo jest ta bluza i kiedy się sprawdza, np. chłodne wieczory w hali.]\n\n## Materiał i krój\n- Materiał: [np. bawełna 80%, poliester 20%, 300 g/m², drapane wnętrze]\n- Krój: [np. regular z kapturem i kieszenią kangurką]\n- Kolor: [np. zieleń klubowa]\n\n## Nadruk\n- [Co jest z przodu i z tyłu]\n- Technika: [nadruk DTF / haft]\n\n" + CARE,
  Dzieci: "[Jedno zdanie: dla kogo, np. dla najmłodszych kibiców od 6 do 14 lat.]\n\n## Materiał i krój\n- Materiał: [np. bawełna 100%, miękka i oddychająca]\n- Rozmiary: [np. 116 do 164, według wzrostu dziecka]\n- Kolor: [np. zieleń klubowa]\n\n## Nadruk\n- [Co jest z przodu i z tyłu]\n- Technika: [nadruk DTF / haft]\n\n" + CARE,
  Akcesoria: "[Jedno zdanie: co to jest i do czego służy, np. worek na buty i strój na trening.]\n\n## Szczegóły\n- Materiał: [np. poliester 210D]\n- Wymiary: [np. 35 × 45 cm]\n- [Inna cecha, np. zamykany na sznurek, nadruk herbu z jednej strony]\n\n## Pielęgnacja\n- [np. Pranie ręczne w 30°C, nie suszyć w suszarce]",
};
export function descriptionTemplate(category: string): string { return DESCRIPTION_TEMPLATES[category] || DESCRIPTION_TEMPLATES.Akcesoria; }
/** Unfilled fields such as "[np. bawełna 100%]"; links "[tekst](https://…)" are not counted. */
export function unfilledFields(content: string): number { return (content.match(/\[[^\]\n]{1,80}\](?!\()/g) || []).length; }
