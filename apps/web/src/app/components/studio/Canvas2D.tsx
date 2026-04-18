'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

type Props = {
  svg: string | null;
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

export function Canvas2D({ svg }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const last = useRef({ x: 0, y: 0 });

  // Fit-to-view on first svg load.
  useEffect(() => {
    if (!svg) return;
    const el = containerRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    // Allow layout pass.
    requestAnimationFrame(() => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const bb = content.getBoundingClientRect();
      const zw = cw / Math.max(bb.width, 1);
      const zh = ch / Math.max(bb.height, 1);
      const fit = Math.min(zw, zh) * 0.92;
      const z = clamp(fit, MIN_ZOOM, MAX_ZOOM);
      setZoom(z);
      setPan({ x: (cw - bb.width * z) / 2, y: (ch - bb.height * z) / 2 });
    });
  }, [svg]);

  const zoomPct = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom]);

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setZoom((z) => clamp(z + delta * z, MIN_ZOOM, MAX_ZOOM));
  }

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0 && e.button !== 1) return;
    setPanning(true);
    last.current = { x: e.clientX, y: e.clientY };
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!panning) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }

  function onMouseUp() {
    setPanning(false);
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-white"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      aria-label="2D plan"
    >
      {/* HUD */}
      <div className="absolute bottom-3 left-3 z-10 rounded-lg border border-slate-200 bg-white/80 px-2 py-1 text-[11px] font-mono text-slate-600 backdrop-blur-sm">
        {zoomPct}
      </div>

      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        <button
          className="h-7 w-7 rounded text-slate-700 hover:bg-slate-100"
          onClick={() => setZoom((z) => clamp(z * 1.2, MIN_ZOOM, MAX_ZOOM))}
          type="button"
          aria-label="Zoom in"
        >
          +
        </button>
        <div className="h-px w-7 bg-slate-200" />
        <button
          className="h-7 w-7 rounded text-slate-700 hover:bg-slate-100"
          onClick={() => setZoom((z) => clamp(z * 0.8, MIN_ZOOM, MAX_ZOOM))}
          type="button"
          aria-label="Zoom out"
        >
          −
        </button>
      </div>

      <motion.div
        className={
          'absolute inset-0 cursor-grab select-none ' +
          (panning ? 'cursor-grabbing' : '')
        }
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0'
        }}
      >
        <div
          ref={contentRef}
          className="inline-block p-6"
          dangerouslySetInnerHTML={{ __html: svg ?? '' }}
        />
      </motion.div>

      {!svg ? (
        <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">
          Generate a layout to see the plan.
        </div>
      ) : null}
    </div>
  );
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
