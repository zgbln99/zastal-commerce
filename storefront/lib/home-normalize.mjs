/** Brings numeric settings back into the range the server accepts (whole numbers inside min..max), so a stray value never blocks saving. */
export function cleanNumber(value, field) {
  const min = typeof field.min === 'number' ? field.min : 0;
  const max = typeof field.max === 'number' ? field.max : 999999;
  const parsed = typeof value === 'string' ? Number(value.replace(',', '.').trim()) : Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(parsed)) {
    return typeof field.defaultValue === 'number' ? field.defaultValue : min;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

/** `fields` maps a section type to its editable fields (EDIT_FIELDS). Returns a corrected copy and the labels of fixed settings. */
export function normalizeNumbers(config, fields) {
  const fixed = [];
  const sections = config.sections.map(section => {
    const settings = { ...section.settings };
    for (const field of fields[section.type] || []) {
      if (field.type !== 'number' || !(field.key in settings)) continue;
      const clean = cleanNumber(settings[field.key], field);
      if (clean !== settings[field.key]) { settings[field.key] = clean; fixed.push(field.label); }
    }
    return { ...section, settings };
  });
  return { config: { ...config, sections }, fixed };
}
