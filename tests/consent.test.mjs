import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedTrackers, optionalCategories, parseConsent, serializeConsent, CONSENT_MAX_AGE_MS } from '../storefront/lib/consent.mjs';

const tracking = { ga4: 'G-ABC123XYZ', metaPixel: '123456789012' };

test('a stored answer round-trips and keeps only booleans', () => {
  const raw = serializeConsent({ statistics: true, marketing: false }, 1000);
  assert.deepEqual(parseConsent(raw, 2000), { statistics: true, marketing: false, at: 1000 });
  assert.deepEqual(parseConsent(JSON.stringify({ v: 1, statistics: 'yes', marketing: 1, at: 1000 }), 2000), { statistics: false, marketing: false, at: 1000 });
});

test('missing, malformed, outdated, future or expired answers ask again', () => {
  const now = 10 * CONSENT_MAX_AGE_MS;
  for (const raw of [null, undefined, '', '{', '[]', 'null', JSON.stringify({ v: 2, at: now }), JSON.stringify({ v: 1 }), JSON.stringify({ v: 1, at: now + 3600000 }), JSON.stringify({ v: 1, at: now - CONSENT_MAX_AGE_MS - 1 }), 'x'.repeat(300)])
    assert.equal(parseConsent(raw, now), null);
  assert.notEqual(parseConsent(JSON.stringify({ v: 1, at: now - CONSENT_MAX_AGE_MS + 1000 }), now), null);
});

test('tools load only for accepted categories and only when configured', () => {
  assert.deepEqual(allowedTrackers(null, tracking), { ga4: '', metaPixel: '' });
  assert.deepEqual(allowedTrackers({ statistics: false, marketing: false, at: 1 }, tracking), { ga4: '', metaPixel: '' });
  assert.deepEqual(allowedTrackers({ statistics: true, marketing: false, at: 1 }, tracking), { ga4: 'G-ABC123XYZ', metaPixel: '' });
  assert.deepEqual(allowedTrackers({ statistics: true, marketing: true, at: 1 }, { ga4: '', metaPixel: '' }), { ga4: '', metaPixel: '' });
});

test('optional categories appear only with a configured tool', () => {
  assert.deepEqual(optionalCategories({ ga4: '', metaPixel: '' }), { statistics: false, marketing: false });
  assert.deepEqual(optionalCategories(tracking), { statistics: true, marketing: true });
  assert.deepEqual(optionalCategories(undefined), { statistics: false, marketing: false });
});
