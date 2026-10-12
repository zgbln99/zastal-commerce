export function nextSlide(index: number, step: number, count: number): number;
export function autoplayAllowed(options: { count: number; autoplay?: boolean; paused: boolean; reducedMotion: boolean; visible: boolean; hovered: boolean; focused: boolean; overlayOpen: boolean }): boolean;
export function swipeDirection(startX: number, startY: number, endX: number, endY: number): -1 | 0 | 1;

export type HeroSlide = { id:string; eyebrow:string; title:string; description:string; image:string; image_alt:string; image_role:string; image_illustrative:boolean; cta_text:string; cta_url:string; secondary_text:string; secondary_url:string; product_name:string };
export function carouselInterval(value:unknown):number;
export function carouselKeyStep(key:string,tagName:string,editable?:boolean): -1|0|1;
export function buildHeroSlides(settings?:Record<string,string|number|boolean>,products?:(import('./product-media.mjs').ImageProduct & {verified?:boolean;category?:string})[]):HeroSlide[];
