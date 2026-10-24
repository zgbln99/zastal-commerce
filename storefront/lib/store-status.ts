/** Server-side reads of the public store status and catalogue (SSR, robots, sitemap). Never throws. */
const backend = () => process.env.ZASTAL_CMS_API || "http://127.0.0.1:8880";

export async function storeStatus(): Promise<{ live: boolean }> {
  try {
    const response = await fetch(backend() + "/api/store/status", { cache: "no-store", signal: AbortSignal.timeout(2500) });
    if (!response.ok) return { live: false };
    const data = await response.json();
    return { live: data?.checkout_enabled === true };
  } catch { return { live: false }; }
}

export async function publicCatalog(): Promise<{ id: number; name: string }[]> {
  try {
    const response = await fetch(backend() + "/api/catalog", { cache: "no-store", signal: AbortSignal.timeout(2500) });
    if (!response.ok) return [];
    const rows = await response.json();
    return Array.isArray(rows) ? rows.filter(row => Number.isSafeInteger(row?.id)).map(row => ({ id: row.id, name: String(row.name || "") })) : [];
  } catch { return []; }
}
