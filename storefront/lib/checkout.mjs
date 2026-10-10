import { canCheckout, normalizeCart } from './commerce.mjs';

export function readCheckoutAttempt(raw, products) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value.signature !== 'string' || typeof value.key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value.key)) return null;
    const payload = JSON.parse(value.signature);
    if (!['odbior', 'paczkomat', 'kurier'].includes(payload.fulfillment)) return null;
    const items = normalizeCart(payload.items, products);
    if (!items.length || JSON.stringify(items) !== JSON.stringify(payload.items)) return null;
    const signature = JSON.stringify({ items, fulfillment: payload.fulfillment });
    if (signature !== value.signature) return null;
    return { signature, key: value.key, payload: { items, fulfillment: payload.fulfillment } };
  } catch { return null; }
}

export function resolveCheckoutAttempt(cart, fulfillment, pending, products, key) {
  const recovered = readCheckoutAttempt(pending, products);
  if (recovered) return recovered;
  if (!canCheckout(cart, products)) return null;
  return readCheckoutAttempt({ signature: JSON.stringify({ items: cart, fulfillment }), key }, products);
}
