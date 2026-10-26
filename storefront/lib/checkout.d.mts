import type { CatalogItem } from './catalog';
import type { CartLine, Product } from './commerce.mjs';
export type CheckoutDisplayLine = CartLine & { name: string; unit_price: number };
export type CheckoutAddress = { line1: string; line2: string; postal_code: string; city: string; country: string };
export type CheckoutDetails = { customer: { email: string; name: string; phone: string }; shipping: { method: string; address: CheckoutAddress; locker_code: string }; payment: 'payu' | 'transfer' | 'pickup'; invoice: { requested: false } | { requested: true; company: string; tax_id: string; address: string }; consents: { terms: boolean; privacy: boolean; marketing: boolean } };
export type CheckoutAttempt = { signature: string; key: string; payload: { items: CartLine[]; fulfillment: string; account_id?:number|null } & Partial<CheckoutDetails>; display?: CheckoutDisplayLine[] };
export function readCheckoutAttempt(raw: unknown, products?: CatalogItem[]): CheckoutAttempt | null;
export function normalizeCheckoutDetails(payload: Record<string, unknown>): CheckoutDetails | Record<string, never> | null;
export function resolveCheckoutAttempt(cart: CartLine[], fulfillment: string, pending: CheckoutAttempt | null, products: Product[], key: string, accountId?:number|null, details?: Omit<CheckoutDetails, 'shipping'> & { shipping: Omit<CheckoutDetails['shipping'], 'method'> & { method?: string } } | null): CheckoutAttempt | null;
