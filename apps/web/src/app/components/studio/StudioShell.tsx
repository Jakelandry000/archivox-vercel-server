'use client';

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RefreshCcw, Code, Braces, DraftingCompass } from 'lucide-react';
import { Tabs, TabKey } from '../Tabs';
import { Canvas2D } from './Canvas2D';
import { Canvas3D } from './Canvas3D';
import type { GenerateResult } from './types';

export function StudioShell() {
  const [prompt, setPrompt] = useState(
    'Design a 3 bedroom 2 bathroom home with an attached garage and an office.'
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [tab, setTab] = useState<TabKey>('plan');
  const [mode, setMode] = useState<'2d' | '3d' | 'compare'>('2d');

  const canSubmit = useMemo(() => prompt.trim().length > 0 && !loading, [prompt, loading]);

  async function onSubmit() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = (await res.json()) as GenerateResult;
      if (!res.ok) throw new Error(data?.error ?? 'Request failed');
      setResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ prompt, layout: null, svg: '', script: '', error: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0f12] text-white">
      {/* Top bar */}
      <div className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0f12]/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5">
              <DraftingCompass className="h-4.5 w-4.5 text-emerald-300" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">ArchiVox Studio</div>
              <div className="text-xs text-white/50">Generate • Review • Explore (2D/3D)</div>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              className={
                'rounded-xl px-3 py-2 text-xs font-semibold transition ' +
                (mode === '2d' ? 'bg-emerald-500 text-black' : 'bg-white/5 text-white/80 hover:bg-white/10')
              }
              onClick={() => setMode('2d')}
            >
              2D
            </button>
            <button
              type="button"
              className={
                'rounded-xl px-3 py-2 text-xs font-semibold transition ' +
                (mode === '3d' ? 'bg-emerald-500 text-black' : 'bg-white/5 text-white/80 hover:bg-white/10')
              }
              onClick={() => setMode('3d')}
            >
              3D
            </button>
            <button
              type="button"
              className={
                'rounded-xl px-3 py-2 text-xs font-semibold transition ' +
                (mode === 'compare' ? 'bg-emerald-500 text-black' : 'bg-white/5 text-white/80 hover:bg-white/10')
              }
              onClick={() => setMode('compare')}
            >
              Compare
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-5 py-5 lg:grid-cols-12">
        {/* Left panel */}
        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-white/60">Prompt</div>
              <div className="text-[11px] text-white/40">No-LLM (for now)</div>
            </div>

            <textarea
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-400"
              rows={6}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />

            <div className="mt-3 flex gap-2">
              <button
                className={
                  'flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ' +
                  (canSubmit ? 'bg-emerald-500 text-black hover:brightness-110' : 'bg-white/5 text-white/40')
                }
                disabled={!canSubmit}
                onClick={onSubmit}
                type="button"
              >
                {loading ? 'Generating…' : (
                  <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4" />Generate</span>
                )}
              </button>
              <button
                className="rounded-xl bg-white/5 px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
                type="button"
                onClick={() => {
                  setPrompt('Design a 2 bedroom 1 bathroom home with an attached garage, laundry, and a bright kitchen.');
                  setResult(null);
                }}
              >
                <RefreshCcw className="h-4 w-4" />
              </button>
            </div>

            {result?.error ? <div className="mt-3 text-sm text-red-300">{result.error}</div> : null}

            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">
              <div className="font-semibold text-white/70">Today’s focus</div>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>2D: walls + doors/windows + grid</li>
                <li>3D: basic massing from layout</li>
                <li>Dataset priors: via private storage (R2)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="lg:col-span-7">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
            <div className="border-b border-slate-200 bg-white px-4 py-2">
              <div className="flex items-center gap-2">
                {(['2d', '3d', 'compare'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setMode(k)}
                    type="button"
                    className={
                      'relative rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition ' +
                      (mode === k ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:text-slate-800')
                    }
                  >
                    {k === '2d' ? '2D Plan' : k === '3d' ? '3D Model' : 'Compare'}
                    {mode === k ? (
                      <motion.div layoutId="studio-tab" className="absolute inset-x-2 -bottom-2 h-0.5 rounded bg-emerald-500" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative h-[640px] bg-slate-50">
              {loading ? (
                <div className="absolute inset-0 z-10 grid place-items-center bg-white/70 backdrop-blur-sm">
                  <div className="text-center">
                    <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
                    <div className="mt-3 text-sm font-medium text-slate-600">Generating…</div>
                  </div>
                </div>
              ) : null}

              <AnimatePresence mode="wait">
                {mode === '2d' ? (
                  <motion.div key="2d" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
                    <Canvas2D svg={result?.svg ?? null} />
                  </motion.div>
                ) : null}

                {mode === '3d' ? (
                  <motion.div
                    key="3d"
                    initial={{ opacity: 0, scale: 0.99 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.99 }}
                    className="absolute inset-0"
                  >
                    <Canvas3D layout={result?.layout ?? null} />
                  </motion.div>
                ) : null}

                {mode === 'compare' ? (
                  <motion.div key="compare" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid grid-cols-1 md:grid-cols-2">
                    <div className="border-b border-slate-200 md:border-b-0 md:border-r border-slate-200">
                      <Canvas2D svg={result?.svg ?? null} />
                    </div>
                    <div>
                      <Canvas3D layout={result?.layout ?? null} />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/60">Output</div>

            <div className="mt-3">
              <Tabs active={tab} onChange={setTab}>
                {result && !result.error && tab === 'cad' ? (
                  <pre className="rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] whitespace-pre-wrap text-white/90">
                    <span className="inline-flex items-center gap-2 text-white/60"><Code className="h-3 w-3" /> AutoCAD (.scr)</span>
                    {'\n\n'}
                    {result.script}
                  </pre>
                ) : null}

                {result && !result.error && tab === 'json' ? (
                  <pre className="rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] whitespace-pre-wrap text-white/90">
                    <span className="inline-flex items-center gap-2 text-white/60"><Braces className="h-3 w-3" /> Layout JSON</span>
                    {'\n\n'}
                    {JSON.stringify(result.layout, null, 2)}
                  </pre>
                ) : null}

                {(!result || tab === 'plan') ? (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/70">
                    {result ? 'Use the tabs above to inspect the JSON or CAD script.' : 'Generate a plan to see outputs here.'}
                  </div>
                ) : null}
              </Tabs>
            </div>

            {result?.notes?.length ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs font-semibold text-white/70">Notes</div>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-white/60">
                  {result.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="mx-auto max-w-7xl px-5 pb-8 text-xs text-white/35">
        © {new Date().getFullYear()} ArchiVox
      </footer>
    </div>
  );
}
