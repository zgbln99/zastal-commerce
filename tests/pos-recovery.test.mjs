import test from 'node:test';
import assert from 'node:assert/strict';
import {readSaleAttempt, resolveSaleAttempt, isKnownSaleRejection} from '../storefront/app/admin/pos-state.mjs';

const products = [{id:1,name:'Koszulka',price:6000,sizes:['M'],verified:true,personalization_enabled:true,variants:[{size:'M',stock:4}]}];
const cart = [{id:1,size:'M',quantity:1,personalization:{mode:'custom',name:'NOWAK',number:'00'}}];
test('an unresolved sale retries its exact original basket and payment method despite edits and sold-out catalog', () => {
  const pending = resolveSaleAttempt(cart,'cash',null,products,'pos_1234567890123456');
  const retry = resolveSaleAttempt([{id:1,size:'M',quantity:3}],'terminal',pending,[],'pos_different123456');
  assert.deepEqual(retry,pending);
  assert.equal(retry.payload.payment_method,'cash');
  assert.equal(retry.payload.items[0].quantity,1);
});
test('saved request can recover without current products or player data', () => {
  const pending = resolveSaleAttempt(cart,'terminal',null,products,'pos_1234567890123456');
  assert.deepEqual(readSaleAttempt(JSON.stringify(pending)),pending);
  assert.equal(pending.payload.items[0].personalization.number,'00');
});
test('customer association is frozen across recovery and changed customer selection',()=>{
  const original=resolveSaleAttempt(cart,'cash',null,products,'pos_customer123456789',17);
  assert.equal(original.payload.customer_id,17);
  const restored=readSaleAttempt(JSON.stringify(original));
  const retry=resolveSaleAttempt([], 'terminal',restored,[],'pos_replaced123456789',28);
  assert.deepEqual(retry,original);
  assert.equal(retry.payload.customer_id,17);
  const guest=resolveSaleAttempt(cart,'cash',null,products,'pos_guest123456789');
  assert.equal('customer_id' in guest.payload,false);
  assert.deepEqual(readSaleAttempt(JSON.stringify(guest)),guest);
});
test('invalid customer IDs cannot enter a new or restored sale identity',()=>{
  for(const customer of [0,-1,1.1,'17',false,Number.MAX_SAFE_INTEGER+1]){
    assert.equal(resolveSaleAttempt(cart,'cash',null,products,'pos_customer123456789',customer),null);
    const guest=resolveSaleAttempt(cart,'cash',null,products,'pos_guest123456789');
    assert.equal(readSaleAttempt({...guest,signature:JSON.stringify({...guest.payload,customer_id:customer})}),null);
  }
});
test('tampered sale signatures, payment confirmation and unsupported fields are rejected', () => {
  const pending = resolveSaleAttempt(cart,'cash',null,products,'pos_1234567890123456');
  for(const change of [{payment_confirmed:false},{payment_method:'card'},{card_number:'secret'}]) {
    assert.equal(readSaleAttempt({...pending,signature:JSON.stringify({...pending.payload,...change})}),null);
  }
  assert.equal(readSaleAttempt({...pending,key:'short'}),null);
});
test('network, successful malformed response, server failure and idempotency conflict keep the basket locked', () => {
  for(const status of [0,200,401,403,404,409,500,502,504]) assert.equal(isKnownSaleRejection({status}),false);
  for(const status of [400,422]) assert.equal(isKnownSaleRejection({status}),true);
  assert.equal(isKnownSaleRejection({status:409,code:'insufficient_stock'}),true);
  assert.equal(isKnownSaleRejection({status:409,code:'idempotency_conflict'}),false);
});
