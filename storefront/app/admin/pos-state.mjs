import {canCheckout, normalizeCart, cartLineKey, lineUnitPrice} from '../../lib/commerce.mjs';

// Recovery deliberately does not consult today's catalog: this request may
// already have committed and exhausted the stock it originally reserved.
export function readSaleAttempt(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value.signature !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value.key)) return null;
    const payload = JSON.parse(value.signature);
    if (!['cash','terminal'].includes(payload.payment_method) || payload.payment_confirmed !== true) return null;
    const items = normalizeCart(payload.items).map(({personalization_display,...line}) => line);
    if (!items.length || JSON.stringify(items) !== JSON.stringify(payload.items)) return null;
    const normalized = {items, payment_method:payload.payment_method, payment_confirmed:true};
    if ('customer_id' in payload) {
      if (!Number.isSafeInteger(payload.customer_id) || payload.customer_id < 1) return null;
      normalized.customer_id=payload.customer_id;
    }
    const extras = normalizeSaleExtras(payload);
    if (extras === null) return null;
    Object.assign(normalized, extras);
    if (JSON.stringify(normalized) !== value.signature) return null;
    let display;
    if (Array.isArray(value.display) && value.display.length === items.length) {
      const rows = value.display.map((row,index) => {
        const line = normalizeCart([row])[0];
        if (!line || cartLineKey(line) !== cartLineKey(items[index]) || line.quantity !== items[index].quantity || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 200 || !Number.isSafeInteger(row.unit_price) || row.unit_price < 0) return null;
        return {...line,name:row.name,unit_price:row.unit_price};
      });
      if (rows.every(Boolean)) display = rows;
    }
    return {signature:value.signature,key:value.key,payload:normalized,...(display ? {display} : {})};
  } catch {return null;}
}

// Live-sale facts (discount, fiscal document, cash, handover) travel inside the retained identity.
export function normalizeSaleExtras(payload) {
  const out = {};
  if ('discount' in payload) {
    if (!Number.isSafeInteger(payload.discount) || payload.discount < 0) return null;
    out.discount = payload.discount;
    if (typeof payload.discount_reason !== 'string' || payload.discount_reason.length > 120) return null;
    out.discount_reason = payload.discount_reason;
  }
  if ('fiscal' in payload && payload.fiscal !== null) {
    const fiscal = payload.fiscal;
    if (!fiscal || typeof fiscal !== 'object' || !['paragon', 'faktura'].includes(fiscal.kind) || typeof fiscal.number !== 'string' || !/^[A-Za-z0-9/_. -]{1,40}$/.test(fiscal.number.trim())) return null;
    out.fiscal = { kind: fiscal.kind, number: fiscal.number.trim() };
  }
  if ('cash_received' in payload) {
    if (!Number.isSafeInteger(payload.cash_received) || payload.cash_received < 0) return null;
    out.cash_received = payload.cash_received;
  }
  if ('handover' in payload) {
    if (typeof payload.handover !== 'boolean') return null;
    out.handover = payload.handover;
  }
  return out;
}

export function resolveSaleAttempt(cart, payment, pending, products, key, customerId = null, extras = null) {
  const recovered = readSaleAttempt(pending);
  if (recovered) return recovered;
  if (customerId !== null && (!Number.isSafeInteger(customerId) || customerId < 1)) return null;
  const facts = extras ? normalizeSaleExtras(extras) : {};
  if (facts === null) return null;
  if (!canCheckout(cart,products)) return null;
  const normalized = normalizeCart(cart,products);
  const items = normalized.map(({personalization_display,...line}) => line);
  const display = normalized.map(line => {
    const product = products.find(p => p.id === line.id);
    return {...line,name:product.name,unit_price:lineUnitPrice(product,line)};
  });
  return readSaleAttempt({signature:JSON.stringify({items,payment_method:payment,payment_confirmed:true,...(customerId!==null?{customer_id:customerId}:{}),...facts}),key,display});
}

// Only definitive pre-commit rejection permits editing with a new key.
// A 409 may describe an already-used key; preserve that snapshot for review.
export function isKnownSaleRejection(error) {
  return [400,422].includes(error?.status) || error?.status === 409 && error?.code === 'insufficient_stock';
}
