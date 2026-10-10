import test from 'node:test';
import assert from 'node:assert/strict';
import { readCheckoutAttempt, resolveCheckoutAttempt } from '../storefront/lib/checkout.mjs';

const products=[{id:1,sizes:['M'],variants:[{size:'M',stock:0}]},{id:2,variants:[{size:'UNI',stock:2}]}];
const submitted=[{id:1,size:'M',quantity:1}];
const saved={signature:JSON.stringify({items:submitted,fulfillment:'kurier'}),key:'test_checkout_key_1234'};

test('a lost successful checkout can recover the exact request after stock is exhausted or the cart changes',()=>{
 const pending=readCheckoutAttempt(JSON.stringify(saved),products);
 const request=resolveCheckoutAttempt([{id:2,size:'UNI',quantity:2}],'odbior',pending,products,'unused_new_key_1234');
 assert.deepEqual(request.payload,{items:submitted,fulfillment:'kurier'});
 assert.equal(request.key,saved.key);
 assert.deepEqual(resolveCheckoutAttempt([], 'odbior', pending, [], 'unused_new_key_1234'),null);
 assert.equal(resolveCheckoutAttempt(submitted,'kurier',null,products,'new_checkout_key_1234'),null);
});
test('saved checkout attempts reject corrupt, changed or invalid request data',()=>{
 for(const raw of ['{','null',{}, {...saved,key:'short'}, {...saved,signature:'{}'}, {...saved,signature:JSON.stringify({items:[{id:99,size:'M',quantity:1}],fulfillment:'kurier'})}, {...saved,signature:JSON.stringify({items:submitted,fulfillment:'unknown'})}]){
  assert.equal(readCheckoutAttempt(raw,products),null);
 }
});
