import type { Metadata } from "next";
import GiftCardClient from "./GiftCardClient";
export const metadata: Metadata = { title: "Karta podarunkowa", description: "Karta podarunkowa do oficjalnego sklepu Zastalu Zielona Góra: kup online, wyślij e-mailem, sprawdź saldo." };
export default function GiftCardPage() { return <GiftCardClient/>; }
