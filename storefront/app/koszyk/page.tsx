import type { Metadata } from "next";
import CartPage from "./CartPage";

export const metadata: Metadata = { title: "Koszyk", description: "Produkty w koszyku sklepu Zastalu Zielona Góra.", robots: { index: false, follow: true } };

export default function Cart() { return <CartPage/>; }
