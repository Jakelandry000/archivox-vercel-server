'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ScrollShell } from './components/ScrollShell';
import { Tabs, TabKey } from './components/Tabs';

type ApiResult = {
  prompt: string;
  layout: unknown;
  svg: string;
  script: string;
  notes?: string[];
  error?: string;
};

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold tracking-wide text-white/90">{title}</h2>
      {subtitle ? <p className="mt-1 text-xs text-white/60">{subtitle}</p> : null}
    </div>
  );
}

export default function Home() {
  const [prompt, setPrompt] = useState('Design a 3 bedroom 2 bathroom home with an attached garage and an office.');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [tab, setTab] = useState<TabKey>('plan');

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
      const data = (await res.json()) as ApiResult;
      if (!res.ok) throw new Error(data?.error ?? 'Request failed');
      setResult(data);
    } catch (e: unknown) {
      setResult({ prompt, layout: null, svg: '', script: '', error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollShell>
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="flex flex-col gap-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 grid place-items-center">
                <div className="h-5 w-5 rounded-md" style={{ background: 'linear-gradient(135deg, rgba(34,197,94,1), rgba(16,185,129,1))' }} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">ArchiVox</h1>
                <p className="text-sm text-white/60">Architectural copilot • layouts • 2D plans • AutoCAD scripts</p>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-xs text-white/60">
              <span className="kbd">⌘</span>
              <span className="kbd">Enter</span>
              <span>to generate</span>
            </div>
          </div>

          <div className="glass rounded-3xl p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col gap-3">
              <SectionTitle
                title="Prompt"
                subtitle="Describe the home you want. The MVP uses a no‑LLM heuristic generator (zero token cost)."
              />

              <textarea
                className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white placeholder:text-white/30 outline-none focus:ring-2"
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. 3 bed / 2 bath, modern, attached 2‑car garage, open kitchen + living"
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    className={
                      'btn ' +
                      (canSubmit
                        ? 'btn-primary'
                        : 'btn-ghost text-white/70 cursor-not-allowed')
                    }
                    disabled={!canSubmit}
                    onClick={onSubmit}
                    type="button"
                  >
                    {loading ? 'Generating…' : 'Generate'}
                  </button>

                  <button
                    className="btn btn-ghost text-white/90"
                    type="button"
                    onClick={() => {
                      setPrompt('Design a 2 bedroom 1 bathroom home with an attached garage, laundry, and a bright kitchen.');
                      setResult(null);
                    }}
                  >
                    Example
                  </button>
                </div>

                <div className="text-xs text-white/60">
                  Mode: <span className="text-white/80 font-medium">No‑LLM</span> • <span className="text-white/50">(LLM planner toggle coming)</span>
                </div>
              </div>

              {result?.error ? (
                <p className="text-sm text-red-300">Error: {result.error}</p>
              ) : null}
            </div>
          </div>
        </motion.div>

        {/* Output */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="glass rounded-3xl p-5">
              <SectionTitle
                title="Output"
                subtitle="Switch between the plan preview, CAD script, and the raw JSON layout."
              />

              <div className="mt-4">
                <Tabs active={tab} onChange={setTab}>
                  {!result ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/70">
                      Generate a layout to see results here.
                    </div>
                  ) : null}

                  {result && !result.error && tab === 'plan' ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3 overflow-auto">
                      <div
                        className="min-w-[520px]"
                        dangerouslySetInnerHTML={{ __html: result.svg }}
                      />
                    </div>
                  ) : null}

                  {result && !result.error && tab === 'cad' ? (
                    <pre className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs whitespace-pre-wrap text-white/90">
                      {result.script}
                    </pre>
                  ) : null}

                  {result && !result.error && tab === 'json' ? (
                    <pre className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs whitespace-pre-wrap text-white/90">
                      {JSON.stringify(result.layout, null, 2)}
                    </pre>
                  ) : null}
                </Tabs>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="glass rounded-3xl p-5">
              <SectionTitle title="Roadmap" subtitle="What’s next (designed for real architects, not just chat)." />

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  {
                    title: 'Attached garage defaults',
                    body: 'Bias generation to keep the garage connected and accessible.'
                  },
                  {
                    title: 'Constraint controls',
                    body: 'Units, site bounds, room counts, adjacency preferences.'
                  },
                  {
                    title: 'Smarter packing + validation',
                    body: 'No overlaps, circulation hints, better proportions.'
                  },
                  {
                    title: 'LLM planner toggle',
                    body: 'High quality mode that uses tokens only when you want.'
                  },
                  {
                    title: 'DXF ingestion',
                    body: 'Convert real CAD floorplans into layout.v1 training data.'
                  },
                  {
                    title: 'Sustainability critique',
                    body: 'Daylighting, passive cooling, orientation heuristics.'
                  }
                ].map((c) => (
                  <motion.div
                    key={c.title}
                    whileHover={{ y: -2 }}
                    transition={{ duration: 0.2 }}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="text-sm font-semibold text-white/90">{c.title}</div>
                    <div className="mt-1 text-xs text-white/60">{c.body}</div>
                  </motion.div>
                ))}
              </div>

              {result?.notes?.length ? (
                <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-semibold text-white/90">Notes</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-white/70">
                    {result.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <footer className="mt-10 text-xs text-white/40">
          © {new Date().getFullYear()} ArchiVox • Built as a modern architecture workflow, not a generic chatbot.
        </footer>
      </div>
    </ScrollShell>
  );
}
