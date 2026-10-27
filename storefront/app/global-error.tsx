"use client";

/** Last resort when the root layout itself fails: plain markup, no store context. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="pl"><body style={{ fontFamily: "Arial, sans-serif", padding: "4rem 1.5rem", textAlign: "center", color: "#19231b", background: "#f7f8f3" }}>
    <h1 style={{ fontSize: "1.75rem", fontWeight: 500 }}>Sklep chwilowo niedostępny</h1>
    <p style={{ color: "#5e6d60" }}>Spróbuj odświeżyć stronę za chwilę.{error.digest ? ` Kod zdarzenia: ${error.digest}` : ""}</p>
    <button onClick={() => reset()} style={{ marginTop: "1.5rem", padding: "0.75rem 1.5rem", borderRadius: "0.5rem", border: 0, background: "#165114", color: "#fff", fontSize: "1rem" }}>Odśwież</button>
  </body></html>;
}
