const METHODS = { odbior: 0, paczkomat: 1299, kurier: 1499 };
export const FREE_SHIPPING = 25000;
export function shippingCost(method, subtotal) {
  if (!Object.hasOwn(METHODS, method)) throw new Error('Nieprawidłowa metoda dostawy');
  return subtotal >= FREE_SHIPPING ? 0 : METHODS[method];
}
export function normalizeCart(raw, products) {
  let parsed;
  try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const lines = new Map();
  for (const row of parsed) {
    if (!row || typeof row !== 'object' || !Number.isInteger(row.id) || !Number.isInteger(row.quantity) || row.quantity < 1) continue;
    const product = products.find(p => p.id === row.id);
    if (!product) continue;
    const size = typeof row.size === 'string' ? row.size.trim().toUpperCase() || 'UNI' : 'UNI';
    if (!(product.sizes || ['UNI']).includes(size)) continue;
    const key = row.id + '|' + size;
    const old = lines.get(key);
    lines.set(key, { id: row.id, size, quantity: Math.min(20, (old?.quantity || 0) + row.quantity) });
  }
  return [...lines.values()].slice(0, 20);
}
export function normalizeFavorites(raw, products) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? [...new Set(parsed.filter(id => Number.isInteger(id) && products.some(p => p.id === id)))] : [];
  } catch { return []; }
}
export function availableQty(product, size) {
  return product?.variants?.find(v => v.size === (size || 'UNI'))?.stock || 0;
}
export function canCheckout(cart, products) {
  if (!cart.length) return false;
  const quantities = new Map();
  for (const line of cart) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) return false;
    const key = line.id + '|' + line.size;
    quantities.set(key, (quantities.get(key) || 0) + line.quantity);
    if (quantities.get(key) > availableQty(products.find(p => p.id === line.id), line.size)) return false;
  }
  return true;
}
export function filterProducts(products, filters = {}) {
  const query = (filters.query || '').trim().toLocaleLowerCase('pl-PL');
  let rows = products.filter(p => {
    if (filters.category && p.category !== filters.category) return false;
    if (query && !(p.name + ' ' + p.category + ' ' + p.subtitle).toLocaleLowerCase('pl-PL').includes(query)) return false;
    if (filters.minPrice != null && p.price < filters.minPrice) return false;
    if (filters.maxPrice != null && p.price > filters.maxPrice) return false;
    if (filters.size && !(p.sizes || ['UNI']).includes(filters.size)) return false;
    if (filters.available && !(filters.size ? availableQty(p, filters.size) > 0 : p.variants?.some(v => v.stock > 0))) return false;
    return true;
  });
  if (filters.sort === 'price-asc') rows.sort((a, b) => a.price - b.price);
  if (filters.sort === 'price-desc') rows.sort((a, b) => b.price - a.price);
  if (filters.sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return rows;
}

export function removePurchased(cart, submitted) {
  const quantities = new Map();
  for (const line of submitted) {
    const key = line.id + '|' + line.size;
    quantities.set(key, (quantities.get(key) || 0) + line.quantity);
  }
  return cart.map(line => ({ ...line, quantity: Math.max(0, line.quantity - (quantities.get(line.id + '|' + line.size) || 0)) })).filter(line => line.quantity > 0);
}
