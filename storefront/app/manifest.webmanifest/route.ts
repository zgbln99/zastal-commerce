import { SITE_NAME, STORE_DESCRIPTION } from "../../lib/site";

/** Web app manifest: install the shop to the home screen with the club colours. */
export function GET() {
  const manifest = {
    name: SITE_NAME, short_name: "Zastal Store", description: STORE_DESCRIPTION, start_url: "/", scope: "/", display: "standalone", lang: "pl",
    background_color: "#f7f8f3", theme_color: "#165114",
    icons: [{ src: "/assets/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/assets/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "/assets/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }],
  };
  return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=86400" } });
}
