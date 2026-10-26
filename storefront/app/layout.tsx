import type { Metadata } from "next";
import "./globals.css";
import "./storefront-refresh.css";
import "./editorial.css";
import "./club-editorial.css";
import "./flagship-hero.css";
import "./cms-sections.css";
import "./product-media.css";
import "./yns-theme.css";
import "./typography.css";
import "./brand-system.css";
import "./rebuild-v2.css";
import "./storefront-v3.css";
import "./storefront-v4.css";
import "./minimal-store.css";
import CommerceRoot from "../components/CommerceRoot";
import { publicCatalog, storeStatus } from "../lib/store-status";
export const dynamic = "force-dynamic";
/** Robots stay closed until sales are live; the description changes with the store phase. */
export async function generateMetadata(): Promise<Metadata> {
  const live = (await storeStatus()).live;
  return {
    title: {default: "Zastal Store, oficjalny sklep kibica", template: "%s | Zastal Store"},
    description: live ? "Oficjalny sklep Zastalu Zielona Góra: koszulki, bluzy, akcesoria i personalizowane nadruki z nazwiskiem i numerem. Dostawa na terenie Polski i odbiór osobisty." : "Odzież i akcesoria Zastalu Zielona Góra. Odkryj kolekcję klubową, wybierz swój rozmiar i sprawdź możliwości personalizacji.",
    robots: live ? {index:true,follow:true} : {index:false,follow:false},
    metadataBase: new URL(process.env.ZASTAL_SITE_ORIGIN || "https://zastalstore.51-15-21-164.sslip.io"),
  };
}
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const initialUrls=await publicCatalog();
  return <html lang="pl"><body><CommerceRoot initialUrls={initialUrls}>{children}</CommerceRoot></body></html>;
}

import "./minimal-store.css";
