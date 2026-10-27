import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content-Security-Policy with a nonce (Next.js attaches it to its own scripts).
 * Pages are rendered dynamically, so every HTML response gets a fresh nonce.
 * Static assets and the API proxy are excluded by the matcher below.
 */
// Hosts of the optional measurement tools (Google Analytics 4, Meta pixel) are allowed only while the seller has configured them.
// The settings live in the shop database, so they are read from the API and cached for a minute; any failure means "none".
let trackingCache = { at: 0, hosts: [] as string[] };
async function trackingHosts(): Promise<string[]> {
  if (Date.now() - trackingCache.at < 60_000) return trackingCache.hosts;
  let hosts: string[] = [];
  try {
    const response = await fetch((process.env.ZASTAL_CMS_API || "http://127.0.0.1:8880") + "/api/store/status", { cache: "no-store", signal: AbortSignal.timeout(800) });
    const tracking = (await response.json())?.config?.tracking || {};
    if (/^G-[A-Z0-9]{6,14}$/.test(String(tracking.ga4 || ""))) hosts.push("https://www.googletagmanager.com", "https://*.google-analytics.com", "https://*.analytics.google.com");
    if (/^[0-9]{8,20}$/.test(String(tracking.meta_pixel || ""))) hosts.push("https://connect.facebook.net", "https://www.facebook.com");
  } catch { hosts = []; }
  trackingCache = { at: Date.now(), hosts };
  return hosts;
}

export async function proxy(request: NextRequest) {
  const tools = await trackingHosts();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    // Google Pay (checkout wallet button) talks to Google from the page; everything else stays same-origin.
    `connect-src 'self' https://pay.google.com https://payments.google.com${tools.length ? " " + tools.join(" ") : ""}`,
    "frame-src 'self' https://pay.google.com",
    "frame-ancestors 'self'",
    "form-action 'self' https://secure.payu.com https://secure.snd.payu.com",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  // Popups opened by payment wallets keep working; other windows cannot reach this page through window.opener.
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  return response;
}

export const config = {
  matcher: [{
    source: "/((?!api|_next/static|_next/image|assets|favicon.ico|robots.txt|sitemap.xml).*)",
    missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }],
  }],
};
