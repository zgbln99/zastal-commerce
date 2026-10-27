/** Money helpers in the yournextstore shape: amounts are integer grosze, output is Polish currency formatting. */
const formatter = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" });

export function formatMoney({ amount, currency = "PLN", locale = "pl-PL" }: { amount: number | string | bigint; currency?: string; locale?: string }) {
  const minor = typeof amount === "bigint" ? Number(amount) : Number(amount);
  if (!Number.isFinite(minor)) return "";
  if (currency === "PLN" && locale === "pl-PL") return formatter.format(minor / 100);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
}

/** Minor units to the major-unit number structured data and analytics expect (6500 → 65). */
export const minorUnitsToMajor = (amount: number) => Math.round(amount) / 100;

/** "65.00" for schema.org price fields. */
export const priceString = (amount: number) => minorUnitsToMajor(amount).toFixed(2);
