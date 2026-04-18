'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Braces, Code, Download, Sparkles } from 'lucide-react';
import { normalizeLegacyLayout } from '@archivox/core';
import { Canvas2DLayout } from './Canvas2DLayout';
import { Canvas3DLayout } from './Canvas3DLayout';
import type { GenerateResult } from '../studio/types';

type CanvasTab = '2d' | '3d' | 'compare';

type Props = {
  initialPrompt?: string;
  autoGenerate?: boolean;
  onResult?: (r: GenerateResult | null) => void;
};

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function StudioSectionV2({ initialPrompt, autoGenerate, onResult }: Props) {
  const [prompt, setPrompt] = useState(initialPrompt ?? 'Design a 3 bedroom 2 bathroom home with an attached garage and an office.');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [tab, setTab] = useState<CanvasTab>('2d');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const layout = useMemo(() => (result?.layout ? normalizeLegacyLayout(result.layout) : null), [result?.layout]);

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);

  useEffect(() => {
    onResult?.(result);
  }, [onResult, result]);

  const canGenerate = useMemo(() => prompt.trim().length > 0 && !loading, [prompt, loading]);

  async function generate(nextPrompt?: string) {
    const p = (nextPrompt ?? prompt).trim();
    if (!p) return;

    setLoading(true);
    setSelectedId(null);
    setResult(null);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: p })
      });
      const data = (await res.json()) as GenerateResult;
      if (!res.ok) throw new Error(data?.error ?? 'Request failed');
      setResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ prompt: p, layout: null, svg: '', script: '', error: msg });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (autoGenerate && initialPrompt) {
      void generate(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      {/* Top bar */}
      <div className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-slate-50">
              <div className="h-2.5 w-2.5 rounded bg-emerald-500" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">ArchiVox Studio</div>
              <div className="text-xs text-slate-500">2D • 3D • Compare • Export</div>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {(['2d', '3d', 'compare'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={
                  'rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-wider transition ' +
                  (tab === k ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                }
              >
                {k === '2d' ? '2D' : k === '3d' ? '3D' : 'Compare'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-1 overflow-hidden">
        {/* Left */}
        <motion.div
          initial={{ x: -12, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="w-72 shrink-0 border-r border-slate-200 bg-white"
        >
          <div className="flex h-full flex-col p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Prompt</div>

            <textarea
              className="mt-3 w-full flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-400"
              rows={10}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={!canGenerate}
                onClick={() => void generate()}
                className={
                  'flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ' +
                  (canGenerate ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-slate-100 text-slate-400')
                }
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  {loading ? 'Generating…' : 'Generate'}
                </span>
              </button>
            </div>

            {result?.error ? <div className="mt-3 text-sm text-red-600">{result.error}</div> : null}

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              Tip: try “3 bed 2 bath, open kitchen, laundry by garage, big master closet”.
            </div>
          </div>
        </motion.div>

        {/* Center */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-1 flex-col overflow-hidden"
        >
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-4 pt-2">
            {(['2d', '3d', 'compare'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={
                  'relative rounded-t-lg px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-colors ' +
                  (tab === k ? 'bg-slate-50 text-emerald-700' : 'text-slate-500 hover:text-slate-700')
                }
              >
                {k === '2d' ? '2D Plan' : k === '3d' ? '3D Model' : 'Compare'}
                {tab === k ? <motion.div layoutId="tab-indicator-v2" className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-emerald-500" /> : null}
              </button>
            ))}
          </div>

          <div className="relative flex-1 overflow-hidden">
            {loading ? (
              <div className="absolute inset-0 z-10 grid place-items-center bg-white/70 backdrop-blur-sm">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
                  <div className="text-sm font-medium text-slate-600">Generating…</div>
                </div>
              </div>
            ) : null}

            <AnimatePresence mode="wait">
              {tab === '2d' ? (
                <motion.div key="2d" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
                  <Canvas2DLayout
                    layout={layout}
                    selectedId={selectedId}
                    onSelect={(id) => setSelectedId(id)}
                  />
                </motion.div>
              ) : null}

              {tab === '3d' ? (
                <motion.div key="3d" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
                  <Canvas3DLayout layout={layout} />
                </motion.div>
              ) : null}

              {tab === 'compare' ? (
                <motion.div
                  key="compare"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 grid grid-cols-1 gap-0 md:grid-cols-2"
                >
                  <div className="border-b border-slate-200 md:border-b-0 md:border-r">
                    <Canvas2DLayout
                      layout={layout}
                      selectedId={selectedId}
                      onSelect={(id) => setSelectedId(id)}
                    />
                  </div>
                  <div className="h-full">
                    <Canvas3DLayout layout={layout} />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Right */}
        <motion.div
          initial={{ x: 12, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="w-72 shrink-0 border-l border-slate-200 bg-white"
        >
          <div className="flex h-full flex-col p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Exports</div>

            <div className="mt-3 grid gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                onClick={() => downloadText('layout.json', JSON.stringify(result?.layout ?? {}, null, 2))}
                disabled={!result || !!result.error}
              >
                <span className="inline-flex items-center gap-2"><Braces className="h-4 w-4" /> Layout JSON</span>
                <Download className="h-4 w-4" />
              </button>

              <button
                type="button"
                className="inline-flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                onClick={() => downloadText('plan.svg', result?.svg ?? '')}
                disabled={!result || !!result.error || !(result?.svg?.length)}
              >
                <span className="inline-flex items-center gap-2"><Download className="h-4 w-4" /> SVG</span>
                <Download className="h-4 w-4" />
              </button>

              <button
                type="button"
                className="inline-flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                onClick={() => downloadText('archivox.scr', result?.script ?? '')}
                disabled={!result || !!result.error || !(result?.script?.length)}
              >
                <span className="inline-flex items-center gap-2"><Code className="h-4 w-4" /> AutoCAD .scr</span>
                <Download className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-500">Output (preview)</div>

            <div className="mt-2 flex-1 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
              {!result ? (
                <div className="text-slate-500">Generate a plan to see JSON and CAD output.</div>
              ) : result.error ? (
                <div className="text-red-600">{result.error}</div>
              ) : (
                <pre className="whitespace-pre-wrap">{JSON.stringify(result.layout, null, 2)}</pre>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
