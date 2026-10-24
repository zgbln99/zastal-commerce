import type { Metadata } from "next";
import PlayersClient from "./PlayersClient";
import "./players.css";
export const metadata: Metadata = { title: "Zawodnicy", description: "Kadra Zastalu Zielona Góra: wybierz zawodnika, a jego nazwisko i numer trafią na koszulkę." };
export default function PlayersPage() { return <PlayersClient/>; }
