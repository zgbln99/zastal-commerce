import test from 'node:test';
import assert from 'node:assert/strict';
import {fulfillmentScanCode} from '../storefront/app/admin/fulfillment-state.mjs';
const first={variant_sku:'ZS-TS-001-M',ean:'2000000000015',qty:1,line_index:0,personalization:{name:'NOWAK',number:'00'}};
test('a scan confirms only the selected immutable personalized line even when another line shares its SKU',()=>{
  const second={...first,line_index:1,personalization:{name:'KOWALSKI',number:'9'}};
  assert.equal(fulfillmentScanCode('ZASTAL|ZS-TS-001-M|2000000000015',second,[]),second.variant_sku);
  assert.equal(second.line_index,1);
});
test('a QR with correct SKU but different EAN and a different size cannot confirm the selected line',()=>{
  assert.equal(fulfillmentScanCode('ZASTAL|ZS-TS-001-M|2000000000022',first,[]),null);
  assert.equal(fulfillmentScanCode('ZS-TS-001-L',first,[]),null);
  assert.equal(fulfillmentScanCode('ZS-TS-001',first,[]),null);
});
test('legacy lines can scan the current variant EAN without changing the immutable SKU',()=>{
  const {ean,...legacy}=first;
  assert.equal(fulfillmentScanCode(first.ean,legacy,[{sku:first.variant_sku,ean:first.ean}]),first.variant_sku);
});
