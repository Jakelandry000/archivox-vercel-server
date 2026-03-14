'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import type { LayoutV1 } from '@archivox/core';
import { normalizeLegacyLayout } from '@archivox/core';
import type { GenerateResult } from './components/studio/types';
import { StudioSectionV2 } from './components/studio-v2/StudioSection';
import { HeroSection } from './components/landing/HeroSection';
import { PromptSection } from './components/landing/PromptSection';

function formatNum(n: number) {
  return Number.isFinite(n) ? (Math.round(n * 100) / 100).toString() : '—';
}

function summarizeLayout(layout: unknown): { layout: LayoutV1; doors: number; windows: number; openings: number; minDoor?: number; maxDoor?: number; minWindow?: number; maxWindow?: number } | null {
  if (!layout) return null;
  const l = normalizeLegacyLayout(layout);
  const openings = l.openings ?? [];

  const doors = openings.filter((o) => o.type === 'door').map((o) => o.width);
  const windows = openings.filter((o) => o.type === 'window').map((o) => o.width);

  return {
    layout: l,
    doors: doors.length,
    windows: windows.length,
    openings: openings.length,
    minDoor: doors.length ? Math.min(...doors) : undefined,
    maxDoor: doors.length ? Math.max(...doors) : undefined,
    minWindow: windows.length ? Math.min(...windows) : undefined,
    maxWindow: windows.length ? Math.max(...windows) : undefined
  };
}

export default function Home() {
  const studioRef = useRef<HTMLDivElement>(null);

  const [seedPrompt, setSeedPrompt] = useState<string | undefined>(undefined);
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const summary = useMemo(() => summarizeLayout(result?.layout), [result?.layout]);

  return (
    <main className="overflow-x-hidden bg-[#060a09]">
      {/* Big brand catch */}
      <HeroSection />

      {/* Prompt */}
      <PromptSection
        onStart={(prompt) => {
          setSeedPrompt(prompt);
          setAutoGenerate(true);
          setTimeout(() => {
            studioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        }}
      />

      {/* Studio (lock into section; h-screen like website-ui) */}
      <div ref={studioRef}>
        <Suspense
          fallback={
            <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-700">
              <div className="text-sm">Loading Studio…</div>
            </div>
          }
        >
          <StudioSectionV2 initialPrompt={seedPrompt} autoGenerate={autoGenerate} onResult={(r) => setResult(r)} />
        </Suspense>
      </div>

      {/* Summary */}
      <section className="bg-[#0b0f12] px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <h3 className="text-2xl font-semibold tracking-tight text-white">Plan Summary</h3>
          <p className="mt-2 text-white/60">Auto-extracted metrics from the generated layout (doors, windows, dimensions).</p>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
            {!summary || result?.error ? (
              <div className="text-sm text-white/60">Generate a layout above to see the summary.</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/60">Envelope</div>
                  <div className="mt-2 text-sm text-white">
                    {formatNum(summary.layout.dimensions.width)} × {formatNum(summary.layout.dimensions.depth)} {summary.layout.units}
                  </div>
                  <div className="mt-1 text-xs text-white/45">Rooms: {summary.layout.rooms.length}</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/60">Openings</div>
                  <div className="mt-2 text-sm text-white">Doors: {summary.doors} • Windows: {summary.windows}</div>
                  <div className="mt-1 text-xs text-white/45">Total openings: {summary.openings}</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/60">Door widths</div>
                  <div className="mt-2 text-sm text-white">
                    {summary.doors ? (
                      <span>
                        min {formatNum(summary.minDoor ?? 0)} / max {formatNum(summary.maxDoor ?? 0)} {summary.layout.units}
                      </span>
                    ) : (
                      <span className="text-white/50">—</span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/60">Window widths</div>
                  <div className="mt-2 text-sm text-white">
                    {summary.windows ? (
                      <span>
                        min {formatNum(summary.minWindow ?? 0)} / max {formatNum(summary.maxWindow ?? 0)} {summary.layout.units}
                      </span>
                    ) : (
                      <span className="text-white/50">—</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="bg-[#0b0f12] px-6 pb-10 text-center text-xs text-white/35">© {new Date().getFullYear()} ArchiVox</footer>
    </main>
  );
}
