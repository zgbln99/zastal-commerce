import { getAllProducts, type CatalogEntry } from "../../../lib/catalog-paths";
import { storeStatus } from "../../../lib/store-status";
import { siteOrigin, SITE_NAME, STORE_DESCRIPTION } from "../../../lib/site";

export const dynamic = "force-dynamic";

/**
 * Product feed for Google Merchant Center and Meta Commerce (RSS 2.0 with the Google Shopping namespace).
 * One item per size variant: the variant SKU is the item id, the product SKU groups the sizes, the EAN is the GTIN.
 * Prices are gross PLN in the shop's own currency, availability follows the live stock. Empty before launch.
 */
const BRAND = "Zastal Zielona Góra";
const GOOGLE_CATEGORY: Record<string, string> = { Koszulki: "5598", Bluzy: "5598", Dzieci: "5598", Akcesoria: "166" }; // 5598 = Apparel & Accessories > Clothing > Activewear, 166 = Apparel & Accessories
const PRODUCT_TYPE: Record<string, string> = { Koszulki: "Odzież > Koszulki", Bluzy: "Odzież > Bluzy", Dzieci: "Odzież > Dla dzieci", Akcesoria: "Akcesoria" };

const escape = (value: string) => value.replace(/[<>&'"]/g, ch => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[ch] as string);
const money = (grosze: number) => (grosze / 100).toFixed(2) + " PLN";
const plain = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
// Club-issued in-store codes (GS1 prefix 2, or 02/04 on 12-14 digits) are not public GTINs: Merchant Center rejects them, so those items go out without one.
const gtin = (ean: unknown) => typeof ean === "string" && /^\d{8}$|^\d{12,14}$/.test(ean) && !/^(2|02|04)/.test(ean.length >= 12 ? ean.slice(-13) : ean) ? ean : "";

function items(origin: string, product: CatalogEntry): string[] {
  if (!product.released || product.gift_card || !product.sku) return [];
  const link = origin + product.path;
  const images = product.images.map(img => origin + img.url).filter(url => !url.endsWith(".svg"));
  if (!images.length && product.image && !product.image.endsWith(".svg")) images.push(origin + product.image);
  if (!images.length) return []; // Merchant Center rejects items without a picture
  const current = product.price + (product.personalization_required ? product.personalization_fee : 0);
  const previous = product.previous_price !== null && product.previous_price > product.price ? product.previous_price + (product.personalization_required ? product.personalization_fee : 0) : null;
  const description = plain(product.description || product.subtitle || product.name);
  const kids = product.category === "Dzieci";
  return product.variants.filter(variant => typeof variant.sku === "string" && variant.sku).map(variant => {
    const size = typeof variant.size === "string" && variant.size && variant.size !== "UNI" ? variant.size : "";
    const availability = variant.stock > 0 ? "in_stock" : product.preorder ? "preorder" : "out_of_stock";
    const code = gtin(variant.ean);
    return [
      "<item>",
      `<g:id>${escape(variant.sku as string)}</g:id>`,
      `<g:item_group_id>${escape(product.sku)}</g:item_group_id>`,
      `<g:title>${escape(size ? `${product.name}, rozmiar ${size}` : product.name)}</g:title>`,
      `<g:description>${escape(description)}</g:description>`,
      `<g:link>${escape(size ? `${link}?rozmiar=${encodeURIComponent(size)}` : link)}</g:link>`,
      `<g:image_link>${escape(images[0])}</g:image_link>`,
      ...images.slice(1, 11).map(url => `<g:additional_image_link>${escape(url)}</g:additional_image_link>`),
      `<g:availability>${availability}</g:availability>`,
      previous !== null ? `<g:price>${money(previous)}</g:price><g:sale_price>${money(current)}</g:sale_price>` : `<g:price>${money(current)}</g:price>`,
      `<g:brand>${BRAND}</g:brand>`,
      code ? `<g:gtin>${code}</g:gtin>` : `<g:mpn>${escape(variant.sku as string)}</g:mpn><g:identifier_exists>no</g:identifier_exists>`,
      "<g:condition>new</g:condition>",
      `<g:google_product_category>${GOOGLE_CATEGORY[product.category] || "166"}</g:google_product_category>`,
      `<g:product_type>${escape(PRODUCT_TYPE[product.category] || product.category)}</g:product_type>`,
      size ? `<g:size>${escape(size)}</g:size>` : "",
      `<g:age_group>${kids ? "kids" : "adult"}</g:age_group>`,
      "<g:gender>unisex</g:gender>",
      product.personalization_required ? "<g:is_bundle>no</g:is_bundle><g:custom_label_0>z nadrukiem</g:custom_label_0>" : "",
      `<g:custom_label_1>${escape(product.category)}</g:custom_label_1>`,
      "</item>",
    ].filter(Boolean).join("");
  });
}

export async function GET() {
  const origin = siteOrigin();
  const status = await storeStatus();
  const products = status.live ? await getAllProducts() : [];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "<channel>",
    `<title>${escape(SITE_NAME)}</title>`,
    `<link>${escape(origin)}/sklep</link>`,
    `<description>${escape(STORE_DESCRIPTION)}</description>`,
    ...products.flatMap(product => items(origin, product)),
    "</channel>",
    "</rss>",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": status.live ? "public, max-age=900" : "no-store" } });
}
