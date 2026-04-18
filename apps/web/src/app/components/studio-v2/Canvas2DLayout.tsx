'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutV1 } from '@archivox/core';
import { ROOM_COLORS } from './roomColors';

const SCALE = 14; // px per foot-ish
const PADDING = 40;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3.5;

export function Canvas2DLayout({
  layout,
  selectedId,
  onSelect
}: {
  layout: LayoutV1 | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const initialized = useRef(false);

  useEffect(() => {
    if (layout && !initialized.current && containerRef.current) {
      const el = containerRef.current;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const lw = layout.dimensions.width * SCALE + PADDING * 2;
      const lh = layout.dimensions.depth * SCALE + PADDING * 2;
      const fitZoom = Math.min((cw / lw) * 0.9, (ch / lh) * 0.9, MAX_ZOOM);
      const clamped = Math.max(fitZoom, MIN_ZOOM);
      setZoom(clamped);
      setPan({ x: (cw - lw * clamped) / 2, y: (ch - lh * clamped) / 2 });
      initialized.current = true;
    }
  }, [layout]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta * z)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      setIsPanning(true);
      setLastMouse({ x: e.clientX, y: e.clientY });
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      setLastMouse({ x: e.clientX, y: e.clientY });
    },
    [isPanning, lastMouse]
  );

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  if (!layout) {
    return (
      <div className="flex h-full w-full items-center justify-center av-canvas-surface">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="4" y="4" width="20" height="20" rx="2" stroke="#94a3b8" strokeWidth="1.5" />
              <path d="M4 10h20M10 10v14" stroke="#94a3b8" strokeWidth="1.5" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-600">No plan generated yet</p>
          <p className="mt-1 text-xs text-slate-500">Use the left panel to generate a floor plan</p>
        </div>
      </div>
    );
  }

  const bw = layout.dimensions.width * SCALE;
  const bh = layout.dimensions.depth * SCALE;
  const svgW = bw + PADDING * 2;
  const svgH = bh + PADDING * 2;

  const worldToSVG = (x: number, y: number) => ({ x: x * SCALE + PADDING, y: y * SCALE + PADDING });

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full select-none overflow-hidden av-canvas-surface cursor-grab active:cursor-grabbing"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-md">
        <button
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.2))}
          className="flex h-7 w-7 items-center justify-center rounded text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100"
        >
          +
        </button>
        <div className="h-px w-7 bg-slate-200" />
        <button
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z * 0.8))}
          className="flex h-7 w-7 items-center justify-center rounded text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100"
        >
          −
        </button>
      </div>

      <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-slate-200 bg-white/80 px-2 py-1 text-xs font-mono text-slate-500 backdrop-blur-sm">
        {Math.round(zoom * 100)}%
      </div>

      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width: svgW,
          height: svgH
        }}
      >
        <svg width={svgW} height={svgH} onClick={() => onSelect(null)}>
          <rect x={PADDING} y={PADDING} width={bw} height={bh} fill="white" stroke="#64748b" strokeWidth={2} rx={2} />

          {/* Rooms */}
          {layout.rooms.map((room) => {
            const { x, y } = worldToSVG(room.x, room.y);
            const w = room.width * SCALE;
            const h = room.height * SCALE;
            const isSelected = selectedId === room.id;
            const color = ROOM_COLORS[String(room.type).toLowerCase()] ?? ROOM_COLORS.other;

            return (
              <g key={room.id} onClick={(e) => { e.stopPropagation(); onSelect(room.id); }} className="cursor-pointer">
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={color}
                  stroke={isSelected ? '#059669' : '#94a3b8'}
                  strokeWidth={isSelected ? 2 : 1}
                  rx={1}
                />
                {isSelected ? (
                  <rect
                    x={x - 2}
                    y={y - 2}
                    width={w + 4}
                    height={h + 4}
                    fill="none"
                    stroke="#059669"
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    rx={3}
                    opacity={0.6}
                  />
                ) : null}

                {w > 30 && h > 20 ? (
                  <>
                    <text
                      x={x + w / 2}
                      y={y + h / 2 - 4}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={Math.min(10, w / 8)}
                      fill="#374151"
                      fontFamily="system-ui, sans-serif"
                      fontWeight="600"
                    >
                      {room.label ?? String(room.type)}
                    </text>
                    <text
                      x={x + w / 2}
                      y={y + h / 2 + 8}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={Math.min(8, w / 10)}
                      fill="#94a3b8"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                    >
                      {room.width.toFixed(0)}×{room.height.toFixed(0)}
                    </text>
                  </>
                ) : null}
              </g>
            );
          })}

          {/* Walls */}
          {(layout.walls ?? []).map((wall) => {
            const p1 = worldToSVG(wall.a.x, wall.a.y);
            const p2 = worldToSVG(wall.b.x, wall.b.y);
            const isSelected = selectedId === wall.id;
            const kind = wall.kind ?? 'unknown';
            return (
              <line
                key={wall.id}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={isSelected ? '#059669' : kind === 'exterior' ? '#1e293b' : '#64748b'}
                strokeWidth={kind === 'exterior' ? 3 : 1.5}
                strokeLinecap="round"
                onClick={(e) => { e.stopPropagation(); onSelect(wall.id); }}
                className="cursor-pointer"
              />
            );
          })}

          {/* Openings */}
          {(layout.openings ?? []).map((opening) => {
            const wall = (layout.walls ?? []).find((w) => w.id === opening.wallId);
            if (!wall) return null;
            const p1 = worldToSVG(wall.a.x, wall.a.y);
            const p2 = worldToSVG(wall.b.x, wall.b.y);
            const cx = p1.x + (p2.x - p1.x) * opening.centerT;
            const cy = p1.y + (p2.y - p1.y) * opening.centerT;
            const hw = (opening.width * SCALE) / 2;
            const denom = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
            const dx = (p2.x - p1.x) / denom;
            const dy = (p2.y - p1.y) / denom;
            const isSelected = selectedId === opening.id;
            const t = opening.type;

            return (
              <g
                key={opening.id}
                onClick={(e) => { e.stopPropagation(); onSelect(opening.id); }}
                className="cursor-pointer"
              >
                <line x1={cx - dx * hw} y1={cy - dy * hw} x2={cx + dx * hw} y2={cy + dy * hw} stroke="white" strokeWidth={4} />
                <line
                  x1={cx - dx * hw}
                  y1={cy - dy * hw}
                  x2={cx + dx * hw}
                  y2={cy + dy * hw}
                  stroke={isSelected ? '#059669' : t === 'door' ? '#0ea5e9' : '#f59e0b'}
                  strokeWidth={2}
                  strokeDasharray={t === 'window' ? '2 2' : undefined}
                />
              </g>
            );
          })}

          {/* Dimension lines */}
          <line x1={PADDING} y1={PADDING - 12} x2={PADDING + bw} y2={PADDING - 12} stroke="#94a3b8" strokeWidth={1} />
          <text
            x={PADDING + bw / 2}
            y={PADDING - 16}
            textAnchor="middle"
            fontSize={9}
            fill="#94a3b8"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
          >
            {layout.dimensions.width} {layout.units}
          </text>

          <line x1={PADDING - 12} y1={PADDING} x2={PADDING - 12} y2={PADDING + bh} stroke="#94a3b8" strokeWidth={1} />
          <text
            x={PADDING - 20}
            y={PADDING + bh / 2}
            textAnchor="middle"
            fontSize={9}
            fill="#94a3b8"
            transform={`rotate(-90, ${PADDING - 20}, ${PADDING + bh / 2})`}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
          >
            {layout.dimensions.depth} {layout.units}
          </text>
        </svg>
      </div>
    </div>
  );
}
