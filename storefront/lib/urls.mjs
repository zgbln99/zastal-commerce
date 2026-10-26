export const CATEGORY_PATHS = Object.freeze({Koszulki:'koszulki',Bluzy:'bluzy',Akcesoria:'akcesoria',Dzieci:'dla-dzieci'});
export function categoryUrl(category) { return CATEGORY_PATHS[category] ? '/sklep/'+CATEGORY_PATHS[category] : '/sklep'; }
export function categoryFromPath(path) { const slug=path.split('/')[2];return Object.entries(CATEGORY_PATHS).find(([,value])=>value===slug)?.[0]||''; }
export function productUrl(product) { return '/produkt/'+(product?.slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug) ? product.slug : product.id); }
export function shopUrl(category,params=new URLSearchParams()) { const next=new URLSearchParams(params);next.delete('category');return categoryUrl(category)+(next.size?'?'+next.toString():''); }

export function storeUrl(href,products=[]) {
 if(typeof href!=='string'||!href.startsWith('/')||href.startsWith('//'))return href;
 const url=new URL(href,'https://store.invalid');
 const match=url.pathname.match(/^\/produkt\/([1-9][0-9]*)$/);
 if(match){const product=products.find(p=>p.id===Number(match[1]));if(product)return productUrl(product)+url.search+url.hash;}
 if(url.pathname==='/sklep'&&CATEGORY_PATHS[url.searchParams.get('category')])return shopUrl(url.searchParams.get('category'),url.searchParams)+url.hash;
 return href;
}
