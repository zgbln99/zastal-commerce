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

export function resolveSaleAttempt(cart, payment, pending, products, key, customerId = null) {
  const recovered = readSaleAttempt(pending);
  if (recovered) return recovered;
  if (customerId !== null && (!Number.isSafeInteger(customerId) || customerId < 1)) return null;
  if (!canCheckout(cart,products)) return null;
  const normalized = normalizeCart(cart,products);
  const items = normalized.map(({personalization_display,...line}) => line);
  const display = normalized.map(line => {
    const product = products.find(p => p.id === line.id);
    return {...line,name:product.name,unit_price:lineUnitPrice(product,line)};
  });
  return readSaleAttempt({signature:JSON.stringify({items,payment_method:payment,payment_confirmed:true,...(customerId!==null?{customer_id:customerId}:{})}),key,display});
}

// Only definitive pre-commit rejection permits editing with a new key.
// A 409 may describe an already-used key; preserve that snapshot for review.
export function isKnownSaleRejection(error) {
  return [400,422].includes(error?.status) || error?.status === 409 && error?.code === 'insufficient_stock';
}
