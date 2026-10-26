import test from 'node:test';
import assert from 'node:assert/strict';
import {productUrl,categoryUrl,categoryFromPath,shopUrl} from '../storefront/lib/urls.mjs';
test('product and category URLs are readable and encoded safely',()=>{
 assert.equal(productUrl({id:1,slug:'bluza-zastal-logo'}),'/produkt/bluza-zastal-logo');
 assert.equal(productUrl({id:1}),'/produkt/1');
 assert.equal(categoryUrl('Dzieci'),'/sklep/dla-dzieci');
 assert.equal(categoryFromPath('/sklep/bluzy'),'Bluzy');
 assert.equal(categoryFromPath('/sklep/unknown'),'');
});
test('filters retain category path and preserve other query values',()=>{
 assert.equal(shopUrl('Bluzy',new URLSearchParams('size=L&category=Bluzy&q=logo')),'/sklep/bluzy?size=L&q=logo');
 assert.equal(shopUrl('',new URLSearchParams('sort=price-asc')),'/sklep?sort=price-asc');
});
