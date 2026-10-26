"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
/**
 * Camera barcode scanner for staff screens: EAN-13/EAN-8/Code 128 and QR.
 * Uses the browser's BarcodeDetector when present (Chrome, Android) and falls back to
 * the bundled ZXing decoder (iPhone Safari, desktop browsers). Nothing leaves the device.
 */
type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
declare global { interface Window { BarcodeDetector?: new (options?: { formats: string[] }) => Detector } }
export default function BarcodeScanner({ onScan, onClose, hint = "Nakieruj aparat na kod EAN lub QR" }: { onScan: (code: string) => void; onClose: () => void; hint?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const handler = useRef(onScan);
  handler.current = onScan;
  const [error, setError] = useState("");
  const [engine, setEngine] = useState("");
  useEffect(() => {
    let stopped = false, stream: MediaStream | null = null, timer = 0, controls: { stop(): void } | null = null;
    const seen = { code: "", at: 0 };
    const report = (code: string) => {
      const now = Date.now();
      if (!code || (code === seen.code && now - seen.at < 2000)) return;
      seen.code = code; seen.at = now;
      try { navigator.vibrate?.(60); } catch {}
      handler.current(code.trim());
    };
    const start = async () => {
      const element = video.current;
      if (!element) return;
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Ta przeglądarka nie udostępnia aparatu. Wpisz kod ręcznie.");
        if (window.BarcodeDetector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
          if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
          element.srcObject = stream; await element.play();
          const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "qr_code"] });
          setEngine("aparat");
          const tick = async () => {
            if (stopped) return;
            try { const codes = await detector.detect(element); if (codes.length) report(codes[0].rawValue); } catch {}
            timer = window.setTimeout(tick, 180);
          };
          void tick();
          return;
        }
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        setEngine("dekoder");
        const started = await reader.decodeFromVideoDevice(undefined, element, result => { if (result) report(result.getText()); });
        if (stopped) { started.stop(); return; }
        controls = started;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError((e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")) || /NotAllowed|Permission|not allowed/i.test(message) ? "Brak zgody na użycie aparatu. Zezwól w ustawieniach przeglądarki albo wpisz kod ręcznie." : message || "Nie udało się uruchomić aparatu.");
      }
    };
    void start();
    return () => { stopped = true; window.clearTimeout(timer); controls?.stop(); stream?.getTracks().forEach(t => t.stop()); };
  }, []);
  return <div className="scanner" role="dialog" aria-label="Skaner kodów">
    <div className="scanner-head"><span><Camera size={16}/> {hint}{engine && <small> · {engine}</small>}</span><button type="button" className="icon-btn" aria-label="Zamknij skaner" onClick={onClose}><X size={18}/></button></div>
    <div className="scanner-frame"><video ref={video} muted playsInline autoPlay/><span className="scanner-guide" aria-hidden="true"/></div>
    {error && <p className="field-error" role="alert">{error}</p>}
  </div>;
}
/** Button that opens the camera scanner; the decoded code goes to `onScan`. */
export function ScanButton({ onScan, label = "Skanuj aparatem", hint, className = "ops-action" }: { onScan: (code: string) => void; label?: string; hint?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={className} onClick={() => setOpen(value => !value)} aria-pressed={open}><Camera size={15}/>{open ? "Zamknij skaner" : label}</button>
    {open && <BarcodeScanner hint={hint} onScan={code => { onScan(code); }} onClose={() => setOpen(false)}/>}
  </>;
}
