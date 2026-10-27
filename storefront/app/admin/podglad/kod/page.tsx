"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { can, useAuth } from "../../../../components/AuthProvider";
import { formatMoney } from "../../../../lib/money";

type Promo = { id: number; code: string; kind: "percent" | "amount"; value: number; min_subtotal: number; starts: string; ends: string; max_uses: number; uses: number; active: number; note: string };
const CODE = /^[A-Z0-9][A-Z0-9-]{2,23}$/;
const day = (value: string) => { const [y, m, d] = value.split("-"); return y && m && d ? `${d}.${m}.${y}` : value; };

/** Printable A4 poster with a QR code that drops the discount code into the shopper's cart (hall, cash desk, screens). */
export default function PromoPosterPage() {
  const auth = useAuth();
  const params = useSearchParams();
  const wanted = (params.get("code") || "").toUpperCase();
  const [promo, setPromo] = useState<Promo | null>(null), [error, setError] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => {
    if (!auth.user || !CODE.test(wanted)) return;
    void auth.request<Promo[]>("/api/admin/promo").then(rows => { const found = rows.find(row => row.code === wanted); if (found) setPromo(found); else setError("Nie ma takiego kodu rabatowego."); }).catch(e => setError(e instanceof Error ? e.message : "Nie udało się pobrać kodu."));
  }, [auth, wanted]);
  const link = useMemo(() => origin ? `${origin}/sklep?kod=${encodeURIComponent(wanted)}` : "", [origin, wanted]);
  if (auth.loading) return <main style={{ padding: "3rem" }}>Ładowanie…</main>;
  if (!can(auth.user, "settings")) return <main style={{ padding: "3rem" }}>Plakat jest dostępny tylko dla osób z dostępem do promocji w panelu.</main>;
  if (!CODE.test(wanted)) return <main style={{ padding: "3rem" }}>Podaj kod w adresie, np. <code>?code=KIBIC10</code>.</main>;
  const discount = promo ? (promo.kind === "percent" ? `${promo.value}%` : formatMoney({ amount: promo.value })) : "";
  const conditions = promo ? [promo.min_subtotal ? `od ${formatMoney({ amount: promo.min_subtotal })} wartości produktów` : "", promo.starts && promo.ends && promo.starts === promo.ends ? `tylko ${day(promo.starts)}` : [promo.starts ? `od ${day(promo.starts)}` : "", promo.ends ? `do ${day(promo.ends)}` : ""].filter(Boolean).join(" "), promo.max_uses ? `pierwsze ${promo.max_uses} zamówień` : ""].filter(Boolean) : [];
  return <main className="promo-poster-page">
    <style>{`
      .promo-poster-page{min-height:100vh;background:#e9ece6;padding:24px;font-family:"ZT Talk",Inter,system-ui,sans-serif;color:#102a16}
      .promo-poster-tools{max-width:210mm;margin:0 auto 16px;display:flex;gap:12px;align-items:center;justify-content:space-between}
      .promo-poster-tools button{height:40px;padding:0 18px;border-radius:999px;border:0;background:#165114;color:#fff;font:inherit;font-weight:600;cursor:pointer}
      .promo-poster{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:22mm 18mm;display:flex;flex-direction:column;align-items:center;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.12)}
      .promo-poster img{height:30mm;width:auto}
      .promo-poster h1{font-size:34pt;line-height:1.05;margin:16mm 0 4mm;letter-spacing:-.01em}
      .promo-poster .promo-discount{font-size:64pt;line-height:1;font-weight:700;color:#165114;margin:0}
      .promo-poster .promo-code{display:inline-block;margin:10mm 0 8mm;padding:6mm 12mm;border:2px dashed #165114;border-radius:12px;font-size:30pt;font-weight:700;letter-spacing:.12em}
      .promo-poster .promo-qr{margin:2mm 0 6mm}
      .promo-poster p{font-size:13pt;margin:0 0 3mm;color:#34493a}
      .promo-poster .promo-link{font-size:10pt;color:#6b7a6e;word-break:break-all;margin-top:auto}
      @media print{.promo-poster-page{background:#fff;padding:0}.promo-poster-tools{display:none}.promo-poster{box-shadow:none;width:auto;min-height:auto;padding:14mm 10mm}}
      @page{size:A4;margin:0}
    `}</style>
    <div className="promo-poster-tools"><span>Plakat A4 z kodem QR. Zeskanowany kod zapisuje się w koszyku klienta i nalicza przy zamówieniu.</span><button type="button" onClick={() => window.print()}>Drukuj</button></div>
    {error && <p style={{ maxWidth: "210mm", margin: "0 auto 16px", color: "#9f1d1d" }}>{error}</p>}
    <section className="promo-poster" aria-label={"Plakat kodu " + wanted}>
      <img src="/assets/zastal-logo.svg" alt="Zastal Zielona Góra"/>
      <h1>{promo?.note || "Rabat w sklepie klubowym"}</h1>
      {promo && <p className="promo-discount">-{discount}</p>}
      <span className="promo-code">{wanted}</span>
      <div className="promo-qr">{link && <QRCodeSVG value={link} size={260} level="M" includeMargin={false} fgColor="#102a16"/>}</div>
      <p><strong>Zeskanuj kod telefonem</strong> albo wpisz go w koszyku na {origin.replace(/^https?:\/\//, "")}.</p>
      {conditions.length > 0 && <p>{conditions.join(" · ")}</p>}
      {promo && !promo.active && <p style={{ color: "#9f1d1d" }}>Uwaga: ten kod jest w tej chwili wyłączony.</p>}
      <p className="promo-link">{link}</p>
    </section>
  </main>;
}
