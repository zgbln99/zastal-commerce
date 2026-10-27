import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { siteOrigin } from "../lib/site";

export const alt = "Zastal Store";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Default social card for pages without their own image. */
export default async function Image() {
  const font = await readFile(path.join(process.cwd(), "public/assets/fonts/zt-talk-semibold.ttf")).catch(() => null);
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#165114", color: "#ffffff", fontFamily: "ZT Talk, Arial", padding: 72, flexDirection: "column", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}><img src={siteOrigin() + "/assets/zastal-logo.svg"} alt="" width={96} height={96}/><div style={{ fontSize: 34, letterSpacing: 3 }}>ZASTAL STORE</div></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}><div style={{ fontSize: 76, lineHeight: 1.05, fontWeight: 600 }}>Sklep Zastalu Zielona Góra</div><div style={{ fontSize: 30, color: "#d7e7d5" }}>Koszulki, bluzy i akcesoria z klubowej kolekcji</div></div>
    </div>,
    { ...size, fonts: font ? [{ name: "ZT Talk", data: font, weight: 600, style: "normal" }] : [] },
  );
}
