"use client";
/** E-signature pad (live: estimates/client-preview/components/signature-canvas.tsx). */
import { useEffect, useRef } from "react";

export function SignatureCanvas({ onChange, clearKey }: { onChange: (signed: boolean) => void; clearKey: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    inked.current = false;
    onChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearKey]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  return (
    <div className="relative">
      <canvas
        ref={ref}
        className="h-48 w-full touch-none rounded-xl border-2 border-dashed border-gray-300 bg-white"
        aria-label="Signature pad"
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = e.currentTarget.getContext("2d")!;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d")!;
          const p = pos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          if (!inked.current) {
            inked.current = true;
            onChange(true);
          }
        }}
        onPointerUp={() => (drawing.current = false)}
      />
      <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-xs font-bold uppercase tracking-widest text-gray-300">Sign Above</span>
    </div>
  );
}
