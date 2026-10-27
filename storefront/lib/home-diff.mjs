/** Compares two home page configs and describes the change in terms an editor understands (publish dialog). */
export function diffHome(before, after, names = {}) {
  const sectionName = type => (names.section ? names.section(type) : type) || type;
  const fieldName = (type, key) => (names.field ? names.field(type, key) : key) || key;
  const was = new Map((before?.sections || []).map(section => [section.id, section]));
  const now = new Map((after?.sections || []).map(section => [section.id, section]));
  const added = [], removed = [], toggled = [], edited = [];
  for (const section of now.values()) if (!was.has(section.id)) added.push({ id: section.id, name: sectionName(section.type) });
  for (const section of was.values()) if (!now.has(section.id)) removed.push({ id: section.id, name: sectionName(section.type) });
  for (const section of now.values()) {
    const old = was.get(section.id);
    if (!old) continue;
    if (old.enabled !== section.enabled) toggled.push({ id: section.id, name: sectionName(section.type), enabled: section.enabled });
    const keys = [...new Set([...Object.keys(old.settings || {}), ...Object.keys(section.settings || {})])];
    const fields = keys.filter(key => JSON.stringify(old.settings?.[key] ?? "") !== JSON.stringify(section.settings?.[key] ?? "")).map(key => fieldName(section.type, key));
    if (fields.length) edited.push({ id: section.id, name: sectionName(section.type), fields: [...new Set(fields)] });
  }
  const kept = (after?.sections || []).filter(section => was.has(section.id)).map(section => section.id);
  const order = (before?.sections || []).filter(section => now.has(section.id)).map(section => section.id);
  const moved = kept.join("|") !== order.join("|");
  const total = added.length + removed.length + toggled.length + edited.length + (moved ? 1 : 0);
  return { added, removed, toggled, edited, moved, total };
}

/** One readable sentence per change, in the order an editor expects them. */
export function describeDiff(diff) {
  const lines = [];
  for (const item of diff.added) lines.push(`Dodano sekcję: ${item.name}`);
  for (const item of diff.removed) lines.push(`Usunięto sekcję: ${item.name}`);
  for (const item of diff.toggled) lines.push(`${item.enabled ? "Pokazano" : "Ukryto"} sekcję: ${item.name}`);
  if (diff.moved) lines.push("Zmieniono kolejność sekcji");
  for (const item of diff.edited) lines.push(`${item.name}: zmieniono ${item.fields.join(", ")}`);
  return lines;
}
