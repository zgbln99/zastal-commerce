import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanNumber, normalizeNumbers } from '../storefront/lib/home-normalize.mjs';

const height = { key: 'height', label: 'Wysokość banera (px)', type: 'number', min: 400, max: 850 };
const interval = { key: 'interval_ms', label: 'Czas slajdu', type: 'number', min: 3000, max: 15000, defaultValue: 6000 };

test('numbers are rounded to whole values inside the range', () => {
  assert.equal(cleanNumber(620, height), 620);
  assert.equal(cleanNumber(620.6, height), 621);
  assert.equal(cleanNumber('700,4', height), 700);
  assert.equal(cleanNumber(10, height), 400);
  assert.equal(cleanNumber(99999, height), 850);
});

test('empty, null and non-numeric values fall back to the default or the minimum', () => {
  for (const bad of [null, undefined, '', 'abc', NaN, Infinity]) {
    assert.equal(cleanNumber(bad, height), 400);
    assert.equal(cleanNumber(bad, interval), 6000);
  }
});

test('only out-of-range or non-integer settings are changed, and they are reported by label', () => {
  const config = { version: 1, sections: [{ id: 'hero-main', type: 'hero', enabled: true, settings: { title: 'x', height: 620, interval_ms: 6000.5, overlay: 'zzz' } }] };
  const fields = { hero: [height, interval, { key: 'overlay', label: 'Przyciemnienie', type: 'number', min: 0, max: 95 }] };
  const { config: next, fixed } = normalizeNumbers(config, fields);
  assert.deepEqual(next.sections[0].settings, { title: 'x', height: 620, interval_ms: 6001, overlay: 0 });
  assert.deepEqual(fixed, ['Czas slajdu', 'Przyciemnienie']);
  assert.equal(config.sections[0].settings.interval_ms, 6000.5);
  assert.deepEqual(normalizeNumbers(next, fields).fixed, []);
});
