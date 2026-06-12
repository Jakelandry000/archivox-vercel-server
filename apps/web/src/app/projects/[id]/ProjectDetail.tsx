'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProjects, saveProject, deleteProject } from '@/lib/projects/store';
import type { DraftResult, DraftValidation, Project } from '@/lib/projects/types';
import Link from 'next/link';

interface Props {
  userId: string;
  projectId: string;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildPrompt(project: Project): string {
  const parts: string[] = [`Project: ${project.name}`];
  if (project.description) parts.push(`Description: ${project.description}`);
  if (project.program) parts.push(`Program: ${project.program}`);
  if (project.siteWidth && project.siteDepth) {
    parts.push(`Site dimensions: ${project.siteWidth}ft wide × ${project.siteDepth}ft deep`);
  } else if (project.overallSqft) {
    parts.push(`Total area: ${project.overallSqft} sqft`);
  }
  return parts.join('\n');
}

function DraftCard({ draft }: { draft: DraftResult }) {
  const [scriptOpen, setScriptOpen] = useState(false);

  const errorCount = draft.validation.violations.filter((v) => v.severity === 'error').length;
  const warnCount = draft.validation.violations.filter((v) => v.severity === 'warning').length;
  const infoCount = draft.validation.violations.filter(
    (v) => v.severity !== 'error' && v.severity !== 'warning'
  ).length;

  const { score, rulebookScoreAdjustment, priorsAdjustment } = draft.validation;
  const hasBreakdown = rulebookScoreAdjustment !== undefined || priorsAdjustment !== undefined;
  // Reconstruct the base score before rulebook deductions and priors bonus.
  const baseScore = hasBreakdown
    ? score - (rulebookScoreAdjustment ?? 0) - (priorsAdjustment ?? 0)
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* SVG Preview */}
      <div className="glass rounded-2xl px-5 py-4 flex flex-col gap-2">
        <div className="text-[10px] uppercase tracking-wider text-white/35">Floor Plan Preview</div>
        <div
          className="w-full rounded-lg bg-black/20 overflow-auto"
          // dangerouslySetInnerHTML is safe here: SVG is generated server-side by our own engine
          dangerouslySetInnerHTML={{ __html: draft.svg }}
        />
        <div className="text-[10px] text-white/30">{formatDate(draft.generatedAt)}</div>
      </div>

