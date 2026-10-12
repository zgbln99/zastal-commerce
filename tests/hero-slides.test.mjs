import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHeroSlides, carouselInterval, carouselKeyStep } from '../storefront/lib/carousel.mjs';
const settings={title:'Original cover',image:'/assets/photos/fans.webp',cta_text:'Shop',cta_url:'/sklep',secondary_text:'More',secondary_url:'/sklep?category=Koszulki'};
const products=[
 {id:1,name:'Bluza',category:'Bluzy',verified:true,image:'/assets/photos/product-1.webp'},
 {id:3,name:'Koszulka',category:'Koszulki',verified:true,images:[{id:'shirt',url:'/assets/photos/product-3.webp',role:'packshot',alt:'Koszulka z katalogu',illustrative:false,source_url:''}]},
];
test('legacy cover remains first and catalogue defaults carry truthful media metadata',()=>{
 const slides=buildHeroSlides(settings,products);
 assert.equal(slides.length,3);
 assert.equal(slides[0].title,'Original cover');
 assert.equal(slides[0].image,settings.image);
 assert.equal(slides[0].secondary_text,'More');
 assert.equal(slides[1].image,'/assets/photos/product-1.webp');
 assert.equal(slides[1].image_illustrative,true);
 assert.equal(slides[2].image_alt,'Koszulka z katalogu');
 assert.equal(slides[2].image_illustrative,false);
});
test('default collections require verified catalogue products and never invent a product image',()=>{
 assert.equal(buildHeroSlides(settings,products.map(p=>({...p,verified:false}))).length,1);
 assert.equal(buildHeroSlides(settings,[{...products[0],image:'/assets/product-unavailable.svg'}]).length,1);
});
test('optional numbered settings replace each default without replacing the original cover',()=>{
 const slides=buildHeroSlides({...settings,slide_2_title:'Owner title',slide_2_image:'/assets/photos/product-2.webp',slide_2_image_alt:'Retro bluza',slide_2_image_role:'detail',slide_2_image_illustrative:false,slide_2_cta_url:'/sklep/2',slide_3_enabled:false},products);
 assert.equal(slides.length,2); assert.equal(slides[1].id,'slide-2');
 assert.equal(slides[1].title,'Owner title'); assert.equal(slides[1].image_alt,'Retro bluza');
 assert.equal(slides[1].image_role,'detail'); assert.equal(slides[1].image_illustrative,false);
 assert.equal(slides[1].cta_url,'/sklep/2');
});
test('CMS can disable collections while the legacy first slide always stays',()=>{
 assert.equal(buildHeroSlides({...settings,slides_enabled:false},products).length,1);
 assert.equal(buildHeroSlides({...settings,slide_2_enabled:false,slide_3_enabled:false},products).length,1);
});
test('custom slides work without the catalogue and unsafe custom image or CTA is not emitted',()=>{
 const slides=buildHeroSlides({...settings,slide_2_title:'Custom',slide_2_image:'/assets/photos/product-2.webp',slide_2_image_alt:'Bluza'},[]);
 assert.equal(slides.length,2);
 assert.equal(slides[1].image_illustrative,true);
 assert.equal(buildHeroSlides({...settings,slide_2_image:'javascript:evil'},[]).length,1);
 assert.equal(buildHeroSlides({...settings,slide_2_image:'/assets/photos/product-2.webp',slide_2_cta_url:'//evil.test'},[])[1].cta_url,'/sklep?category=Bluzy');
});
test('autoplay interval is finite, bounded and defaults without coercing malformed input',()=>{
 assert.equal(carouselInterval(undefined),6000);
 assert.equal(carouselInterval(1000),3000);
 assert.equal(carouselInterval(20000),15000);
 for(const value of [NaN,Infinity,'9000',true]) assert.equal(carouselInterval(value),6000);
});
test('local keyboard ignores interactive targets and only navigates carousel arrow keys',()=>{
 assert.equal(carouselKeyStep('ArrowRight','DIV'),1); assert.equal(carouselKeyStep('ArrowLeft','SECTION'),-1);
 for(const tag of ['INPUT','TEXTAREA','SELECT','BUTTON','A']) assert.equal(carouselKeyStep('ArrowRight',tag),0);
 assert.equal(carouselKeyStep('ArrowRight','DIV',true),0); assert.equal(carouselKeyStep('ArrowDown','DIV'),0);
});
