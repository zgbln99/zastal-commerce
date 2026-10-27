"use client";
import { useEffect, useRef, useState } from "react";
import type { GooglePayConfig, PayuMethod } from "../lib/commerce.mjs";
import { cn } from "@/lib/utils";

export type PaymentChannel = { value: "blik" | "c" | "jp"; authorization_code: string };
type GoogleApi = { payments: { api: { PaymentsClient: new (options: { environment: string }) => GooglePaymentsClient } } };
type GooglePaymentsClient = {
  isReadyToPay: (request: Record<string, unknown>) => Promise<{ result: boolean }>;
  createButton: (options: { onClick: () => void; buttonType: string; buttonSizeMode: string; buttonLocale: string }) => HTMLElement;
  loadPaymentData: (request: Record<string, unknown>) => Promise<{ paymentMethodData: { tokenizationData: { token: string } } }>;
};
const SCRIPT = "https://pay.google.com/gp/p/js/pay.js";
const CARD = { type: "CARD", parameters: { allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"], allowedCardNetworks: ["MASTERCARD", "VISA"] } };

/** The script loads once per page; the promise resolves to the global once Google's loader runs. */
let loader: Promise<GoogleApi | null> | null = null;
function loadGooglePay(): Promise<GoogleApi | null> {
  if (loader) return loader;
  loader = new Promise(resolve => {
    const existing = (window as unknown as { google?: GoogleApi }).google;
    if (existing?.payments) return resolve(existing);
    const script = document.createElement("script");
    script.src = SCRIPT; script.async = true;
    script.onload = () => resolve((window as unknown as { google?: GoogleApi }).google ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return loader;
}

/**
 * Channel picker shown under "Płatność online (PayU)": the channels PayU has enabled for this point of sale.
 * BLIK may take the 6-digit code here (PayU authorises it in place, the bank app asks to confirm); cards jump straight to
 * PayU's card form; Google Pay collects the wallet token in the store and hands it to PayU; everything else (Apple Pay,
 * bank buttons) stays on PayU's own page.
 */
export default function PayuChannels({ methods, googlePay, channel, onChange, onWalletToken, beforeWallet, disabled, amount }: {
  methods: PayuMethod[]; googlePay: GooglePayConfig | null; channel: PaymentChannel | null; onChange: (next: PaymentChannel | null) => void;
  onWalletToken: (token: string) => void; beforeWallet: () => boolean; disabled: boolean; amount: number;
}) {
  const [walletState, setWalletState] = useState<"idle" | "ready" | "unavailable">("idle");
  const [walletError, setWalletError] = useState("");
  const client = useRef<GooglePaymentsClient | null>(null);
  const slot = useRef<HTMLDivElement | null>(null);
  const hasGoogle = methods.some(m => m.value === "jp") && !!googlePay;
  const selected = channel?.value ?? "";
  useEffect(() => {
    if (!hasGoogle || selected !== "jp" || !googlePay) return;
    let cancelled = false;
    void loadGooglePay().then(async api => {
      if (cancelled) return;
      if (!api) { setWalletState("unavailable"); return; }
      try {
        const payments = new api.payments.api.PaymentsClient({ environment: googlePay.environment });
        const ready = await payments.isReadyToPay({ apiVersion: 2, apiVersionMinor: 0, allowedPaymentMethods: [CARD] });
        if (cancelled) return;
        if (!ready.result) { setWalletState("unavailable"); return; }
        client.current = payments;
        setWalletState("ready");
      } catch { if (!cancelled) setWalletState("unavailable"); }
    });
    return () => { cancelled = true; };
  }, [hasGoogle, selected, googlePay]);
  useEffect(() => {
    if (walletState !== "ready" || !client.current || !slot.current) return;
    const holder = slot.current;
    holder.replaceChildren(client.current.createButton({ buttonType: "pay", buttonSizeMode: "fill", buttonLocale: "pl", onClick: () => void pay() }));
    return () => holder.replaceChildren();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletState, amount, disabled]);
  const pay = async () => {
    if (disabled || !client.current || !googlePay) return;
    setWalletError("");
    if (!beforeWallet()) return;
    try {
      const data = await client.current.loadPaymentData({
        apiVersion: 2, apiVersionMinor: 0,
        allowedPaymentMethods: [{ ...CARD, tokenizationSpecification: { type: "PAYMENT_GATEWAY", parameters: { gateway: "payu", gatewayMerchantId: googlePay.gateway_merchant_id } } }],
        transactionInfo: { totalPriceStatus: "FINAL", totalPrice: (amount / 100).toFixed(2), currencyCode: "PLN", countryCode: "PL" },
        merchantInfo: { merchantName: googlePay.merchant_name, ...(googlePay.merchant_id ? { merchantId: googlePay.merchant_id } : {}) },
      });
      const token = data?.paymentMethodData?.tokenizationData?.token;
      if (typeof token !== "string" || !token) throw new Error("Google Pay nie zwrócił tokenu płatności.");
      // PayU takes the wallet token base64-encoded.
      onWalletToken(btoa(unescape(encodeURIComponent(token))));
    } catch (e) {
      const code = (e as { statusCode?: string })?.statusCode;
      if (code === "CANCELED") return;
      setWalletError(e instanceof Error ? e.message : "Google Pay nie udało się uruchomić. Wybierz inną metodę.");
    }
  };
  if (!methods.length) return null;
  const pill = (value: PaymentChannel["value"] | "", label: string) => <button type="button" key={value || "other"} className={cn("inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors", selected === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted")} aria-pressed={selected === value} disabled={disabled} onClick={() => onChange(value ? { value, authorization_code: "" } : null)}>{label}</button>;
  const others = methods.filter(m => m.value === "ap").map(m => m.name);
  return <div className="payu-channels mt-3 rounded-lg border border-border bg-muted/40 p-3">
    <p className="mb-2 text-sm text-muted-foreground">Jak chcesz zapłacić w PayU?</p>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Sposób płatności PayU">
      {methods.filter(m => m.value === "blik").map(m => pill("blik", m.name))}
      {methods.filter(m => m.value === "c").map(m => pill("c", m.name))}
      {hasGoogle && pill("jp", "Google Pay")}
      {pill("", others.length ? `${others.join(", ")} i inne` : "Inne metody")}
    </div>
    {selected === "blik" && <div className="mt-3">
      <label className="block text-sm"><span className="font-medium">Kod BLIK z aplikacji banku</span><span className="text-muted-foreground"> (6 cyfr, opcjonalnie)</span>
        <input className="mt-1 h-11 w-44 rounded-lg border border-border bg-background px-3 text-lg tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" placeholder="______" value={channel?.authorization_code ?? ""} aria-label="Kod BLIK" disabled={disabled} onChange={e => onChange({ value: "blik", authorization_code: e.target.value.replace(/\D/g, "").slice(0, 6) })}/></label>
      <p className="mt-1.5 text-xs text-muted-foreground">Z kodem zatwierdzisz płatność w aplikacji banku bez wychodzenia ze sklepu. Bez kodu wpiszesz go na stronie PayU.</p>
    </div>}
    {selected === "c" && <p className="mt-3 text-xs text-muted-foreground">Dane karty podasz na bezpiecznej stronie PayU.</p>}
    {selected === "jp" && <div className="mt-3">
      {walletState === "unavailable" ? <p className="text-sm text-muted-foreground">Google Pay nie jest dostępne w tej przeglądarce. Wybierz inną metodę albo zapłać na stronie PayU.</p> : <>
        <div ref={slot} className="max-w-xs" aria-live="polite">{walletState !== "ready" && <p className="text-sm text-muted-foreground">Łączymy z Google Pay…</p>}</div>
        <p className="mt-1.5 text-xs text-muted-foreground">Przycisk Google Pay składa zamówienie i od razu przekazuje płatność do PayU.</p>
      </>}
      {walletError && <p className="field-error mt-2" role="alert">{walletError}</p>}
    </div>}
    {selected === "" && <p className="mt-3 text-xs text-muted-foreground">Wszystkie metody (przelewy online{others.length ? ", " + others.join(", ") : ""}) wybierzesz na stronie PayU.</p>}
  </div>;
}
