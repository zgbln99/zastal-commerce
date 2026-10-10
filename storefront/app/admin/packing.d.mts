export type ScannableVariant = {sku:string; ean:string; size:string; name:string};
export type PackingLine = {sku:string; variant_sku?:string; size?:string; qty:number};
export function resolveVariantCode<T extends ScannableVariant>(text:string, inventory:T[]):T | undefined;
export function lineVariantSku(line:PackingLine, inventory:ScannableVariant[]):string;
export function packingRequirements(lines:PackingLine[], inventory:ScannableVariant[]):Record<string,number>;
export function applyPackingScan(code:string, inventory:ScannableVariant[], required:Record<string,number>, scanned:Record<string,number>):{counts:Record<string,number>; text:string; valid:boolean};
