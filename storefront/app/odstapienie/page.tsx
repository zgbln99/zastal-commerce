import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "reicon-react";
import WithdrawalForm from "./WithdrawalForm";
import { absolute } from "../../lib/site";

export const metadata: Metadata = { title: "Odstąpienie od umowy", description: "Złóż oświadczenie o odstąpieniu od umowy zawartej w sklepie Zastalu Zielona Góra.", alternates: { canonical: absolute("/odstapienie") } };

export default function WithdrawalPage() {
  return <div className="container pb-16">
    <div className="breadcrumbs"><Link href="/">Strona główna</Link><ChevronRight size={12}/><span>Odstąpienie od umowy</span></div>
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">Odstąpienie od umowy</h1>
      <p className="mt-4 text-muted-foreground">Konsument może odstąpić od umowy zawartej na odległość w ciągu 14 dni od objęcia towaru w posiadanie, bez podawania przyczyny. Wypełnij formularz, sprawdź dane i potwierdź. Otrzymasz e-mail z potwierdzeniem daty złożenia oświadczenia.</p>
      <p className="mt-3 rounded-xl border border-border bg-muted/50 p-4 text-sm">Prawo odstąpienia nie przysługuje w odniesieniu do rzeczy wykonanych według Twojej specyfikacji, na przykład koszulki z wybranym nazwiskiem i numerem (art. 38 pkt 3 ustawy o prawach konsumenta). Oświadczenie takiego zamówienia i tak do nas trafi, a my odpowiemy e-mailem.</p>
      <WithdrawalForm/>
      <p className="mt-8 text-sm text-muted-foreground">Chcesz zgłosić reklamację albo zwrot z powodu wady? Zrobisz to na stronie zamówienia lub w <Link href="/konto" className="inline-link">koncie klienta</Link>. Pełne zasady: <Link href="/informacje/odstapienie-od-umowy" className="inline-link">informacja o odstąpieniu</Link>.</p>
    </div>
  </div>;
}
