import type { Metadata } from "next";
import { Suspense } from "react";
import NewsletterClient from "./NewsletterClient";

export const metadata: Metadata = { title: "Newsletter", description: "Zapis do newslettera sklepu Zastalu Zielona Góra.", robots: { index: false, follow: true } };

export default function NewsletterPage() {
  return <Suspense fallback={<div className="container page-heading"><h1>Newsletter</h1></div>}><NewsletterClient/></Suspense>;
}
