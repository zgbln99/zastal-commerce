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
 assert.deepEqual(resolveCheckoutAttempt([], 'odbior', pending, [], 'unused_new_key_1234'),pending);
 assert.equal(resolveCheckoutAttempt(submitted,'kurier',null,products,'new_checkout_key_1234'),null);
});
test('saved checkout attempts reject corrupt, changed or invalid request data',()=>{
 for(const raw of ['{','null',{}, {...saved,key:'short'}, {...saved,signature:'{}'}, {...saved,signature:JSON.stringify({items:[{id:-1,size:'M',quantity:1}],fulfillment:'kurier'})}, {...saved,signature:JSON.stringify({items:submitted,fulfillment:'Unknown Method!'})}]){
  assert.equal(readCheckoutAttempt(raw,products),null);
 }
});
test('pending checkout retains the original account even when another account or guest resumes',()=>{
 const live=[{id:2,variants:[{size:'UNI',stock:2}],verified:true}];
 const attempt=resolveCheckoutAttempt([{id:2,size:'UNI',quantity:1}],'odbior',null,live,'customer_checkout_key_1234',42);
 assert.equal(attempt.payload.account_id,42);
 const resumed=resolveCheckoutAttempt([{id:2,size:'UNI',quantity:2}],'kurier',attempt,live,'different_checkout_key_1234',71);
 assert.deepEqual(resumed,attempt);
 assert.equal(readCheckoutAttempt(JSON.stringify(attempt),live).payload.account_id,42);
 assert.equal(readCheckoutAttempt({...attempt,signature:JSON.stringify({...attempt.payload,account_id:true})},live),null);
 assert.equal(readCheckoutAttempt(saved,products).payload.account_id,undefined);
});

test('live checkout details are retained inside the attempt and must match the recovered signature',()=>{
 const details={customer:{email:'kibic@example.test',name:'Jan Kibic',phone:''},shipping:{address:{line1:'ul. Zielona 5',line2:'',postal_code:'65-001',city:'Zielona Góra',country:'PL'},locker_code:''},payment:'transfer',invoice:{requested:false},consents:{terms:true,privacy:true,marketing:false}};
 const live=[{id:2,name:'Worek',price:5000,variants:[{size:'UNI',stock:2}],verified:true}];
 const cart=[{id:2,size:'UNI',quantity:1}];
 const attempt=resolveCheckoutAttempt(cart,'kurier',null,live,'live_checkout_key_1234',null,details);
 assert.equal(attempt.payload.payment,'transfer');
 assert.equal(attempt.payload.shipping.method,'kurier');
 assert.equal(attempt.payload.customer.email,'kibic@example.test');
 assert.deepEqual(readCheckoutAttempt(JSON.stringify(attempt)).payload,attempt.payload);
 const tampered={...attempt,signature:attempt.signature.replace('transfer','payu')};
 assert.equal(readCheckoutAttempt(tampered)?.payload.payment,'payu');
 assert.equal(resolveCheckoutAttempt(cart,'kurier',null,live,'bad_checkout_key_12345',null,{...details,payment:'crypto'}),null);
 assert.equal(resolveCheckoutAttempt(cart,'kurier',null,live,'bad_checkout_key_12345',null,{...details,customer:{email:'a\u0000b',name:'',phone:''}}),null);
});
