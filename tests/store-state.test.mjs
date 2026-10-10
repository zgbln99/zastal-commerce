import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCart, normalizeFavorites, shippingCost, canCheckout, filterProducts } from '../storefront/lib/commerce.mjs';

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
test('shipping charges are integer groszy and the threshold is inclusive',()=>{
 assert.equal(shippingCost('odbior',10000),0);
 assert.equal(shippingCost('paczkomat',24999),1299);
 assert.equal(shippingCost('kurier',24999),1499);
 assert.equal(shippingCost('kurier',25000),0);
 assert.throws(()=>shippingCost('unknown',1000));
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
