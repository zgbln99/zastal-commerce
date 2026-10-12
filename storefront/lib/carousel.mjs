import { productImages, safeImageUrl } from './product-media.mjs';
export function nextSlide(index, step, count) {
  if (count <= 1) return 0;
  return ((index + step) % count + count) % count;
}
export function autoplayAllowed({ count, autoplay = true, paused, reducedMotion, visible, hovered, focused, overlayOpen }) {
  return autoplay && count > 1 && !paused && !reducedMotion && visible && !hovered && !focused && !overlayOpen;
}
export function swipeDirection(startX, startY, endX, endY) {
  const dx = endX - startX, dy = endY - startY;
  if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return 0;
  return dx < 0 ? 1 : -1;
}

// Collections use API-verified catalogue rows and their real gallery metadata.
// An unverified placeholder never becomes a collection campaign.
const localLink = value => typeof value === 'string' && value.length < 400 && /^\/(?!\/)[a-zA-Z0-9_/\.\-?&=%#]*$/.test(value);
const read = (settings,key,fallback='') => typeof settings[key] === 'string' && settings[key].trim() ? settings[key] : fallback;
export function carouselInterval(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(3000,Math.min(15000,Math.round(value))) : 6000;
}
export function carouselKeyStep(key, tagName, editable = false) {
  if (editable || ['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(tagName)) return 0;
  return key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
}
export function buildHeroSlides(settings = {}, products = []) {
  const cover = {
    id:'slide-1', eyebrow:read(settings,'eyebrow'), title:read(settings,'title'),
    description:read(settings,'description'), image:safeImageUrl(settings.image) ? settings.image : '/assets/photos/fans.webp',
    image_alt:read(settings,'image_alt',settings.image === '/assets/photos/fans.webp' || !settings.image ? 'Kibice Zastalu Zielona Góra na trybunach' : 'Zdjęcie główne sklepu Zastal'),
    image_role:read(settings,'image_role','lifestyle'),
    image_illustrative:typeof settings.image_illustrative === 'boolean' ? settings.image_illustrative : Boolean(settings.image && settings.image !== '/assets/photos/fans.webp'),
    cta_text:read(settings,'cta_text'), cta_url:localLink(settings.cta_url) ? settings.cta_url : '/sklep',
    secondary_text:read(settings,'secondary_text'), secondary_url:localLink(settings.secondary_url) ? settings.secondary_url : '/sklep',
    product_name:'',
  };
  const slides = [cover];
  if (settings.slides_enabled === false) return slides;
  const collections = [
    {number:2,category:'Bluzy',title:'Klubowe bluzy',description:'Klasyczny znak Zastalu. Sprawdź bluzy z klubowej kolekcji.',cta:'Zobacz bluzy'},
    {number:3,category:'Koszulki',title:'Koszulki w barwach klubu',description:'Kolekcja koszulek dla kibiców. Wybierz wzór i swój rozmiar.',cta:'Zobacz koszulki'},
  ];
  for (const collection of collections) {
    const prefix = `slide_${collection.number}_`;
    if (settings[prefix+'enabled'] === false) continue;
    const product = products.find(p=>p.verified === true && p.category === collection.category && productImages(p).length);
    const media = product ? productImages(product)[0] : null;
    const customImage = read(settings,prefix+'image');
    // Reject an unsafe custom source rather than borrowing catalogue metadata for it.
    if (customImage && !safeImageUrl(customImage)) continue;
    const image = customImage || media?.url;
    if (!image) continue;
    const associatedMedia = products.filter(p=>p.verified === true).flatMap(p=>productImages(p)).find(img=>img.url === image);
    slides.push({
      id:`slide-${collection.number}`, eyebrow:read(settings,prefix+'eyebrow',`ZASTAL / ${collection.category.toUpperCase()}`),
      title:read(settings,prefix+'title',collection.title), description:read(settings,prefix+'description',collection.description),
      image, image_alt:read(settings,prefix+'image_alt',associatedMedia?.alt || collection.title),
      image_role:read(settings,prefix+'image_role',associatedMedia?.role || 'packshot'),
      image_illustrative:typeof settings[prefix+'image_illustrative'] === 'boolean' ? settings[prefix+'image_illustrative'] : associatedMedia?.illustrative !== false,
      cta_text:read(settings,prefix+'cta_text',collection.cta),
      cta_url:localLink(settings[prefix+'cta_url']) ? settings[prefix+'cta_url'] : `/sklep?category=${collection.category}`,
      secondary_text:'',secondary_url:'',product_name:customImage ? '' : product?.name || '',
    });
  }
  return slides;
}
