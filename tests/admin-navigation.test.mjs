import test from 'node:test';
import assert from 'node:assert/strict';
import {adminPath,adminView,orderInScope} from '../storefront/app/admin/navigation.mjs';
test('admin sections have stable addresses and unknown paths are rejected',()=>{
 assert.equal(adminPath('orders'),'/admin/zamowienia');
 assert.equal(adminPath('dashboard'),'/admin');
 assert.equal(adminView('/admin/produkty'),'products');
 assert.equal(adminView('/admin/nieistniejacy'),'');
});
test('work queue separates unpaid and closed orders',()=>{
 assert.equal(orderInScope({status:'oplacone',payment_status:'paid'},'active'),true);
 assert.equal(orderInScope({status:'oczekuje_platnosci',payment_status:'failed'},'payment'),true);
 assert.equal(orderInScope({status:'oczekuje_platnosci',payment_status:'failed'},'active'),false);
 assert.equal(orderInScope({status:'wyslane',payment_status:'paid'},'closed'),true);
 assert.equal(orderInScope({status:'anulowane'},'active'),false);
 assert.equal(orderInScope({status:'anulowane'},'all'),true);
});
