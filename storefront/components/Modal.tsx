"use client";
import { useEffect, useRef } from "react";
export default function Modal({ children, title, onClose, drawer = false, className = "" }: { children: React.ReactNode; title: string; onClose: () => void; drawer?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"]') || []).filter(el => el.getClientRects().length > 0);
    (ref.current?.querySelector<HTMLElement>("[data-autofocus]") || focusable()[0] || ref.current)?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const els = focusable(); const first = els[0], last = els[els.length - 1];
        if (!first) { e.preventDefault(); ref.current?.focus(); }
        else if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <div className={"modal-backdrop " + (drawer ? "is-drawer" : "")} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} className={"store-modal " + className} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>{children}</div></div>;
}
