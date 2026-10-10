import type { CatalogItem } from './catalog';
import type { CartLine, Product } from './commerce.mjs';
export type CheckoutDisplayLine = CartLine & { name: string; unit_price: number };
export type CheckoutAttempt = { signature: string; key: string; payload: { items: CartLine[]; fulfillment: string; account_id?:number|null }; display?: CheckoutDisplayLine[] };
export function readCheckoutAttempt(raw: unknown, products?: CatalogItem[]): CheckoutAttempt | null;
export function resolveCheckoutAttempt(cart: CartLine[], fulfillment: string, pending: CheckoutAttempt | null, products: Product[], key: string, accountId?:number|null): CheckoutAttempt | null;
