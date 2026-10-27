/** Cookie consent state: what the visitor agreed to, how long the answer is valid and which measurement tools may load. */
export const CONSENT_KEY = 'zastal_consent';
export const CONSENT_VERSION = 1;
// A new answer is requested after 12 months; a visitor can change it at any time from the footer.
export const CONSENT_MAX_AGE_MS = 365 * 24 * 3600 * 1000;

/** Optional categories exist only when the seller configured a tool for them; otherwise only necessary storage is used. */
export function optionalCategories(tracking) {
  return { statistics: !!(tracking && tracking.ga4), marketing: !!(tracking && tracking.metaPixel) };
}

export function serializeConsent(choice, now = Date.now()) {
  return JSON.stringify({ v: CONSENT_VERSION, statistics: choice.statistics === true, marketing: choice.marketing === true, at: now });
}

/** Returns the stored answer or null when there is none, it is malformed, outdated or older than 12 months. */
export function parseConsent(raw, now = Date.now()) {
  if (typeof raw !== 'string' || raw.length > 200) return null;
  let value;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object' || value.v !== CONSENT_VERSION || typeof value.at !== 'number') return null;
  if (!Number.isFinite(value.at) || value.at > now + 60000 || now - value.at > CONSENT_MAX_AGE_MS) return null;
  return { statistics: value.statistics === true, marketing: value.marketing === true, at: value.at };
}

/** Tool identifiers that may be loaded right now: only configured ones and only for categories the visitor accepted. */
export function allowedTrackers(consent, tracking) {
  if (!consent || !tracking) return { ga4: '', metaPixel: '' };
  return { ga4: consent.statistics ? tracking.ga4 || '' : '', metaPixel: consent.marketing ? tracking.metaPixel || '' : '' };
}

/** Whether the visitor has to be asked (or informed) now. */
export function needsAnswer(stored) { return stored === null; }
