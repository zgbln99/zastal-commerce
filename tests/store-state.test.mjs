import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCart, normalizeFavorites, normalizeStoreStatus, shippingCost, canCheckout, filterProducts } from '../storefront/lib/commerce.mjs';

const products = [
 {id:1,name:'Bluza Zastal Logo',category:'Bluzy',subtitle:'Zieleń',price:9900,sizes:['S','M'],variants:[{size:'S',stock:0},{size:'M',stock:3}]},
 {id:2,name:'Worek sportowy',category:'Akcesoria',subtitle:'Zastal',price:5000,variants:[{size:'UNI',stock:4}]},
];
test('corrupt or unrelated saved values leave an empty safe cart',()=>{
 for(const input of ['{','null','{}','[null,false,4]']) assert.deepEqual(normalizeCart(input,products),[]);
});
test('cart keeps known variants, merges duplicates and caps purchase quantities',()=>{
 const raw=JSON.stringify([{id:1,size:'M',quantity:2},{id:1,size:'M',quantity:2},{id:2,size:'',quantity:1},{id:99,size:'M',quantity:1},{id:1,size:'XS',quantity:1},{id:2,size:'',quantity:-3},{id:1,size:'S',quantity:24}]);
 assert.deepEqual(normalizeCart(raw,products),[{id:1,size:'M',quantity:4},{id:2,size:'UNI',quantity:1},{id:1,size:'S',quantity:20}]);
});
test('favorites only retain unique existing product identifiers',()=>{
 assert.deepEqual(normalizeFavorites('[1,1,2,99,"2",null]',products),[1,2]);
 assert.deepEqual(normalizeFavorites('invalid',products),[]);
});
test('shipping charges come from configured methods and the free threshold is inclusive',()=>{
 assert.equal(shippingCost({price:0,free_from:null},10000),0);
 assert.equal(shippingCost({price:1299,free_from:25000},24999),1299);
 assert.equal(shippingCost({price:1499,free_from:25000},25000),0);
 assert.equal(shippingCost({price:1499,free_from:null},99999),1499);
 assert.throws(()=>shippingCost('kurier',1000));
 assert.throws(()=>shippingCost({price:-1},1000));
});
test('store status normalizes published configuration and never enables checkout without methods',()=>{
 const status=normalizeStoreStatus({phase:'live',checkout_enabled:true,config:{shipping_methods:[{code:'kurier',name:'Kurier',kind:'courier',price:1499,free_from:null,requires_address:true},{code:'bad',kind:'x',price:1}],payment_methods:[{id:'transfer',name:'Przelew'},{id:'crypto'}],legal:{terms_url:'https://example.test/regulamin',privacy_url:'http://insecure'},pickup_address:'Hala'}});
 assert.equal(status.checkoutEnabled,true);
 assert.deepEqual(status.shipping.map(m=>m.code),['kurier']);
 assert.deepEqual(status.payments.map(p=>p.id),['transfer']);
 assert.equal(status.legal.terms,'https://example.test/regulamin');
 assert.equal(status.legal.privacy,'');
 assert.equal(normalizeStoreStatus({checkout_enabled:true,config:{shipping_methods:[],payment_methods:[]}}).checkoutEnabled,false);
 assert.equal(normalizeStoreStatus(null).phase,'prelaunch');
});
test('checkout requires authoritative availability for each selected size',()=>{
 assert.equal(canCheckout([{id:1,size:'S',quantity:1}],products),false);
 assert.equal(canCheckout([{id:1,size:'M',quantity:4}],products),false);
 assert.equal(canCheckout([{id:1,size:'M',quantity:3}],products),true);
 assert.equal(canCheckout([{id:1,size:'M',quantity:1}],[]),false);
 assert.equal(canCheckout([],products),false);
});
test('catalog combines filters and stock per selected size',()=>{
 assert.deepEqual(filterProducts(products,{query:'zieleń',category:'Bluzy',size:'S',available:true}).map(p=>p.id),[]);
 assert.deepEqual(filterProducts(products,{size:'M',available:true,maxPrice:10000}).map(p=>p.id),[1]);
 assert.deepEqual(filterProducts(products,{maxPrice:6000}).map(p=>p.id),[2]);
});
