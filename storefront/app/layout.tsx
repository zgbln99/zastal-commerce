import type { Metadata } from "next";
import "./globals.css";
import "./storefront-refresh.css";
import "./editorial.css";
import "./club-editorial.css";
import "./flagship-hero.css";
import "./cms-sections.css";
import "./product-media.css";
import CommerceRoot from "../components/CommerceRoot";
import { storeStatus } from "../lib/store-status";
export const dynamic = "force-dynamic";
/** Robots stay closed until sales are live; the description changes with the store phase. */
export async function generateMetadata(): Promise<Metadata> {
  const live = (await storeStatus()).live;
  return {
    title: {default: "Zastal Store — oficjalny sklep kibica", template: "%s | Zastal Store"},
    description: live ? "Oficjalny sklep Zastalu Zielona Góra: koszulki, bluzy, akcesoria i personalizowane nadruki z nazwiskiem i numerem. Dostawa na terenie Polski i odbiór osobisty." : "Odzież i akcesoria Zastalu Zielona Góra. Odkryj kolekcję klubową, wybierz swój rozmiar i sprawdź możliwości personalizacji.",
    robots: live ? {index:true,follow:true} : {index:false,follow:false},
    metadataBase: new URL(process.env.ZASTAL_SITE_ORIGIN || "https://zastalstore.51-15-21-164.sslip.io"),
  };
}
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pl"><body><CommerceRoot>{children}</CommerceRoot></body></html>;
}
