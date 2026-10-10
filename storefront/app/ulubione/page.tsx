import type { Metadata } from "next";
import FavoritesClient from "./FavoritesClient";
export const metadata: Metadata = { title: "Ulubione" };
export default function FavoritesPage() { return <FavoritesClient/>; }
