export function fulfillmentScanCode(raw,line,inventory) {
  const sku=line.variant_sku;
  if (!sku || typeof raw !== 'string') return null;
  const value=raw.trim();
  const variant=inventory.find(item=>item.sku===sku);
  const eans=new Set([line.ean,variant?.ean].filter(Boolean));
  if (value.startsWith('ZASTAL|')) {
    const parts=value.split('|');
    return parts.length===3 && parts[1].toLowerCase()===sku.toLowerCase() && eans.has(parts[2]) ? sku : null;
  }
  return value.toLowerCase()===sku.toLowerCase() || eans.has(value) ? sku : null;
}
