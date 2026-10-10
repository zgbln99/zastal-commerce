import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ZASTAL STORE — zielona tożsamość",
  description: "Nowa koncepcja oficjalnego sklepu kibica Zastalu Zielona Góra. Kolekcje, odzież i klubowy styl. Wersja demo.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pl"><body>{children}</body></html>;
}
