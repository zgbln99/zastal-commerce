import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getProduct } from "../../../lib/catalog-paths";
import { storeStatus } from "../../../lib/store-status";
import { formatMoney } from "../../../lib/money";
import { siteOrigin } from "../../../lib/site";

export const alt = "Produkt Zastal Store";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social preview card: product photo, name, category and price in the club colours. */
export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const [lookup, status, font] = await Promise.all([getProduct(handle), storeStatus(), readFile(path.join(process.cwd(), "public/assets/fonts/zt-talk-semibold.ttf")).catch(() => null)]);
  const item = lookup.kind === "ok" ? lookup.item : null;
  const photo = item ? (item.images[0]?.url || item.image) : "";
  const photoUrl = photo ? (photo.startsWith("http") ? photo : siteOrigin() + photo) : "";
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#f7f8f3", color: "#19231b", fontFamily: "ZT Talk, Arial" }}>
      <div style={{ display: "flex", width: 520, height: "100%", background: "#e9efe6", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {photoUrl ? <img src={photoUrl} alt="" width={520} height={630} style={{ objectFit: "cover", width: 520, height: 630 }}/> : <div style={{ fontSize: 48, color: "#165114" }}>Zastal</div>}
      </div>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between", padding: "56px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, color: "#165114", letterSpacing: 2 }}>ZASTAL STORE</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 24, color: "#5e6d60", textTransform: "uppercase", letterSpacing: 4 }}>{item?.category || "Sklep klubowy"}</div>
          <div style={{ fontSize: 60, lineHeight: 1.05, fontWeight: 600 }}>{item?.name || "Zastal Zielona Góra"}</div>
          {item && status.live && item.price > 0 && <div style={{ fontSize: 40, color: "#165114" }}>{formatMoney({ amount: item.price })}</div>}
        </div>
        <div style={{ fontSize: 22, color: "#5e6d60" }}>Oficjalny sklep Zastalu Zielona Góra</div>
      </div>
    </div>,
    { ...size, fonts: font ? [{ name: "ZT Talk", data: font, weight: 600, style: "normal" }] : [] },
  );
}