      {/* Validation */}
      <div className="glass rounded-2xl px-5 py-4 flex flex-col gap-2">
        <div className="text-[10px] uppercase tracking-wider text-white/35">Validation</div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-white/90">
            {score}
            <span className="text-xs text-white/40 font-normal"> / 100</span>
          </span>
          {errorCount > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
              {warnCount} warning{warnCount !== 1 ? 's' : ''}
            </span>
          )}
          {infoCount > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
              {infoCount} info
            </span>
          )}
          {draft.validation.violations.length === 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
              All clear
            </span>
          )}
        </div>
        {/* Score breakdown: Base | Rulebook | Priors | Final */}
        {hasBreakdown && baseScore !== null && (
          <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono text-white/50">
            <span>Base:</span>
            <span className="text-white/75">{Math.round(baseScore)}</span>
            {rulebookScoreAdjustment !== undefined && (
              <>
                <span className="text-white/20 mx-0.5">|</span>
                <span>Rulebook:</span>
                <span className={rulebookScoreAdjustment < 0 ? 'text-red-400' : 'text-white/60'}>
                  {rulebookScoreAdjustment > 0 ? '+' : ''}{Math.round(rulebookScoreAdjustment)}
                </span>
              </>
            )}
            {priorsAdjustment !== undefined && (
              <>
                <span className="text-white/20 mx-0.5">|</span>
                <span>Priors:</span>
                <span className={priorsAdjustment > 0 ? 'text-emerald-400' : 'text-white/60'}>
                  {priorsAdjustment > 0 ? '+' : ''}{priorsAdjustment}
                </span>
              </>
            )}
            <span className="text-white/20 mx-0.5">|</span>
            <span>Final:</span>
            <span className="text-white/75">{Math.round(score)}</span>
          </div>
        )}
        {draft.validation.violations.length > 0 && (
          <ul className="flex flex-col gap-1 mt-1">
            {draft.validation.violations.map((v, i) => (
              <li key={i} className="text-[11px] text-white/55 flex gap-2">
                <span
                  className={
                    v.severity === 'error'
                      ? 'text-red-400'
                      : v.severity === 'warning'
                        ? 'text-yellow-400'
                        : 'text-blue-400'
                  }
                >
                  {v.severity}
                </span>
                <span>{v.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Priors meta (only if loaded) */}
      {draft.priorsMeta.loaded && (
        <div className="glass rounded-2xl px-5 py-4 flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-wider text-white/35">Priors</div>
          <div className="text-[11px] text-white/55 flex flex-wrap gap-x-4 gap-y-1">
            <span>{draft.priorsMeta.labelsCount} labels</span>
            <span>{draft.priorsMeta.adjacencyPairsCount} adjacency pairs</span>
          </div>
          {draft.priorsMeta.topLabels.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {draft.priorsMeta.topLabels.map((label) => (
                <span
                  key={label}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/50"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AutoCAD Script (collapsible) */}
      <div className="glass rounded-2xl px-5 py-4 flex flex-col gap-2">
        <button
          onClick={() => setScriptOpen((o) => !o)}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="text-[10px] uppercase tracking-wider text-white/35">AutoCAD Script</span>
          <span className="text-white/30 text-xs">{scriptOpen ? '▲ hide' : '▼ show'}</span>
        </button>
        {scriptOpen && (
          <pre className="text-[10px] text-white/50 font-mono bg-black/30 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
            {draft.script}
          </pre>
        )}
      </div>
    </div>
  );
}

function FloorplanSection({
  project,
  userId,
  onUpdate,
}: {
  project: Project;
  userId: string;
  onUpdate: (p: Project) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/projects/${project.id}/floorplan`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string })?.error ?? `Upload failed (${res.status})`);
      }
      const { blobUrl, filename, uploadedAt } = await res.json() as {
        blobUrl: string;
        filename: string;
        uploadedAt: number;
      };
      const updated: Project = {
        ...project,
        floorplan: { blobUrl, filename, uploadedAt },
        updatedAt: Date.now(),
      };
      saveProject(userId, updated);
      onUpdate(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const fp = project.floorplan;
  const isImage = fp && /\.(png|jpe?g)$/i.test(fp.filename);
  // Proxy URL: routes through our authenticated view endpoint — never exposes the raw blob URL
  const viewUrl = fp
    ? `/api/projects/${project.id}/floorplan/view?url=${encodeURIComponent(fp.blobUrl)}`
    : null;

  return (
    <div className="glass rounded-2xl px-5 py-4 flex flex-col gap-3">
      <div className="text-[10px] uppercase tracking-wider text-white/35">Floorplan</div>

      {fp && viewUrl ? (
        <div className="flex flex-col gap-2">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={viewUrl}
              alt={fp.filename}
              className="rounded-lg max-h-64 object-contain w-full bg-black/20"
            />
          ) : (
            <div className="flex flex-col gap-2">
              <a
                href={viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2"
              >
                Open PDF
              </a>
              <iframe
                src={viewUrl}
                title={fp.filename}
                className="w-full rounded-lg bg-black/20"
                style={{ height: '360px', border: 'none' }}
              />
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-white/40">
              {fp.filename} · {formatDate(fp.uploadedAt)}
            </span>
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="text-[11px] text-white/40 hover:text-white/70 transition-colors"
            >
              Replace
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 hover:border-white/30 transition-colors px-4 py-6 text-sm text-white/40 hover:text-white/60"
        >
          {uploading ? 'Uploading…' : '+ Attach floorplan (PDF, PNG, JPG · max 10 MB)'}
        </button>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function GenerateDraftSection({
  project,
  userId,
  onUpdate,
}: {
  project: Project;
  userId: string;
  onUpdate: (p: Project) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const prompt = buildPrompt(project);
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string })?.error ?? `Generation failed (${res.status})`);
      }
      const data = await res.json() as {
        svg: string;
        script: string;
        validation: DraftValidation;
        priorsMeta: {
          loaded: boolean;
          labelsCount: number;
          adjacencyPairsCount: number;
          topLabels: string[];
        };
      };
      const draft: DraftResult = {
        svg: data.svg,
        script: data.script,
        validation: data.validation,
        priorsMeta: data.priorsMeta,
        generatedAt: Date.now(),
      };
      const updated: Project = { ...project, latestDraft: draft, updatedAt: Date.now() };
      saveProject(userId, updated);
      onUpdate(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="btn btn-primary text-sm px-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating
            ? 'Generating…'
            : project.latestDraft
              ? 'Re-generate draft'
              : 'Generate draft'}
        </button>
        {project.latestDraft && !generating && (
          <span className="text-[11px] text-white/30">
            Last generated {formatDate(project.latestDraft.generatedAt)}
          </span>
        )}
      </div>

      {generating && (
        <div className="glass rounded-2xl px-5 py-8 flex items-center justify-center">
          <span className="text-sm text-white/40 animate-pulse">Generating floor plan draft…</span>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {!generating && project.latestDraft && <DraftCard draft={project.latestDraft} />}
    </div>
  );
}

export function ProjectDetail({ userId, projectId }: Props) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null | undefined>(undefined);

  useEffect(() => {
    const found = getProjects(userId).find((p) => p.id === projectId) ?? null;
    setProject(found);
  }, [userId, projectId]);

  if (project === undefined) {
    return <div className="glass rounded-2xl px-6 py-10 animate-pulse opacity-40 h-40" />;
  }

  if (project === null) {
    return (
      <div className="glass rounded-2xl px-6 py-10 text-center">
        <p className="text-white/40 text-sm mb-4">Project not found.</p>
        <Link href="/dashboard" className="btn btn-ghost text-xs px-4 py-2">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  function handleDelete() {
    if (!confirm('Delete this project? This cannot be undone.')) return;
    deleteProject(userId, projectId);
    router.push('/dashboard');
  }

  const hasDimensions = project.siteWidth && project.siteDepth;
  const area = hasDimensions
    ? project.siteWidth! * project.siteDepth!
    : project.overallSqft;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold text-white/90">{project.name}</h1>
        <button
          onClick={handleDelete}
          className="text-white/25 hover:text-red-400 transition-colors text-xs px-2 py-1 shrink-0"
        >
          Delete
        </button>
      </div>

      {project.description && (
        <p className="text-sm text-white/60">{project.description}</p>
      )}

      <div className="glass rounded-2xl px-5 py-4 grid grid-cols-2 gap-4">
        {hasDimensions && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/35 mb-0.5">
              Dimensions
            </div>
            <div className="text-sm text-white/80">
              {project.siteWidth}′ × {project.siteDepth}′
            </div>
          </div>
        )}
        {area && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/35 mb-0.5">
              Area
            </div>
            <div className="text-sm text-white/80">{area.toLocaleString()} sqft</div>
          </div>
        )}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/35 mb-0.5">Created</div>
          <div className="text-sm text-white/80">{formatDate(project.createdAt)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/35 mb-0.5">Updated</div>
          <div className="text-sm text-white/80">{formatDate(project.updatedAt)}</div>
        </div>
      </div>

      {project.program && (
        <div className="glass rounded-2xl px-5 py-4">
          <div className="text-[10px] uppercase tracking-wider text-white/35 mb-2">Program</div>
          <p className="text-sm text-white/70 whitespace-pre-wrap">{project.program}</p>
        </div>
      )}

      <FloorplanSection project={project} userId={userId} onUpdate={setProject} />

      <GenerateDraftSection project={project} userId={userId} onUpdate={setProject} />

      <div className="pt-2">
        <Link href="/generator" className="btn btn-ghost text-sm px-6 py-2.5">
          Open in Generator
        </Link>
      </div>
    </div>
  );
}
