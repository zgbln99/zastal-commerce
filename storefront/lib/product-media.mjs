const ROLES = new Set(['packshot', 'model', 'detail', 'lifestyle']);
export function safeImageUrl(value, legacy = false) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\p{C}\\]/u.test(value)) return false;
  if (legacy) {
    try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) return true; } catch {}
  }
  if (value.includes('%') || /(?:^|\/)\.\.?(?:\/|$)/.test(value)) return false;
  if (/^\/assets\/[A-Za-z0-9_./-]+$/.test(value) && value.slice(8).split('/').every(part => part && part !== '.' && part !== '..')) return true;
  return /^\/api\/store\/media\/[a-f0-9]{32}\.webp$/.test(value);
}
const plain = (value, limit) => typeof value === 'string' && value.length <= limit && !/[<>\p{C}]/u.test(value);
export function normalizeImages(raw) {
  if (!Array.isArray(raw)) return [];
  const ids = new Set(), urls = new Set(), result = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object' || !/^[A-Za-z0-9_-]{1,80}$/.test(row.id || '') || typeof row.id !== 'string' || !ROLES.has(row.role) || !safeImageUrl(row.url, row.id.startsWith('legacy-')) || ids.has(row.id) || urls.has(row.url) || !plain(row.alt,250)) continue;
    let source = '';
    if (plain(row.source_url,400) && row.source_url) { try { const u=new URL(row.source_url); if(u.protocol==='https:'&&!u.username&&!u.password)source=row.source_url; } catch {} }
    result.push({ id: row.id, url: row.url, role: row.role, alt: row.alt, illustrative: row.illustrative !== false, source_url: source });
    ids.add(row.id); urls.add(row.url);
    if (result.length === 20) break;
  }
  return result;
}
export function productImages(product) {
  const images = normalizeImages(product?.images);
  if (images.length) return images;
  if (!safeImageUrl(product?.image,true) || product.image === '/assets/product-unavailable.svg') return [];
  return [{id:`legacy-${product.id || 'image'}`,url:product.image,role:'packshot',alt:typeof product.name==='string'?product.name:'Produkt',illustrative:true,source_url:''}];
}
export function secondaryImage(raw) {
  const images = normalizeImages(raw), others = images.slice(1);
  return others.find(img => !img.illustrative && (img.role === 'model' || img.role === 'lifestyle')) || others[0] || null;
}
export function galleryIndex(index, step, count) {
  if (!Number.isInteger(count) || count < 1) return 0;
  return (((Number.isInteger(index)?index:0)+(Number.isInteger(step)?step:0))%count+count)%count;
}
export function swipeIndex(index,count,dx,dy) {
  if (!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)<45||Math.abs(dx)<Math.abs(dy)*1.5) return index;
  return galleryIndex(index,dx<0?1:-1,count);
}
export function campaignReady(settings, products) {
  if (!settings || !safeImageUrl(settings.image) || !plain(settings.image_alt,250) || !settings.image_alt.trim() || !['model','lifestyle'].includes(settings.image_role) || typeof settings.image_illustrative !== 'boolean' || typeof settings.product_ids !== 'string') return false;
  const ids=settings.product_ids.split(',').map(x=>x.trim());
  return ids.length>0 && ids.every(x=>/^[1-9]\d*$/.test(x) && Number.isSafeInteger(Number(x)) && products.some(p=>p.id===Number(x)));
}
export async function uploadBatch(files, upload, progress = () => {}) {
  const uploaded=[],failed=[];
  for (const file of files) {
    try { uploaded.push({file,url:await upload(file)}); } catch (error) { failed.push({file,error:error instanceof Error?error.message:'Przesyłanie nie powiodło się'}); }
    progress({done:uploaded.length+failed.length,total:files.length});
  }
  return {uploaded,failed};
}
export function persistGallery(productId,images,revision,request) {
  return request(`/api/admin/products/${productId}/gallery`, {method:'PATCH',body:JSON.stringify({images,expected_revision:revision})});
}
export async function createProductWithGallery(payload,images,request) {
  const product=await request('/api/admin/products',{method:'POST',body:JSON.stringify(payload)});
  if(images===null)return {product,gallery:null,galleryError:null};
  try { return {product,gallery:await persistGallery(product.id,images,0,request),galleryError:null}; }
  catch(galleryError) { return {product,gallery:null,galleryError}; }
}
