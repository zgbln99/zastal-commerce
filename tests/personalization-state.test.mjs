import test from 'node:test';
import assert from 'node:assert/strict';
import * as commerce from '../storefront/lib/commerce.mjs';
import { readCheckoutAttempt, resolveCheckoutAttempt } from '../storefront/lib/checkout.mjs';
const products=[{id:13,name:'Koszulka meczowa',sku:'ZS-MATCH',category:'Koszulki',price:12000,sizes:['M'],variants:[{size:'M',stock:3}],personalization_enabled:true,personalization_required:false,personalization_fee:2500}];
const custom=(name='WÓJCIK',number='00')=>({mode:'custom',name,number});
const line=(print=custom(),quantity=1)=>({id:13,size:'M',quantity,personalization:print});

test('different prints survive cart normalization and equal normalized prints merge',()=>{
 const rows=commerce.normalizeCart([line(custom(' wójcik ')),line(custom()),line({mode:'player',player_id:11}),{id:13,size:'M',quantity:1}],products);
 assert.deepEqual(rows,[line(custom(),2),line({mode:'player',player_id:11}),{id:13,size:'M',quantity:1}]);
});
test('custom print validation allows Unicode and 0 or 00 while discarding invalid fields',()=>{
 for(const number of ['0','00','7','21']) assert.deepEqual(commerce.normalizeCart([line(custom('Łukasz Brkić',number))],products),[line(custom('ŁUKASZ BRKIĆ',number))]);
 for(const print of [custom('','7'),custom('TOO LONG '.repeat(4),'7'),custom('A💚','7'),custom('A','１２'),custom('A','123'),{mode:'player',player_id:0},{mode:'bad'}]) assert.deepEqual(commerce.normalizeCart([line(print)],products),[]);
});
test('checkout stock aggregates the size across prints and enforces product print requirements',()=>{
 assert.equal(commerce.canCheckout([line(custom(),2),line({mode:'player',player_id:11},2)],products),false);
 assert.equal(commerce.canCheckout([line(custom(),2),line({mode:'player',player_id:11})],products),true);
 assert.equal(commerce.canCheckout([line()],products.map(p=>({...p,personalization_enabled:false}))),false);
 assert.equal(commerce.canCheckout([{id:13,size:'M',quantity:1}],products.map(p=>({...p,personalization_required:true}))),false);
});
test('completion subtracts only the exact print purchased',()=>{
 const cart=[line(custom(),2),line({mode:'player',player_id:11}),{id:13,size:'M',quantity:1}];
 assert.deepEqual(commerce.removePurchased(cart,[line()]),[line(),cart[1],cart[2]]);
});
test('cart extension rejects aggregate overselling and keeps prints independently addressable',()=>{
 assert.equal(typeof commerce.extendCartLine,'function');
 const cart=commerce.extendCartLine([],line(custom(),2),products);
 const extended=commerce.extendCartLine(cart,line({mode:'player',player_id:11}),products);
 assert.equal(extended.length,2);
 assert.notEqual(commerce.cartLineKey(extended[0]),commerce.cartLineKey(extended[1]));
 assert.equal(commerce.extendCartLine(extended,line(custom('NOWAK','8')),products),null);
 assert.equal(commerce.lineUnitPrice(products[0],cart[0]),14500);
});
test('structural cart recovery retains API-created IDs before catalog arrives',()=>{
 assert.deepEqual(commerce.normalizeCart(JSON.stringify([line()]),undefined),[line()]);
 assert.deepEqual(commerce.normalizeCart([{id:-1,size:'M',quantity:1},{id:13,size:'M',quantity:Infinity}],undefined),[]);
});
test('catalog merges API-created product metadata with honest image fallback',()=>{
 assert.equal(typeof commerce.mergeCatalog,'function');
 const rows=commerce.mergeCatalog([{...products[0],image:'',subtitle:'Wersja meczowa'}],[{id:1,name:'Stara bluza',sku:'OLD',category:'Bluzy',price:10000,image:'/assets/photos/product-1.webp',subtitle:'Logo',sizes:['M']}]);
 assert.equal(rows[0].id,13);assert.equal(rows[0].image,'/assets/product-unavailable.svg');assert.equal(rows[0].personalization_fee,2500);assert.equal(rows[0].verified,true);
 const old=commerce.mergeCatalog([{id:1,price:9900,name:'Bluza',variants:[{size:'M',stock:1}]}],[{id:1,image:'/assets/photos/product-1.webp',sizes:['M']}]);
 assert.equal(old[0].image,'/assets/photos/product-1.webp');assert.deepEqual(old[0].sizes,['M']);
});
test('checkout strips display snapshots and freezes exact print and account during catalog changes',()=>{
 const cart=[{...line({mode:'player',player_id:11}),personalization_display:{name:'SULIMA',number:'7'}}];
 const attempt=resolveCheckoutAttempt(cart,'kurier',null,products,'personalized_checkout_1234',42);
 assert.deepEqual(attempt.payload,{items:[line({mode:'player',player_id:11})],fulfillment:'kurier',account_id:42});
 assert.deepEqual(readCheckoutAttempt(JSON.stringify(attempt)),attempt);
 assert.deepEqual(resolveCheckoutAttempt([], 'odbior',attempt,[], 'new_checkout_1234',71),attempt);
});
test('cart quantity edits target a print line and cannot increase shared stock beyond availability',()=>{
 assert.equal(typeof commerce.updateCartLine,'function');
 const cart=[line(custom(),2),line({mode:'player',player_id:11})];
 assert.deepEqual(commerce.updateCartLine(cart,13,'M',0,custom(),products),[cart[1]]);
 assert.deepEqual(commerce.updateCartLine(cart,13,'M',2,{mode:'player',player_id:11},products),cart);
 assert.deepEqual(commerce.updateCartLine(cart,13,'M',1,custom(),products),[line(custom()),cart[1]]);
});
test('custom print normalization matches server rules for real surnames and ASCII numbers',()=>{
 assert.deepEqual(commerce.normalizePersonalization(custom(' o’neill ','00')),{mode:'custom',name:'O’NEILL',number:'00'});
 assert.deepEqual(commerce.normalizePersonalization(custom('Łukasz Brkić','0')),{mode:'custom',name:'ŁUKASZ BRKIĆ',number:'0'});
 for(const print of [custom('.', '7'),custom('\u0301','7'),custom('\nNOWAK','7'),custom('NOWAK\t','7'),custom('NOWAK',' 7 ')]) assert.equal(commerce.normalizePersonalization(print),null);
});
test('saved print displays preserve the selected name number and integer fee',()=>{
 const player={...line({mode:'player',player_id:11}),personalization_display:{name:'SULIMA',number:'7',fee:2500}};
 const own={...line(),personalization_display:{name:'WÓJCIK',number:'00',fee:2500}};
 assert.deepEqual(commerce.normalizeCart([player,own]),[player,own]);
 assert.equal(commerce.personalizationLabel(player),'Nadruk: SULIMA · 7');
 const invalid={...player,personalization_display:{name:'SULIMA',number:'7',fee:2.5}};
 assert.deepEqual(commerce.normalizeCart([invalid]),[line({mode:'player',player_id:11})]);
});
test('checkout blocks a retired player without blocking a valid custom print',()=>{
 assert.equal(commerce.canCheckout([line({mode:'player',player_id:11})],products,[]),false);
 assert.equal(commerce.canCheckout([line({mode:'player',player_id:11})],products,[{id:11,name:'Krzysztof Sulima',print_name:'SULIMA',number:'7'}]),true);
 assert.equal(commerce.canCheckout([line()],products,[]),true);
});
test('saved checkout recovery is structural even if the product and roster have changed',()=>{
 const signature=JSON.stringify({items:[line({mode:'player',player_id:11})],fulfillment:'kurier',account_id:42});
 const attempt=readCheckoutAttempt({signature,key:'retained_personalized_1234'},[]);
 assert.deepEqual(attempt?.payload,{items:[line({mode:'player',player_id:11})],fulfillment:'kurier',account_id:42});
 const withDisplay={...line({mode:'player',player_id:11}),personalization_display:{name:'SULIMA',number:'7',fee:2500}};
 assert.equal(readCheckoutAttempt({signature:JSON.stringify({items:[withDisplay],fulfillment:'kurier',account_id:42}),key:'retained_personalized_1234'}),null);
});
test('checkout freezes a separate display while submitting only canonical print fields',()=>{
 const player={...line({mode:'player',player_id:11}),personalization_display:{name:'SULIMA',number:'7',fee:2500}};
 const attempt=resolveCheckoutAttempt([player],'odbior',null,products,'display_checkout_1234',42);
 assert.deepEqual(attempt.display,[{id:13,size:'M',quantity:1,name:'Koszulka meczowa',unit_price:14500,personalization:{mode:'player',player_id:11},personalization_display:{name:'SULIMA',number:'7',fee:2500}}]);
 assert.deepEqual(attempt.payload.items,[line({mode:'player',player_id:11})]);
 assert.deepEqual(readCheckoutAttempt(JSON.stringify(attempt),[]),attempt);
});
test('listing price includes a required print fee while an optional print starts at base price',()=>{
 assert.equal(typeof commerce.productDisplayPrice,'function');
 assert.equal(commerce.productDisplayPrice({...products[0],personalization_required:true}),14500);
 assert.equal(commerce.productDisplayPrice(products[0]),12000);
 assert.equal(commerce.productDisplayPrice({...products[0],personalization_required:true,personalization_fee:0}),12000);
});
test('price filters compare the minimum purchasable price including a required print',()=>{
 const rows=[{...products[0],personalization_required:true},{...products[0],id:14,price:13000,personalization_fee:4000}];
 assert.deepEqual(commerce.filterProducts(rows,{maxPrice:14000}).map(p=>p.id),[14]);
 assert.deepEqual(commerce.filterProducts(rows,{minPrice:14500,maxPrice:14500}).map(p=>p.id),[13]);
});
test('price sorting uses the same fee-inclusive minimum price displayed in listings',()=>{
 const rows=[{...products[0],personalization_required:true},{...products[0],id:14,price:13000,personalization_fee:4000}];
 assert.deepEqual(commerce.filterProducts(rows,{sort:'price-asc'}).map(p=>p.id),[14,13]);
 assert.deepEqual(commerce.filterProducts(rows,{sort:'price-desc'}).map(p=>p.id),[13,14]);
});
