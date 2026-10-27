import type { MetadataRoute } from "next";
import { storeStatus } from "../lib/store-status";

export const dynamic = "force-dynamic";

/** Index the public shop only once sales are live; staff and account routes stay private. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const live = (await storeStatus()).live;
  const origin = process.env.ZASTAL_SITE_ORIGIN || "https://zastalstore.51-15-21-164.sslip.io";
  return live
    ? { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/konto", "/zamowienie", "/api/"] }], sitemap: origin + "/sitemap.xml" }
    : { rules: [{ userAgent: "*", disallow: "/" }] };
}
