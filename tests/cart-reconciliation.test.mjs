import test from 'node:test';
import assert from 'node:assert/strict';
import { removePurchased } from '../storefront/lib/commerce.mjs';

test('completion removes submitted quantities and preserves additions made while checkout was pending',()=>{
 const current=[{id:1,size:'M',quantity:3},{id:1,size:'S',quantity:1},{id:2,size:'UNI',quantity:2}];
 const submitted=[{id:1,size:'M',quantity:2}];
 assert.deepEqual(removePurchased(current,submitted),[{id:1,size:'M',quantity:1},{id:1,size:'S',quantity:1},{id:2,size:'UNI',quantity:2}]);
 assert.deepEqual(current,[{id:1,size:'M',quantity:3},{id:1,size:'S',quantity:1},{id:2,size:'UNI',quantity:2}]);
});
test('completion tolerates items removed or reduced in another tab without negative quantities',()=>{
 assert.deepEqual(removePurchased([{id:1,size:'M',quantity:1},{id:2,size:'UNI',quantity:1}],[{id:1,size:'M',quantity:2},{id:3,size:'UNI',quantity:1}]),[{id:2,size:'UNI',quantity:1}]);
});
