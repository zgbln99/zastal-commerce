import type { CatalogItem } from './catalog';
import type { CartLine, Product } from './commerce.mjs';
export type CheckoutAttempt = { signature: string; key: string; payload: { items: CartLine[]; fulfillment: string } };
export function readCheckoutAttempt(raw: unknown, products: CatalogItem[]): CheckoutAttempt | null;
export function resolveCheckoutAttempt(cart: CartLine[], fulfillment: string, pending: CheckoutAttempt | null, products: Product[], key: string): CheckoutAttempt | null;
