/** Public origin and store identity used by metadata, structured data, sitemaps and feeds. */
export const SITE_NAME = "Zastal Store";
export const STORE_DESCRIPTION = "Oficjalny sklep Zastalu Zielona Góra: koszulki, bluzy, akcesoria i odzież dziecięca z klubowej kolekcji.";
export const siteOrigin = () => (process.env.ZASTAL_SITE_ORIGIN || "https://zastalstore.51-15-21-164.sslip.io").replace(/\/$/, "");
export const absolute = (path: string) => { try { return new URL(path, siteOrigin() + "/").toString(); } catch { return path; } };
export const CATEGORY_SLUGS: Record<string, string> = { koszulki: "Koszulki", bluzy: "Bluzy", akcesoria: "Akcesoria", dzieci: "Dzieci" };
export const categorySlug = (category: string) => Object.entries(CATEGORY_SLUGS).find(([, name]) => name === category)?.[0] || "";
export const categoryLabel = (category: string) => category === "Dzieci" ? "Dla dzieci" : category;
export const categoryPath = (category: string) => { const slug = categorySlug(category); return slug ? "/kategoria/" + slug : "/sklep"; };
