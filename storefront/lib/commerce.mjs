import { productImages, safeImageUrl } from './product-media.mjs';
// Delivery prices come only from the published store configuration; nothing is hardcoded.
export function shippingCost(method, subtotal) {
  if (!method || typeof method !== 'object' || !Number.isSafeInteger(method.price) || method.price < 0) throw new Error('Nieprawidłowa metoda dostawy');
  if (Number.isSafeInteger(method.free_from) && method.free_from >= 0 && subtotal >= method.free_from) return 0;
  return method.price;
}
export function normalizeStoreStatus(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const config = value.config && typeof value.config === 'object' ? value.config : {};
  const text = (input, limit = 400) => typeof input === 'string' ? input.slice(0, limit) : '';
  const shipping = Array.isArray(config.shipping_methods) ? config.shipping_methods.filter(m => m && typeof m.code === 'string' && /^[a-z0-9_-]{2,32}$/.test(m.code) && Number.isSafeInteger(m.price) && m.price >= 0 && ['pickup', 'locker', 'courier'].includes(m.kind)).map(m => ({ code: m.code, name: text(m.name, 80) || m.code, kind: m.kind, price: m.price, free_from: Number.isSafeInteger(m.free_from) && m.free_from >= 0 ? m.free_from : null, requires_address: m.requires_address === true, carrier: text(m.carrier, 80), note: text(m.note, 300) })) : [];
  const payments = Array.isArray(config.payment_methods) ? config.payment_methods.filter(p => p && ['payu', 'transfer', 'pickup'].includes(p.id)).map(p => ({ id: p.id, name: text(p.name, 80) || p.id, description: text(p.description, 200), pickup_only: p.pickup_only === true })) : [];
  const legal = config.legal && typeof config.legal === 'object' ? config.legal : {};
  const seller = config.seller && typeof config.seller === 'object' ? config.seller : {};
  const https = input => typeof input === 'string' && /^https:\/\/[^\s]{1,390}$/.test(input) ? input : '';
  return {
    loaded: true,
    checkoutEnabled: value.checkout_enabled === true && shipping.length > 0 && payments.length > 0,
    phase: value.phase === 'live' ? 'live' : 'prelaunch',
    notice: text(value.notice, 300),
    shipping, payments,
    pickupAddress: text(config.pickup_address, 350), pickupHours: text(config.pickup_hours, 200),
    invoiceEnabled: config.invoice_enabled !== false, orderNote: text(config.order_note, 400),
    legal: { terms: https(legal.terms_url), privacy: https(legal.privacy_url), returns: https(legal.returns_url), shipping: https(legal.shipping_url) },
    seller: { name: text(seller.name, 160), email: text(seller.support_email, 254), phone: text(seller.support_phone, 40) },
    pages: Array.isArray(config.pages) ? config.pages.filter(p => p && typeof p.slug === 'string' && /^[a-z0-9][a-z0-9-]{0,59}$/.test(p.slug)).map(p => ({ slug: p.slug, title: text(p.published_title || p.title, 120) || p.slug })) : [],
  };
}
export const PRELAUNCH_STATUS = Object.freeze({ loaded: false, checkoutEnabled: false, phase: 'prelaunch', notice: '', shipping: [], payments: [], pickupAddress: '', pickupHours: '', invoiceEnabled: true, orderNote: '', legal: { terms: '', privacy: '', returns: '', shipping: '' }, seller: { name: '', email: '', phone: '' }, pages: [] });
export function normalizePersonalization(value) {
  if (value == null) return undefined;
  if (!value || typeof value !== 'object') return null;
  if (value.mode === 'player' && Number.isSafeInteger(value.player_id) && value.player_id > 0) return { mode: 'player', player_id: value.player_id };
  if (value.mode !== 'custom' || typeof value.name !== 'string' || typeof value.number !== 'string') return null;
  if (/\p{C}/u.test(value.name)) return null;
  const name = value.name.trim().normalize('NFC').toUpperCase().normalize('NFC');
  const number = value.number;
  if ([...name].length < 1 || [...name].length > 20 || !/\p{L}/u.test(name) || !/^[\p{L}\p{M} .'’\-]+$/u.test(name) || !/^[0-9]{1,2}$/.test(number)) return null;
  return { mode: 'custom', name, number };
}
export function cartLineKey(line) {
  const print = normalizePersonalization(line.personalization);
  return JSON.stringify([line.id, line.size || 'UNI', print || null]);
}
export function normalizeCart(raw, products) {
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const lines = new Map();
  for (const row of parsed) {
    if (!row || typeof row !== 'object' || !Number.isSafeInteger(row.id) || row.id < 1 || !Number.isInteger(row.quantity) || row.quantity < 1) continue;
    const product = products?.find(p => p.id === row.id);
    if (products && !product) continue;
    const size = typeof row.size === 'string' ? row.size.trim().toUpperCase() || 'UNI' : 'UNI';
    if (size.length > 20 || !/^[A-Z0-9_-]+$/.test(size) || (product && !(product.sizes || ['UNI']).includes(size))) continue;
    const personalization = normalizePersonalization(row.personalization);
    if (personalization === null) continue;
    const line = { id: row.id, size, quantity: Math.min(20, row.quantity), ...(personalization ? { personalization } : {}) };
    if (personalization && row.personalization_display && typeof row.personalization_display.name === 'string' && typeof row.personalization_display.number === 'string') {
      const display = normalizePersonalization({ mode: 'custom', ...row.personalization_display });
      const fee = row.personalization_display.fee;
      if (display && (fee === undefined || Number.isSafeInteger(fee) && fee >= 0)) line.personalization_display = { name: display.name, number: display.number, ...(fee !== undefined ? { fee } : {}) };
    }
    const key = cartLineKey(line);
    const old = lines.get(key);
    lines.set(key, { ...line, quantity: Math.min(20, (old?.quantity || 0) + line.quantity) });
  }
  return [...lines.values()].slice(0, 20);
}
export function variantCartQuantity(cart, id, size) {
  return cart.filter(line => line.id === id && line.size === size).reduce((sum, line) => sum + line.quantity, 0);
}
export function lineUnitPrice(product, line) {
  return (product?.price || 0) + (line.personalization && product?.personalization_enabled ? product.personalization_fee || 0 : 0);
}
export function productDisplayPrice(product) {
  return product.price + (product.personalization_required ? product.personalization_fee || 0 : 0);
}
export function personalizationLabel(line, players = []) {
  const print = line.personalization;
  if (!print) return '';
  const player = print.mode === 'player' ? players.find(p => p.id === print.player_id) : undefined;
  const name = print.name || player?.print_name || line.personalization_display?.name;
  const number = print.number ?? player?.number ?? line.personalization_display?.number;
  return name && number != null ? `Nadruk: ${name} · ${number}` : `Nadruk zawodnika #${print.player_id}`;
}
export function extendCartLine(cart, line, products) {
  const normalized = normalizeCart([line], products)[0];
  if (!normalized || line.quantity > 20) return null;
  const product = products.find(p => p.id === normalized.id);
  if (!validProductPrint(normalized, product)) return null;
  const key = cartLineKey(normalized);
  const existing = cart.find(row => cartLineKey(row) === key);
  if ((!existing && cart.length >= 20) || (existing?.quantity || 0) + normalized.quantity > 20 || variantCartQuantity(cart, normalized.id, normalized.size) + normalized.quantity > availableQty(product, normalized.size)) return null;
  return existing ? cart.map(row => cartLineKey(row) === key ? { ...row, ...normalized, quantity: row.quantity + normalized.quantity } : row) : [...cart, normalized];
}
export function updateCartLine(cart, id, size, quantity, personalization, products) {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 20) return cart;
  const key = cartLineKey({ id, size, personalization });
  const current = cart.find(line => cartLineKey(line) === key);
  if (!current) return cart;
  if (quantity > current.quantity && products && variantCartQuantity(cart, id, size) - current.quantity + quantity > availableQty(products.find(p => p.id === id), size)) return cart;
  return cart.map(line => cartLineKey(line) === key ? { ...line, quantity } : line).filter(line => line.quantity > 0);
}
function validProductPrint(line, product) {
  if (!product) return false;
  const print = normalizePersonalization(line.personalization);
  return print !== null && (!print || product.personalization_enabled === true) && (!product.personalization_required || !!print);
}
export const DECORATION_LABELS = Object.freeze({ dtf: 'Transfer DTF', haft: 'Haft', haft_3d: 'Haft wypukły (3D)', sitodruk: 'Sitodruk', inne: 'Inna metoda' });
export function normalizePrintLayout(value) {
  if (!value || typeof value !== 'object' || !safeImageUrl(value.image, true) || !value.areas || typeof value.areas !== 'object') return null;
  const areas = {};
  for (const key of ['name', 'number']) {
    const box = value.areas[key];
    if (!box || typeof box !== 'object') continue;
    const numbers = ['x', 'y', 'w', 'h'].map(axis => Number(box[axis]));
    if (numbers.some(n => !Number.isFinite(n) || n < 0 || n > 100) || numbers[0] + numbers[2] > 100 || numbers[1] + numbers[3] > 100 || numbers[2] < 2 || numbers[3] < 1) return null;
    areas[key] = { x: numbers[0], y: numbers[1], w: numbers[2], h: numbers[3] };
  }
  if (!Object.keys(areas).length) return null;
  return { image: value.image, areas, color: typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color) ? value.color.toLowerCase() : '#ffffff', font: ['block', 'condensed', 'rounded'].includes(value.font) ? value.font : 'block', calibrated: value.calibrated === true, note: typeof value.note === 'string' ? value.note.slice(0, 200) : '' };
}
export function mergeCatalog(rows, fallback = []) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(row => row && Number.isSafeInteger(row.id) && row.id > 0).map(row => {
    const old = fallback.find(p => p.id === row.id) || {};
    const valid = Number.isSafeInteger(row.price) && row.price >= 0 && Array.isArray(row.variants);
    const rawSizes = Array.isArray(row.sizes) && row.sizes.length ? row.sizes : old.sizes || (row.variants?.length ? row.variants.map(v => v.size) : ['UNI']);
    const sizes = [...new Set(rawSizes.filter(s => typeof s === 'string' && /^[A-Z0-9_-]{1,20}$/.test(s)))];
    const variants = valid ? row.variants.filter(v => v && sizes.includes(v.size) && Number.isSafeInteger(v.stock) && v.stock >= 0) : [];
    const fallbackImage = safeImageUrl(row.image, true) ? row.image : safeImageUrl(old.image, true) ? old.image : '/assets/product-unavailable.svg';
    const images = productImages({ ...row, image: fallbackImage });
    const image = images[0]?.url || fallbackImage;
    return { ...old, ...row, name: row.name || old.name || 'Produkt', sku: row.sku || old.sku || '', category: row.category || old.category || 'Akcesoria', subtitle: typeof row.subtitle === 'string' ? row.subtitle : old.subtitle || '', image, images, gallery_revision: Number.isSafeInteger(row.gallery_revision) && row.gallery_revision >= 0 ? row.gallery_revision : 0, ...(sizes.length && !(sizes.length === 1 && sizes[0] === 'UNI') ? { sizes } : { sizes: undefined }), price: valid ? row.price : old.price || 0, variants, stock: variants.reduce((sum, v) => sum + v.stock, 0), verified: valid, personalization_enabled: row.personalization_enabled === true, personalization_required: row.personalization_enabled === true && row.personalization_required === true, personalization_fee: Number.isSafeInteger(row.personalization_fee) && row.personalization_fee >= 0 ? row.personalization_fee : 0, decoration_method: Object.hasOwn(DECORATION_LABELS, row.decoration_method) ? row.decoration_method : 'dtf', decoration_method_label: DECORATION_LABELS[Object.hasOwn(DECORATION_LABELS, row.decoration_method) ? row.decoration_method : 'dtf'], preorder: row.preorder === true, preorder_note: typeof row.preorder_note === 'string' ? row.preorder_note.slice(0, 200) : '', preorder_until: typeof row.preorder_until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.preorder_until) ? row.preorder_until : '', size_guide: typeof row.size_guide === 'string' ? row.size_guide.slice(0, 2000) : '', description: typeof row.description === 'string' ? row.description.slice(0, 4000) : '', badge: typeof row.badge === 'string' ? row.badge.slice(0, 20) : '', badge_info: row.badge_info && typeof row.badge_info === 'object' && typeof row.badge_info.code === 'string' && typeof row.badge_info.label === 'string' ? { code: row.badge_info.code.slice(0, 20), label: row.badge_info.label.slice(0, 40) } : null, release_at: typeof row.release_at === 'string' ? row.release_at.slice(0, 16) : '', release_epoch: Number.isSafeInteger(row.release_epoch) ? row.release_epoch : null, released: row.released !== false, print_layout: normalizePrintLayout(row.print_layout), price_reduction: row.price_reduction && typeof row.price_reduction === 'object' && Number.isSafeInteger(row.price_reduction.previous) && Number.isSafeInteger(row.price_reduction.lowest_30d) && valid && row.price_reduction.previous > row.price ? { previous: row.price_reduction.previous, lowest_30d: row.price_reduction.lowest_30d, since: typeof row.price_reduction.since === 'string' ? row.price_reduction.since : '' } : null };
  });
}
export function normalizeFavorites(raw, products) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? [...new Set(parsed.filter(id => Number.isInteger(id) && (!products || products.some(p => p.id === id))))] : [];
  } catch { return []; }
}
export function availableQty(product, size) {
  return product?.variants?.find(v => v.size === (size || 'UNI'))?.stock || 0;
}
export function canCheckout(cart, products, players) {
  if (!cart.length || cart.length > 20) return false;
  const quantities = new Map();
  for (const line of cart) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) return false;
    const product = products.find(p => p.id === line.id);
    if (!validProductPrint(line, product) || product.verified === false) return false;
    if (line.personalization?.mode === 'player' && players && !players.some(player => player.id === line.personalization.player_id)) return false;
    const key = line.id + '|' + line.size;
    quantities.set(key, (quantities.get(key) || 0) + line.quantity);
    if (quantities.get(key) > availableQty(product, line.size)) return false;
  }
  return true;
}
export function filterProducts(products, filters = {}) {
  const query = (filters.query || '').trim().toLocaleLowerCase('pl-PL');
  let rows = products.filter(p => {
    if (filters.category && p.category !== filters.category) return false;
    if (query && !(p.name + ' ' + p.category + ' ' + p.subtitle).toLocaleLowerCase('pl-PL').includes(query)) return false;
    if (filters.minPrice != null && productDisplayPrice(p) < filters.minPrice) return false;
    if (filters.maxPrice != null && productDisplayPrice(p) > filters.maxPrice) return false;
    if (filters.size && !(p.sizes || ['UNI']).includes(filters.size)) return false;
    if (filters.available && !(filters.size ? availableQty(p, filters.size) > 0 : p.variants?.some(v => v.stock > 0))) return false;
    return true;
  });
  if (filters.sort === 'price-asc') rows.sort((a, b) => productDisplayPrice(a) - productDisplayPrice(b));
  if (filters.sort === 'price-desc') rows.sort((a, b) => productDisplayPrice(b) - productDisplayPrice(a));
  if (filters.sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return rows;
}

export function removePurchased(cart, submitted) {
  const quantities = new Map();
  for (const line of submitted) {
    const key = cartLineKey(line);
    quantities.set(key, (quantities.get(key) || 0) + line.quantity);
  }
  return cart.map(line => ({ ...line, quantity: Math.max(0, line.quantity - (quantities.get(cartLineKey(line)) || 0)) })).filter(line => line.quantity > 0);
}
