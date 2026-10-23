import { canCheckout, cartLineKey, lineUnitPrice, normalizeCart } from './commerce.mjs';

export function readCheckoutAttempt(raw, products) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value.signature !== 'string' || typeof value.key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value.key)) return null;
    const payload = JSON.parse(value.signature);
    if (typeof payload.fulfillment !== 'string' || !/^[a-z0-9_-]{2,32}$/.test(payload.fulfillment)) return null;
    // A saved request may already have succeeded. Its identity cannot depend on
    // today's products, stock, prices, or active players.
    const items = normalizeCart(payload.items).map(({ personalization_display, ...line }) => line);
    if (!items.length || JSON.stringify(items) !== JSON.stringify(payload.items)) return null;
    if ('account_id' in payload && payload.account_id !== null && (!Number.isSafeInteger(payload.account_id) || payload.account_id < 1)) return null;
    const details = normalizeCheckoutDetails(payload);
    if (details === null) return null;
    const normalized = { items, fulfillment: payload.fulfillment, ...('account_id' in payload ? { account_id: payload.account_id } : {}), ...details };
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

// Live checkout details travel inside the retained attempt so a retry resends the identical request.
const TEXT = (value, limit) => typeof value === 'string' && value.length <= limit && !/[\p{Cc}]/u.test(value) ? value.trim() : null;
export function normalizeCheckoutDetails(payload) {
  const keys = ['customer', 'shipping', 'payment', 'invoice', 'consents'];
  if (!keys.some(key => key in payload)) return {};
  const customer = payload.customer && typeof payload.customer === 'object' ? payload.customer : {};
  const shipping = payload.shipping && typeof payload.shipping === 'object' ? payload.shipping : {};
  const address = shipping.address && typeof shipping.address === 'object' ? shipping.address : {};
  const invoice = payload.invoice && typeof payload.invoice === 'object' ? payload.invoice : {};
  const consents = payload.consents && typeof payload.consents === 'object' ? payload.consents : {};
  const fields = {
    customer: { email: TEXT(customer.email ?? '', 254), name: TEXT(customer.name ?? '', 120), phone: TEXT(customer.phone ?? '', 30) },
    shipping: { method: TEXT(shipping.method ?? payload.fulfillment, 32), address: { line1: TEXT(address.line1 ?? '', 160), line2: TEXT(address.line2 ?? '', 80), postal_code: TEXT(address.postal_code ?? '', 12), city: TEXT(address.city ?? '', 80), country: TEXT(address.country ?? 'PL', 2) }, locker_code: TEXT(shipping.locker_code ?? '', 24) },
    payment: ['payu', 'transfer', 'pickup'].includes(payload.payment) ? payload.payment : null,
    invoice: invoice.requested === true ? { requested: true, company: TEXT(invoice.company ?? '', 160), tax_id: TEXT(invoice.tax_id ?? '', 24), address: TEXT(invoice.address ?? '', 300) } : { requested: false },
    consents: { terms: consents.terms === true, privacy: consents.privacy === true, marketing: consents.marketing === true },
  };
  const flat = [fields.customer.email, fields.customer.name, fields.customer.phone, fields.shipping.method, fields.shipping.locker_code, ...Object.values(fields.shipping.address), ...(fields.invoice.requested ? [fields.invoice.company, fields.invoice.tax_id, fields.invoice.address] : [])];
  if (flat.some(value => value === null) || fields.payment === null || fields.shipping.method !== payload.fulfillment) return null;
  return fields;
}

export function resolveCheckoutAttempt(cart, fulfillment, pending, products, key, accountId = null, details = null) {
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
  const extra = details ? normalizeCheckoutDetails({ ...details, fulfillment }) : {};
  if (extra === null) return null;
  return readCheckoutAttempt({ signature: JSON.stringify({ items, fulfillment, account_id: accountId, ...extra }), key, display });
}
