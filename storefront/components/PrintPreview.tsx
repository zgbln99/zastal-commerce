"use client";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PrintLayout, PrintArea } from "../lib/commerce.mjs";
import "./print-preview.css";

const FONTS: Record<PrintLayout["font"], string> = { block: "Inter, 'Arial Black', Arial, sans-serif", condensed: "'Arial Narrow', 'Roboto Condensed', Inter, sans-serif", rounded: "'Trebuchet MS', 'Verdana', Inter, sans-serif" };
const WIDTH_FACTOR = { block: 0.64, condensed: 0.5, rounded: 0.62 } as const;

/** Draws the customer's name/number on the approved product photo using percentage boxes. */
export default function PrintPreview({ layout, name, number, editable = false, onMove, className = "" }: { layout: PrintLayout; name: string; number: string; editable?: boolean; onMove?: (area: keyof PrintLayout["areas"], box: PrintArea) => void; className?: string }) {
  const [size, setSize] = useState({ w: 1000, h: 1000 });
  const drag = useRef<{ area: keyof PrintLayout["areas"]; dx: number; dy: number } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const texts: Partial<Record<keyof PrintLayout["areas"], string>> = { name: name.trim().toUpperCase(), number: number.trim() };
  const toPercent = (event: ReactPointerEvent) => {
    const rect = host.current?.getBoundingClientRect();
    if (!rect || !rect.width) return null;
    return { x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 };
  };
  const start = (area: keyof PrintLayout["areas"]) => (event: ReactPointerEvent) => {
    if (!editable) return;
    const point = toPercent(event); const box = layout.areas[area];
    if (!point || !box) return;
    drag.current = { area, dx: point.x - box.x, dy: point.y - box.y };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };
  const move = (event: ReactPointerEvent) => {
    if (!drag.current || !onMove) return;
    const point = toPercent(event); const box = layout.areas[drag.current.area];
    if (!point || !box) return;
    const x = Math.min(100 - box.w, Math.max(0, point.x - drag.current.dx));
    const y = Math.min(100 - box.h, Math.max(0, point.y - drag.current.dy));
    onMove(drag.current.area, { ...box, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
  };
  const stop = () => { drag.current = null; };
  return <div ref={host} className={"print-preview-stage " + (editable ? "editable " : "") + className} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
    <img src={layout.image} alt="" draggable={false} onLoad={event => setSize({ w: event.currentTarget.naturalWidth || 1000, h: event.currentTarget.naturalHeight || 1000 })}/>
    <svg viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none" aria-hidden="true">
      {(Object.keys(layout.areas) as (keyof PrintLayout["areas"])[]).map(area => {
        const box = layout.areas[area]; if (!box) return null;
        const text = texts[area] || "";
        const x = (box.x / 100) * size.w, y = (box.y / 100) * size.h, w = (box.w / 100) * size.w, h = (box.h / 100) * size.h;
        const fontSize = h * 0.92;
        const estimated = text.length * fontSize * WIDTH_FACTOR[layout.font];
        const fit = estimated > w ? { textLength: w, lengthAdjust: "spacingAndGlyphs" as const } : {};
        return <g key={area}>
          {editable && <rect x={x} y={y} width={w} height={h} fill="rgba(23,76,55,.08)" stroke="#174c37" strokeWidth={Math.max(2, size.w / 400)} strokeDasharray={`${size.w / 100} ${size.w / 150}`} style={{ cursor: "move" }} onPointerDown={start(area)}/>}
          {text && <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fontFamily={FONTS[layout.font]} fontWeight={800} fill={layout.color} style={{ pointerEvents: "none", paintOrder: "stroke" }} {...fit}>{text}</text>}
        </g>;
      })}
    </svg>
  </div>;
}
