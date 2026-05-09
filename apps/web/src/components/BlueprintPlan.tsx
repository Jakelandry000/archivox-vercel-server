'use client';

import { useEffect, useId, useRef, useState } from 'react';

export interface Room {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  area?: string;
  highlight?: boolean;
}

interface Props {
  width?: number;
  height?: number;
  rooms: Room[];
  showGrid?: boolean;
  drawOnReveal?: boolean;
  title?: string;
}

export const DEMO_APARTMENT: Room[] = [
  { name: 'Living',  x: 20,  y: 20,  w: 300, h: 180, area: '28.4 m²', highlight: true },
  { name: 'Kitchen', x: 320, y: 20,  w: 200, h: 120, area: '14.2 m²' },
  { name: 'Dining',  x: 320, y: 140, w: 200, h: 120, area: '12.6 m²' },
  { name: 'Hall',    x: 20,  y: 200, w: 220, h: 90,  area: '6.1 m²'  },
  { name: 'Bath',    x: 240, y: 260, w: 140, h: 100, area: '5.3 m²'  },
  { name: 'Bed 01',  x: 20,  y: 290, w: 220, h: 130, area: '18.0 m²' },
  { name: 'Bed 02',  x: 380, y: 260, w: 140, h: 100, area: '11.2 m²' },
  { name: 'Bed 03',  x: 520, y: 140, w: 170, h: 120, area: '14.8 m²' },
  { name: 'Study',   x: 520, y: 280, w: 170, h: 140, area: '10.4 m²' },
];

export function BlueprintPlan({
  width = 720,
  height = 440,
  rooms,
  showGrid = true,
  drawOnReveal = false,
  title = 'PLAN.DWG',
}: Props) {
  const pad = 28;
  const uid = useId().replace(/:/g, '');
  const ref = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState(!drawOnReveal);

  useEffect(() => {
    if (!drawOnReveal || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => { entries.forEach(e => { if (e.isIntersecting) setDrawn(true); }); },
      { threshold: 0.25 }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [drawOnReveal]);

  const W = width, H = height;
  const accent = 'var(--accent-fg)';
  const lineColor = 'rgba(240,240,240,0.8)';
  const labelColor = 'rgba(160,160,160,0.9)';

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      className={`plan-svg${drawOnReveal ? ' plan-draw' : ''}${drawn ? ' in' : ''}`}
      style={{ overflow: 'hidden', display: 'block' }}
    >
      <defs>
        <clipPath id={`clip-${uid}`}>
          <rect x="0" y="0" width={W} height={H} />
        </clipPath>
        <pattern id={`grid-${uid}`} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
        </pattern>
      </defs>

      {showGrid && <rect x="0" y="0" width={W} height={H} fill={`url(#grid-${uid})`} />}

      <g clipPath={`url(#clip-${uid})`}>
        {/* Plot border */}
        <rect
          x={pad - 4} y={pad - 4}
          width={W - 2 * (pad - 4)} height={H - 2 * (pad - 4)}
          fill="none" stroke={lineColor} strokeWidth="0.6"
          strokeDasharray="2 6" opacity="0.4"
          pathLength={100} style={{ ['--len' as string]: 100 }}
        />

        {/* Corner marks */}
        {([[pad-4,pad-4],[W-pad+4,pad-4],[pad-4,H-pad+4],[W-pad+4,H-pad+4]] as [number,number][]).map(([cx,cy], i) => (
          <g key={i} stroke={accent} strokeWidth="1.25" pathLength={20} style={{ ['--len' as string]: 20 }}>
            <line x1={cx-5} y1={cy} x2={cx+5} y2={cy} />
            <line x1={cx} y1={cy-5} x2={cx} y2={cy+5} />
          </g>
        ))}

        {/* Rooms */}
        {rooms.map((r, i) => {
          const rx = pad + r.x, ry = pad + r.y;
          const perim = 2 * (r.w + r.h);
          return (
            <g key={i}>
              {r.highlight && (
                <rect x={rx} y={ry} width={r.w} height={r.h}
                  fill={`color-mix(in oklab, ${accent} 8%, transparent)`} stroke="none" />
              )}
              <rect
                x={rx} y={ry} width={r.w} height={r.h}
                fill="none"
                stroke={r.highlight ? accent : lineColor}
                strokeWidth={r.highlight ? 1.75 : 1.25}
                pathLength={perim} style={{ ['--len' as string]: perim }}
              />
              <text x={rx + 10} y={ry + 18} fill={labelColor}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.1em' }}>
                {String(i + 1).padStart(2, '0')} · {r.name.toUpperCase()}
              </text>
              {r.area && (
                <text x={rx + 10} y={ry + 32} fill={labelColor}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 9, opacity: 0.7 }}>
                  {r.area}
                </text>
              )}
            </g>
          );
        })}

        {/* North arrow */}
        <g transform={`translate(${W - 50} ${H - 56})`} stroke={lineColor} strokeWidth="0.9" fill="none">
          <circle cx="0" cy="0" r="14" opacity="0.4" pathLength={40} style={{ ['--len' as string]: 40 }} />
          <path d="M0 -12 L4 3 L0 0 L-4 3 Z" fill={accent} stroke={accent} pathLength={30} style={{ ['--len' as string]: 30 }} />
          <text x="0" y="24" fill={labelColor} textAnchor="middle"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em' }}>N</text>
        </g>

        {/* Scale bar */}
        <g transform={`translate(${pad} ${H - 18})`} stroke={lineColor} strokeWidth="0.9">
          <line x1="0" y1="0" x2="80" y2="0" pathLength={80} style={{ ['--len' as string]: 80 }} />
          {[0, 20, 40, 60, 80].map(x => (
            <line key={x} x1={x} y1="-3" x2={x} y2="3" pathLength={6} style={{ ['--len' as string]: 6 }} />
          ))}
          <text x="0" y="-8" fill={labelColor} style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>0</text>
          <text x="80" y="-8" fill={labelColor} style={{ fontFamily: 'var(--font-mono)', fontSize: 9 }}>2m</text>
        </g>

        {/* Title block */}
        <g transform={`translate(${W - 170} ${pad - 16})`}>
          <rect x="0" y="0" width="160" height="22" fill="none" stroke={lineColor} strokeWidth="0.75"
            pathLength={364} style={{ ['--len' as string]: 364 }} />
          <text x="8" y="14" fill={labelColor}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em' }}>{title}</text>
          <circle cx="146" cy="11" r="3" fill={accent} />
        </g>
      </g>
    </svg>
  );
}
