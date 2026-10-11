import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeImages, productImages, secondaryImage, galleryIndex, swipeIndex, campaignReady, uploadBatch} from '../storefront/lib/product-media.mjs';
import {mergeCatalog} from '../storefront/lib/commerce.mjs';
const photo=(id,role='packshot',illustrative=true)=>({id,url:`/assets/${id}.webp`,role,alt:`Opis ${id}`,illustrative,source_url:'https://example.com/source'});
test('API-created products retain ordered gallery and cover without static catalog entry',()=>{
 const images=[photo('new'),photo('model','model',false)];
 const [product]=mergeCatalog([{id:80,name:'Nowy produkt',price:6500,variants:[{size:'UNI',stock:2}],images,gallery_revision:3}]);
 assert.equal(product.image,images[0].url);assert.deepEqual(product.images,images);assert.equal(product.gallery_revision,3);
});
test('legacy image and old static catalog fallback remain illustrative',()=>{
 assert.equal(productImages({id:4,name:'Stary',image:'https://example.com/old.jpg'})[0].illustrative,true);
 const [p]=mergeCatalog([{id:4,price:500,variants:[],images:[]}],[{id:4,name:'Stary',image:'/assets/static.webp'}]);
 assert.equal(productImages(p)[0].url,'/assets/static.webp');assert.equal(productImages(p)[0].illustrative,true);
});
test('explicit truth labels survive normalization without filename or role inference',()=>{
 const images=normalizeImages([photo('real-model','model',true),photo('mockup','detail',false)]);
 assert.equal(images[0].illustrative,true);assert.equal(images[1].illustrative,false);assert.equal(images[0].source_url,'https://example.com/source');
});
test('secondary prefers actual model/lifestyle distinct from authoritative cover',()=>{
 const images=[photo('cover'),photo('mock-model','model'),photo('detail','detail',false),photo('real','lifestyle',false),photo('real','lifestyle',false)];
 assert.equal(secondaryImage(images).id,'real');assert.equal(secondaryImage([images[0]]),null);
 assert.equal(secondaryImage(images.slice(0,3)).id,'mock-model');
});
test('malformed values are ignored and unknown truth defaults to illustrative',()=>{
 assert.deepEqual(normalizeImages(null),[]);
 const images=normalizeImages([null,{},photo('good'),photo('good'),{...photo('bad'),url:'javascript:alert(1)'},{...photo('role'),role:'wrong'},{...photo('unknown'),illustrative:undefined}]);
 assert.deepEqual(images.map(x=>x.id),['good','unknown']);assert.equal(images[1].illustrative,true);
 assert.deepEqual(productImages({image:'javascript:alert(1)'}),[]);
});
test('navigation preserves order and wraps both boundaries including empty gallery',()=>{
 assert.deepEqual(normalizeImages([photo('b'),photo('a')]).map(x=>x.id),['b','a']);
 assert.equal(galleryIndex(0,-1,3),2);assert.equal(galleryIndex(2,1,3),0);assert.equal(galleryIndex(2,1,0),0);
});
test('swipe ignores small, vertical and diagonal gestures and wraps horizontal',()=>{
 assert.equal(swipeIndex(0,3,-20,1),0);assert.equal(swipeIndex(0,3,-70,80),0);assert.equal(swipeIndex(0,3,-70,50),0);
 assert.equal(swipeIndex(2,3,-70,10),0);assert.equal(swipeIndex(0,3,70,10),2);
});
test('campaign requires complete image metadata and existing product references',()=>{
 const settings={image:'/assets/real.webp',image_alt:'Ten sam produkt',image_role:'model',image_illustrative:false,product_ids:'2,3'};
 assert.equal(campaignReady(settings,[{id:2},{id:3}]),true);
 for(const change of [{image:''},{image_alt:''},{product_ids:'2,99'},{product_ids:'2,x'},{image_role:'packshot'},{image_illustrative:'false'}])assert.equal(campaignReady({...settings,...change},[{id:2},{id:3}]),false);
});
test('batch upload continues after a file failure and retry only uploads the failed file',async()=>{
 const seen=[],progress=[];const files=[{name:'a'},{name:'b'},{name:'c'}];
 const result=await uploadBatch(files,async f=>{seen.push(f.name);if(f.name==='b')throw Error('Za duży');return '/assets/'+f.name;},p=>progress.push(p));
 assert.deepEqual(result.uploaded.map(x=>x.url),['/assets/a','/assets/c']);assert.equal(result.failed[0].error,'Za duży');assert.deepEqual(progress,[{done:1,total:3},{done:2,total:3},{done:3,total:3}]);
 const retry=await uploadBatch(result.failed.map(x=>x.file),async f=>'/assets/'+f.name);
 assert.deepEqual(retry.uploaded.map(x=>x.url),['/assets/b']);assert.equal(retry.failed.length,0);assert.deepEqual(seen,['a','b','c']);
});
test('creation retains the created product when gallery write fails and retry targets only its gallery',async()=>{
 const {createProductWithGallery,persistGallery}=await import('../storefront/lib/product-media.mjs');
 assert.equal(typeof createProductWithGallery,'function');assert.equal(typeof persistGallery,'function');
 const calls=[],error=Object.assign(Error('Konflikt galerii'),{status:409}),images=[photo('one')];
 const request=async(path,options)=>{calls.push({path,...JSON.parse(options.body)});if(path==='/api/admin/products')return {id:81,name:'Nowy'};throw error;};
 const result=await createProductWithGallery({name:'Nowy'},images,request);
 assert.equal(result.product.id,81);assert.equal(result.galleryError,error);assert.deepEqual(images,[photo('one')]);
 assert.deepEqual(calls,[{path:'/api/admin/products',name:'Nowy'},{path:'/api/admin/products/81/gallery',images,expected_revision:0}]);
 const retried=await persistGallery(81,images,4,async(path,options)=>{calls.push({path,...JSON.parse(options.body)});return {images,revision:5};});
 assert.equal(retried.revision,5);assert.equal(calls.filter(call=>call.path==='/api/admin/products').length,1);assert.equal(calls[2].expected_revision,4);
});
test('failed product creation never attempts a gallery write',async()=>{
 const {createProductWithGallery}=await import('../storefront/lib/product-media.mjs');
 assert.equal(typeof createProductWithGallery,'function');
 const calls=[];await assert.rejects(createProductWithGallery({},[photo('one')],async path=>{calls.push(path);throw Error('SKU zajęte');}),/SKU zajęte/);
 assert.deepEqual(calls,['/api/admin/products']);
});
test('safe legacy HTTPS images retain encoded paths and query parameters',()=>{
 const url='https://example.com/photos/green%20shirt.jpg?version=2#image';
 assert.equal(productImages({id:4,name:'Stary',image:url})[0]?.url,url);
 assert.equal(normalizeImages([{...photo('legacy-4'),url}])[0]?.url,url);
 assert.deepEqual(normalizeImages([{...photo('nonlegacy'),url}]),[]);
 assert.deepEqual(productImages({id:4,image:'https://user:secret@example.com/image.jpg'}),[]);
 assert.deepEqual(productImages({id:4,image:'/assets/../image.webp'}),[]);
});
