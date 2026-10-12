import type {CartLine,Product} from '../../lib/commerce.mjs';
export type PaymentMethod='cash'|'terminal';
export type SaleDisplayLine=CartLine & {name:string;unit_price:number};
export type SaleAttempt={signature:string;key:string;payload:{items:CartLine[];payment_method:PaymentMethod;payment_confirmed:true;customer_id?:number};display?:SaleDisplayLine[]};
export function readSaleAttempt(raw:unknown):SaleAttempt|null;
export function resolveSaleAttempt(cart:CartLine[],payment:PaymentMethod,pending:SaleAttempt|null,products:Product[],key:string,customerId?:number|null):SaleAttempt|null;
export function isKnownSaleRejection(error:unknown):boolean;
