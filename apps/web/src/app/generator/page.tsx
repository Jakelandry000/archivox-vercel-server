'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ScrollShell } from '../components/ScrollShell';
import { Tabs, TabKey } from '../components/Tabs';
import { FloorPlan3D } from '../../components/FloorPlan3D';
import { isLayoutV1 } from '@archivox/core/layout';

type ValidationViolation = {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  roomIds?: string[];
};

type ValidationMetrics = {
  totalArea: number;
  coveredArea: number;
  coverageRatio: number;
  roomCount: number;
  overlapCount: number;
  avgRoomWidth: number;
  avgRoomHeight: number;
};

type ValidationResult = {
  score: number;
  violations: ValidationViolation[];
  metrics: ValidationMetrics;
  priorsAdjustment?: number;
  rulebookScoreAdjustment?: number;
};

type PriorsMeta = {
  loaded: boolean;
  labelsCount: number;
  adjacencyPairsCount: number;
  topLabels: string[];
};

type ApiResult = {
  prompt: string;
  layout: unknown;
  svg: string;
  script: string;
  validation?: ValidationResult;
  priorsMeta?: PriorsMeta;
  meta?: { attempts: number; notes: string[] };
  notes?: string[];
  error?: string;
};

function scoreLabel(score: number): { label: string; color: string } {
  if (score >= 85) return { label: 'Excellent', color: 'rgb(var(--accent))' };
  if (score >= 70) return { label: 'Good', color: 'rgb(var(--accent-2))' };
  if (score >= 50) return { label: 'Fair', color: 'rgba(250,204,21,0.85)' };
  return { label: 'Poor', color: 'rgb(var(--danger))' };
}

