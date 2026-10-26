"use client";
import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { useStore } from "./StoreProvider";
const pad = (n: number) => String(n).padStart(2, "0");
function remaining(epoch: number) {
  const seconds = Math.max(0, epoch - Math.floor(Date.now() / 1000));
  const days = Math.floor(seconds / 86400), hours = Math.floor((seconds % 86400) / 3600), minutes = Math.floor((seconds % 3600) / 60);
  return { seconds, text: days > 0 ? `${days} ${days === 1 ? "dzień" : "dni"} ${pad(hours)} godz. ${pad(minutes)} min` : `${pad(hours)} godz. ${pad(minutes)} min` };
}
/** Drop timer for products with a release date; refreshes the catalogue when the moment comes. */
export default function ReleaseCountdown({ epoch, label }: { epoch: number | null | undefined; label?: string }) {
  const store = useStore();
  const [state, setState] = useState(() => epoch ? remaining(epoch) : null);
  useEffect(() => {
    if (!epoch) return;
    const tick = () => { const next = remaining(epoch); setState(next); if (next.seconds === 0) void store.refresh(); };
    tick();
    const timer = window.setInterval(tick, 30000);
    return () => window.clearInterval(timer);
  }, [epoch, store]);
  if (!epoch || !state) return null;
  return <div className="release-countdown" role="status"><CalendarClock size={18}/><div><strong>{label || "Premiera wkrótce"}</strong><span>{state.seconds > 0 ? `Sprzedaż online rusza za ${state.text}` : "Odświeżamy dostępność…"}</span></div></div>;
}
