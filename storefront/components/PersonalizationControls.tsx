"use client";
import { useId } from "react";
import { fmt } from "../lib/catalog";
import type { Player, Product } from "../lib/commerce.mjs";
import "./personalization.css";
export type PrintSelection = { mode: "none" | "player" | "custom"; playerId: string; name: string; number: string };
export default function PersonalizationControls({ product, value, onChange, players, status, error, retry }: { product: Product; value: PrintSelection; onChange: (value: PrintSelection) => void; players: Player[]; status: "loading" | "ready" | "error"; error: string; retry: () => Promise<void> }) {
  const hintId = useId();
  const player = players.find(p => String(p.id) === value.playerId);
  const previewName = value.mode === "player" ? player?.print_name || "" : value.name.trim().toUpperCase();
  const previewNumber = value.mode === "player" ? player?.number || "" : value.number;
  return <fieldset className="print-controls"><legend>Nadruk {product.personalization_required && <span>· wymagany</span>}</legend><div className="print-modes">
    {!product.personalization_required && <button type="button" aria-pressed={value.mode === "none"} onClick={() => onChange({ ...value, mode: "none" })}>Bez nadruku</button>}
    <button type="button" aria-pressed={value.mode === "player"} onClick={() => onChange({ ...value, mode: "player" })}>Zawodnik</button>
    <button type="button" aria-pressed={value.mode === "custom"} onClick={() => onChange({ ...value, mode: "custom" })}>Własny nadruk</button>
  </div>
    {value.mode === "player" && <div className="print-player"><label>Zawodnik<select value={value.playerId} disabled={status !== "ready" || !players.length} onChange={e => onChange({ ...value, playerId: e.target.value })}><option value="">{status === "loading" ? "Wczytywanie kadry…" : status === "error" ? "Kadra chwilowo niedostępna" : !players.length ? "Brak zawodników do wyboru" : "Wybierz zawodnika"}</option>{players.map(p => <option key={p.id} value={p.id}>{p.name} · {p.number}</option>)}</select></label>{status === "error" && <p role="status">{error} <button type="button" className="inline-link" onClick={() => void retry()}>Spróbuj ponownie</button></p>}{status === "ready" && !players.length && <p className="input-hint">Lista kadry jest pusta. Wybierz własny nadruk{!product.personalization_required && " lub produkt bez nadruku"}.</p>}</div>}
    {value.mode === "custom" && <div className="print-custom"><label>Nazwisko na koszulce<input autoComplete="off" value={value.name} maxLength={40} onChange={e => onChange({ ...value, name: e.target.value })} placeholder="np. KOWALSKI" aria-describedby={hintId + "-name"}/></label><label>Numer<input inputMode="numeric" autoComplete="off" value={value.number} maxLength={2} onChange={e => onChange({ ...value, number: e.target.value })} placeholder="0–99" aria-describedby={hintId + "-number"}/></label><p id={hintId + "-name"} className="input-hint">1–20 znaków: litery, spacje, kropka, apostrof lub myślnik. Wydruk wielkimi literami.</p><p id={hintId + "-number"} className="input-hint">1–2 cyfry. Numery 0 i 00 są poprawne.</p></div>}
    <p className="print-fee">{value.mode === "none" ? "Opcja nadruku" : "Nadruk"}: <strong>{product.personalization_fee ? "+" + fmt(product.personalization_fee) : "bez dopłaty"}</strong> / szt.</p>
    {value.mode !== "none" && (previewName || previewNumber) && <figure className="print-preview"><svg viewBox="0 0 220 200" role="img" aria-label={"Podgląd nadruku: " + previewName + " " + previewNumber}><title>Podgląd nadruku</title><path d="M69 20 90 10Q110 28 130 10L151 20 199 48 178 87 151 73 151 188 69 188 69 73 42 87 21 48Z" fill="#f2f6f3" stroke="#b7c7bc" strokeWidth="2"/><text x="110" y="65" textAnchor="middle" fontSize={previewName.length > 12 ? 11 : 14} fontWeight="700" fill="#174c37">{previewName}</text><text x="110" y="137" textAnchor="middle" fontSize="61" fontWeight="800" fill="#174c37">{previewNumber}</text></svg><figcaption>Podgląd nadruku<small>Schemat poglądowy. Umiejscowienie i krój mogą się różnić.</small></figcaption></figure>}
  </fieldset>;
}