function ValidationPanel({ validation, layout, priorsMeta }: { validation?: ValidationResult; layout: unknown; priorsMeta?: PriorsMeta }) {
  if (!validation) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/50">
        No validation data available. Generate a layout to see results.
      </div>
    );
  }

  const { score, violations, metrics, priorsAdjustment, rulebookScoreAdjustment } = validation;
  const { label, color } = scoreLabel(score);

  // Reconstruct base score (before rulebook and priors adjustments).
  const hasBreakdown = rulebookScoreAdjustment !== undefined || priorsAdjustment !== undefined;
  const baseScore = hasBreakdown
    ? score - (priorsAdjustment ?? 0) - (rulebookScoreAdjustment ?? 0)
    : null;

  // Split IBC violations (code starts with "ibc-") from core violations.
  const coreViolations = violations.filter(v => !v.code.startsWith('ibc-'));
  const ibcViolations  = violations.filter(v => v.code.startsWith('ibc-'));

  const errors   = coreViolations.filter(v => v.severity === 'error');
  const warnings = coreViolations.filter(v => v.severity === 'warning');
  const infos    = coreViolations.filter(v => v.severity === 'info');

  // Derive garage ratio from layout rooms
  let garageRatio: string = '—';
  if (layout && typeof layout === 'object' && 'rooms' in layout && metrics.coveredArea > 0) {
    const rooms = (layout as { rooms: Array<{ type: string; width: number; height: number }> }).rooms;
    const garageArea = rooms.filter(r => r.type === 'garage').reduce((s, r) => s + r.width * r.height, 0);
    garageRatio = (garageArea / metrics.coveredArea * 100).toFixed(1) + '%';
  }

  const outOfBoundsCount = coreViolations.filter(v => v.code === 'ROOM_OUT_OF_BOUNDS').length;

  const keyMetrics = [
    { label: 'Overlap Pairs', value: String(metrics.overlapCount) },
    { label: 'Out-of-Bounds Rooms', value: String(outOfBoundsCount) },
    { label: 'Garage Ratio', value: garageRatio },
    { label: 'Coverage', value: (metrics.coverageRatio * 100).toFixed(1) + '%' },
    { label: 'Circulation Ratio', value: '—' },
    { label: 'Total Overlap Area', value: '—' },
  ];

  const severityStyles: Record<string, string> = {
    error: 'text-red-300 border-red-500/30 bg-red-500/5',
    warning: 'text-yellow-300 border-yellow-500/30 bg-yellow-500/5',
    info: 'text-blue-300 border-blue-500/30 bg-blue-500/5',
  };

  const severityDot: Record<string, string> = {
    error: 'bg-red-400',
    warning: 'bg-yellow-400',
    info: 'bg-blue-400',
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Score */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-5 flex flex-col gap-3">
        <div className="flex items-center gap-5">
          <div className="text-6xl font-bold tabular-nums leading-none" style={{ color }}>{score}</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold" style={{ color }}>{label}</span>
            </div>
            <div className="mt-1 text-xs text-white/50">
              {errors.length} error{errors.length !== 1 ? 's' : ''} · {warnings.length} warning{warnings.length !== 1 ? 's' : ''} · {infos.length} note{infos.length !== 1 ? 's' : ''}
            </div>
            <div className="mt-2 h-1.5 w-32 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${score}%`, background: color }}
              />
            </div>
          </div>
        </div>

        {/* Score breakdown: Base | Rulebook | Priors | Final */}
        {hasBreakdown && baseScore !== null && (
          <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono">
            <span className="text-white/50">Base:</span>
            <span className="text-white/80 tabular-nums">{Math.round(baseScore)}</span>
            {rulebookScoreAdjustment !== undefined && (
              <>
                <span className="text-white/25 mx-0.5">|</span>
                <span className="text-white/50">Rulebook:</span>
                <span className="tabular-nums" style={{ color: rulebookScoreAdjustment < 0 ? 'rgb(var(--danger))' : 'rgba(235,244,238,0.6)' }}>
                  {rulebookScoreAdjustment > 0 ? '+' : ''}{Math.round(rulebookScoreAdjustment)}
                </span>
              </>
            )}
            {priorsAdjustment !== undefined && (
              <>
                <span className="text-white/25 mx-0.5">|</span>
                <span className="text-white/50">Priors:</span>
                <span className="tabular-nums" style={{ color: priorsAdjustment > 0 ? 'rgb(var(--accent))' : 'rgba(235,244,238,0.6)' }}>
                  {priorsAdjustment > 0 ? '+' : ''}{priorsAdjustment}
                </span>
              </>
            )}
            <span className="text-white/25 mx-0.5">|</span>
            <span className="text-white/50">Final:</span>
            <span className="tabular-nums font-semibold" style={{ color }}>{score}</span>
          </div>
        )}
      </div>

      {/* Key Metrics */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Key Metrics</div>
        <div className="grid grid-cols-3 gap-2">
          {keyMetrics.map(m => (
            <div key={m.label} className="rounded-xl border border-white/8 bg-white/3 p-3">
              <div className="text-base font-semibold text-white/90 tabular-nums">{m.value}</div>
              <div className="mt-0.5 text-[11px] text-white/50 leading-tight">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Core Violations */}
      {coreViolations.length === 0 ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-300">
          No core violations — layout passes all checks.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {([['error', errors], ['warning', warnings], ['info', infos]] as const).map(([sev, list]) =>
            list.length === 0 ? null : (
              <div key={sev} className={`rounded-2xl border p-4 ${severityStyles[sev]}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`h-2 w-2 rounded-full ${severityDot[sev]}`} />
                  <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
                    {sev === 'error' ? 'Errors' : sev === 'warning' ? 'Warnings' : 'Notes'} ({list.length})
                  </span>
                </div>
                <ul className="flex flex-col gap-1">
                  {list.map((v, i) => (
                    <li key={i} className="text-xs opacity-90 leading-relaxed">{v.message}</li>
                  ))}
                </ul>
              </div>
            )
          )}
        </div>
      )}

      {/* IBC / Code Checks */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">IBC / Code Checks</div>
        {ibcViolations.length === 0 ? (
          <div className="text-xs text-white/40">No IBC warnings for this layout.</div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {ibcViolations.map((v, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${severityDot[v.severity] ?? 'bg-white/30'}`} />
                <span className="text-white/70 leading-relaxed">
                  <span className="font-mono text-white/40 mr-1">{v.code}</span>
                  {v.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Priors */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-3">Dataset Priors</div>
        {!priorsMeta || !priorsMeta.loaded ? (
          <div className="text-xs text-white/40">Priors not loaded — scoring ran without dataset context.</div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/8 bg-white/3 p-3">
                <div className="text-base font-semibold text-white/90 tabular-nums">{priorsMeta.labelsCount}</div>
                <div className="mt-0.5 text-[11px] text-white/50">Room labels</div>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/3 p-3">
                <div className="text-base font-semibold text-white/90 tabular-nums">{priorsMeta.adjacencyPairsCount}</div>
                <div className="mt-0.5 text-[11px] text-white/50">Adjacency pairs</div>
              </div>
            </div>
            {priorsMeta.topLabels.length > 0 && (
              <div className="text-[11px] text-white/50">
                Top labels: <span className="text-white/70">{priorsMeta.topLabels.join(', ')}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

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
                subtitle="Switch between the plan preview, CAD script, JSON layout, and validation report."
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

                  {result && !result.error && tab === '3d' ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden" style={{ height: '480px' }}>
                      {isLayoutV1(result.layout) ? (
                        <FloorPlan3D layout={result.layout} className="w-full h-full" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-white/50">
                          Layout data is not a valid LayoutV1 — cannot render 3D view.
                        </div>
                      )}
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

                  {result && !result.error && tab === 'validation' ? (
                    <ValidationPanel validation={result.validation} layout={result.layout} priorsMeta={result.priorsMeta} />
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
