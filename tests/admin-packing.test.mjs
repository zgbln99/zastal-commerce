import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPackingScan, packingRequirements, resolveVariantCode} from '../storefront/app/admin/packing.mjs';

const inventory = [
  {sku:'ZS-HD-001-M', ean:'2000000001025', size:'M', name:'Bluza Zastal Logo'},
  {sku:'ZS-HD-001-L', ean:'2000000001032', size:'L', name:'Bluza Zastal Logo'},
  {sku:'ZS-AC-011-UNI', ean:'2000000011017', size:'UNI', name:'Brelok Dziczek'},
];

test('SKU, EAN and QR identify the exact variant', () => {
  assert.equal(resolveVariantCode(' zs-hd-001-m ', inventory), inventory[0]);
  assert.equal(resolveVariantCode(inventory[1].ean, inventory), inventory[1]);
  assert.equal(resolveVariantCode(`ZASTAL|${inventory[0].sku}|${inventory[0].ean}`, inventory), inventory[0]);
  assert.equal(resolveVariantCode(`ZASTAL|${inventory[0].sku}|${inventory[1].ean}`, inventory), undefined);
  assert.equal(resolveVariantCode('ZS-HD-001', inventory), undefined);
  assert.equal(resolveVariantCode('unknown', inventory), undefined);
});

test('packing merges duplicate lines and resolves legacy product SKU with its size', () => {
  const required = packingRequirements([
    {sku:'ZS-HD-001', variant_sku:'ZS-HD-001-M', size:'M', qty:2},
    {sku:'ZS-HD-001', size:'M', qty:1},
    {sku:'ZS-HD-001', size:'L', qty:1},
    {sku:'ZS-AC-011', qty:2},
  ], inventory);
  assert.deepEqual(required, {'ZS-HD-001-M':3, 'ZS-HD-001-L':1, 'ZS-AC-011-UNI':2});
});

test('each scan counts one unit, repeated required units are accepted, excess is rejected', () => {
  const required = {'ZS-HD-001-M':2};
  const first = applyPackingScan(inventory[0].ean, inventory, required, {});
  const second = applyPackingScan(inventory[0].sku, inventory, required, first.counts);
  const excess = applyPackingScan(`ZASTAL|${inventory[0].sku}|${inventory[0].ean}`, inventory, required, second.counts);
  assert.equal(first.valid, true);
  assert.deepEqual(first.counts, {'ZS-HD-001-M':1});
  assert.equal(second.valid, true);
  assert.deepEqual(second.counts, {'ZS-HD-001-M':2});
  assert.equal(excess.valid, false);
  assert.deepEqual(excess.counts, second.counts);
  assert.deepEqual(first.counts, {'ZS-HD-001-M':1});
});

test('the wrong size of the same product and unknown codes never confirm an order unit', () => {
  const required = {'ZS-HD-001-M':2};
  const previous = {'ZS-HD-001-M':1};
  for (const code of [inventory[1].sku, inventory[1].ean, 'ZS-HD-001', 'not-a-code']) {
    const result = applyPackingScan(code, inventory, required, previous);
    assert.equal(result.valid, false);
    assert.deepEqual(result.counts, previous);
  }
});
