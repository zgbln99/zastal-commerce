export const CATEGORY_PATHS: Readonly<Record<string,string>>;
export function categoryUrl(category:string):string;
export function categoryFromPath(path:string):string;
export function productUrl(product:{id:number;slug?:string}):string;
export function shopUrl(category:string,params?:URLSearchParams):string;
export function storeUrl(href:string,products?:{id:number;slug?:string}[]):string;
