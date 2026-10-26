"use client";
import Link from "next/link";
import { useEffect } from "react";
import { ArrowDottedRotateAnticlockwise, ArrowRight } from "reicon-react";
import { TextureButton } from "@/components/templates/essentials/ui/texture-button";

/** Route error boundary: the shop chrome stays, the broken page offers a retry. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <div className="container py-16"><div className="empty-state"><h1>Coś poszło nie tak</h1><p>Nie udało się wyświetlić tej strony. Spróbuj ponownie albo wróć do sklepu.{error.digest ? ` Kod zdarzenia: ${error.digest}` : ""}</p><div className="flex flex-wrap justify-center gap-3"><TextureButton onClick={() => reset()}>Spróbuj ponownie <ArrowDottedRotateAnticlockwise size={16}/></TextureButton><TextureButton variant="secondary" render={<Link href="/sklep"/>}>Przejdź do sklepu <ArrowRight size={16}/></TextureButton></div></div></div>;
}
