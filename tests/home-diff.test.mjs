import test from 'node:test';
import assert from 'node:assert/strict';
import { diffHome, describeDiff } from '../storefront/lib/home-diff.mjs';

const names = { section: type => ({ hero: 'Baner', text: 'Tekst', products: 'Produkty' })[type] || type, field: (type, key) => ({ title: 'Nagłówek', description: 'Opis' })[key] || key };
const base = () => ({ version: 1, sections: [
  { id: 'a', type: 'hero', enabled: true, settings: { title: 'Zastal', description: 'x' } },
  { id: 'b', type: 'text', enabled: true, settings: { title: 'Klub' } },
  { id: 'c', type: 'products', enabled: true, settings: { product_ids: '1,2' } },
] });

test('identical configs have no changes', () => {
  const diff = diffHome(base(), base(), names);
  assert.equal(diff.total, 0);
  assert.deepEqual(describeDiff(diff), []);
});

test('edited fields are named per section and deduplicated', () => {
  const next = base();
  next.sections[0].settings.title = 'Nowy';
  next.sections[0].settings.description = 'y';
  const diff = diffHome(base(), next, names);
  assert.deepEqual(diff.edited, [{ id: 'a', name: 'Baner', fields: ['Nagłówek', 'Opis'] }]);
  assert.deepEqual(describeDiff(diff), ['Baner: zmieniono Nagłówek, Opis']);
});

test('added, removed, hidden sections and reordering are reported', () => {
  const next = base();
  next.sections.splice(1, 1);
  next.sections.push({ id: 'd', type: 'text', enabled: true, settings: {} });
  next.sections[0].enabled = false;
  const diff = diffHome(base(), next, names);
  assert.deepEqual(describeDiff(diff), ['Dodano sekcję: Tekst', 'Usunięto sekcję: Tekst', 'Ukryto sekcję: Baner']);
  const swapped = base();
  [swapped.sections[0], swapped.sections[2]] = [swapped.sections[2], swapped.sections[0]];
  assert.equal(diffHome(base(), swapped, names).moved, true);
});

test('adding a section at the end is not a reorder, and a missing published config counts everything as added', () => {
  const next = base();
  next.sections.push({ id: 'z', type: 'text', enabled: true, settings: {} });
  assert.equal(diffHome(base(), next, names).moved, false);
  assert.equal(diffHome(null, base(), names).added.length, 3);
});

test('a setting missing on one side equals an empty value', () => {
  const next = base();
  next.sections[1].settings.cta_text = '';
  assert.equal(diffHome(base(), next, names).total, 0);
});
