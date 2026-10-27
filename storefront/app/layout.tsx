import type { Metadata } from "next";
import "./tailwind.css";
import CommerceRoot from "../components/CommerceRoot";
import { storeStatus } from "../lib/store-status";
import { JsonLdScript, storeJsonLd } from "../lib/json-ld";
export const dynamic = "force-dynamic";
/** Robots stay closed until sales are live; the description changes with the store phase. */
export async function generateMetadata(): Promise<Metadata> {
  const live = (await storeStatus()).live;
  return {
    title: {default: "Zastal Store, oficjalny sklep kibica", template: "%s | Zastal Store"},
    description: live ? "Oficjalny sklep Zastalu Zielona Góra: koszulki, bluzy, akcesoria i personalizowane nadruki z nazwiskiem i numerem. Dostawa na terenie Polski i odbiór osobisty." : "Odzież i akcesoria Zastalu Zielona Góra. Odkryj kolekcję klubową, wybierz swój rozmiar i sprawdź możliwości personalizacji.",
    robots: live ? {index:true,follow:true} : {index:false,follow:false},
    metadataBase: new URL(process.env.ZASTAL_SITE_ORIGIN || "https://zastalstore.51-15-21-164.sslip.io"),
    manifest: "/manifest.webmanifest",
    icons: { icon: [{ url: "/assets/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/assets/zastal-logo.svg", type: "image/svg+xml" }], apple: [{ url: "/assets/icon-192.png", sizes: "192x192" }] },
    openGraph: { siteName: "Zastal Store", locale: "pl_PL", type: "website" },
  };
}
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pl"><head><link rel="preload" href="/assets/fonts/zt-talk-medium.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/></head><body><JsonLdScript data={storeJsonLd()}/><CommerceRoot>{children}</CommerceRoot></body></html>;
}
