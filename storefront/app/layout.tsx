import type { Metadata } from "next";
import "./globals.css";
import CommerceRoot from "../components/CommerceRoot";
export const metadata: Metadata = {
  title: {default: "Zastal Store — sklep kibica", template: "%s | Zastal Store"},
  description: "Odzież i akcesoria Zastalu Zielona Góra. Nowy sklep kibica z wyborem rozmiarów i dostępnością produktów. Wersja demonstracyjna.",
  robots: {index:false,follow:false},
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pl"><body><CommerceRoot>{children}</CommerceRoot></body></html>;
}
