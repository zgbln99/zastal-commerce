export function resolveVariantCode(text, inventory) {
  const value = text.trim();
  if (value.startsWith("ZASTAL|")) {
    const parts = value.split("|");
    return parts.length === 3 ? inventory.find(variant => variant.sku.toLowerCase() === parts[1].toLowerCase() && variant.ean === parts[2]) : undefined;
  }
  return inventory.find(variant => variant.ean === value || variant.sku.toLowerCase() === value.toLowerCase());
}

export function lineVariantSku(line, inventory) {
  if (line.variant_sku) return line.variant_sku;
  const size = line.size || "UNI";
  if (inventory.some(variant => variant.sku === line.sku && variant.size === size)) return line.sku;
  return line.sku + "-" + size;
}

export function packingRequirements(lines, inventory) {
  return lines.reduce((required, line) => {
    const sku = lineVariantSku(line, inventory);
    required[sku] = (required[sku] || 0) + line.qty;
    return required;
  }, {});
}

export function applyPackingScan(code, inventory, required, scanned) {
  const variant = resolveVariantCode(code, inventory);
  const count = variant ? required[variant.sku] : 0;
  if (!variant) return {counts:scanned, text:"Nie znaleziono tego kodu w magazynie wariantów.", valid:false};
  if (!count) return {counts:scanned, text:`${variant.name}, rozmiar ${variant.size}: ten wariant nie należy do zamówienia.`, valid:false};
  if ((scanned[variant.sku] || 0) >= count) return {counts:scanned, text:`Potwierdzono już wszystkie ${count} szt. tego wariantu.`, valid:false};
  const next = (scanned[variant.sku] || 0) + 1;
  return {counts:{...scanned, [variant.sku]:next}, text:`Potwierdzono ${variant.name}, rozmiar ${variant.size} (${next}/${count} szt.).`, valid:true};
}
