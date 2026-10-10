import { canCheckout, cartLineKey, lineUnitPrice, normalizeCart } from './commerce.mjs';

export function readCheckoutAttempt(raw, products) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value.signature !== 'string' || typeof value.key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value.key)) return null;
    const payload = JSON.parse(value.signature);
    if (!['odbior', 'paczkomat', 'kurier'].includes(payload.fulfillment)) return null;
    // A saved request may already have succeeded. Its identity cannot depend on
    // today's products, stock, prices, or active players.
    const items = normalizeCart(payload.items).map(({ personalization_display, ...line }) => line);
    if (!items.length || JSON.stringify(items) !== JSON.stringify(payload.items)) return null;
    if ('account_id' in payload && payload.account_id !== null && (!Number.isSafeInteger(payload.account_id) || payload.account_id < 1)) return null;
    const normalized = { items, fulfillment: payload.fulfillment, ...('account_id' in payload ? { account_id: payload.account_id } : {}) };
    const signature = JSON.stringify(normalized);
    if (signature !== value.signature) return null;
    let display;
    if (Array.isArray(value.display) && value.display.length === items.length) {
      const rows = value.display.map((row, index) => {
        const line = normalizeCart([row])[0];
        if (!line || cartLineKey(line) !== cartLineKey(items[index]) || line.quantity !== items[index].quantity || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 200 || !Number.isSafeInteger(row.unit_price) || row.unit_price < 0) return null;
        return { ...line, name: row.name, unit_price: row.unit_price };
      });
      if (rows.every(Boolean)) display = rows;
    }
    return { signature, key: value.key, payload: normalized, ...(display ? { display } : {}) };
  } catch { return null; }
}

export function resolveCheckoutAttempt(cart, fulfillment, pending, products, key, accountId = null) {
  const recovered = readCheckoutAttempt(pending);
  if (recovered) return recovered;
  if (!canCheckout(cart, products)) return null;
  const normalized = normalizeCart(cart, products);
  const items = normalized.map(({ personalization_display, ...line }) => line);
  const display = normalized.map(line => {
    const product = products.find(p => p.id === line.id);
    const print = line.personalization;
    const snapshot = print?.mode === 'custom' ? { name: print.name, number: print.number } : line.personalization_display;
    return { ...line, name: product.name, unit_price: lineUnitPrice(product, line), ...(snapshot ? { personalization_display: { ...snapshot, fee: product.personalization_fee || 0 } } : {}) };
  });
  return readCheckoutAttempt({ signature: JSON.stringify({ items, fulfillment, account_id: accountId }), key, display });
}
