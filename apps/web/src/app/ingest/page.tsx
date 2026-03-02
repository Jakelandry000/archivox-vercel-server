'use client';

import React, { useMemo, useState } from 'react';

type IngestResponse = {
  upload: { name: string; size: number };
  dxfFound: number;
  processed: number;
  okCount: number;
  failCount: number;
  summaries: Array<{
    fileName: string;
    ok: boolean;
    error?: string;
    entityCounts?: Record<string, number>;
    layerCounts?: Record<string, number>;
    bounds?: { minX: number; minY: number; maxX: number; maxY: number };
  }>;
};

export default function IngestPage() {
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<IngestResponse | null>(null);

  const ok = useMemo(() => (data?.summaries ?? []).filter((s) => s.ok), [data]);
  const bad = useMemo(() => (data?.summaries ?? []).filter((s) => !s.ok), [data]);

  async function runIngest() {
    if (!zipFile) return;
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const form = new FormData();
      form.set('file', zipFile);

      const res = await fetch('/api/ingest/zip', {
        method: 'POST',
        body: form
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? `Request failed (${res.status})`);
        return;
      }
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Ingest DXF (Zip)</h1>
          <p className="text-sm opacity-80">
            Upload a single <code>.zip</code> containing one or more <code>.dxf</code> files. We’ll parse each DXF and
            return counts + bounds (best-effort).
          </p>
        </header>

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="file"
              accept="application/zip,.zip"
              onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
            />
            <button
              className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
              onClick={runIngest}
              disabled={!zipFile || loading}
            >
              {loading ? 'Parsing…' : 'Upload + Parse'}
            </button>
          </div>
          {zipFile ? (
            <div className="mt-2 text-xs opacity-80">
              Selected: <b>{zipFile.name}</b> ({(zipFile.size / (1024 * 1024)).toFixed(2)} MB)
            </div>
          ) : null}
        </section>

        {error ? (
          <section className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
            <div className="font-semibold">Error</div>
            <div className="mt-1 opacity-90">{error}</div>
          </section>
        ) : null}

        {data ? (
          <section className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
              <div>
                Zip: <b>{data.upload.name}</b> ({(data.upload.size / (1024 * 1024)).toFixed(2)} MB)
              </div>
              <div className="mt-1">
                DXF found: <b>{data.dxfFound}</b> • processed: <b>{data.processed}</b> • ok: <b>{data.okCount}</b> •
                failed: <b>{data.failCount}</b>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold">Parsed OK ({ok.length})</div>
                <ul className="mt-2 max-h-96 space-y-2 overflow-auto text-xs">
                  {ok.map((s) => (
                    <li key={s.fileName} className="rounded-lg border border-white/10 bg-black/10 p-2">
                      <div className="font-semibold">{s.fileName}</div>
                      {s.bounds ? (
                        <div className="mt-1 opacity-80">
                          bounds: [{s.bounds.minX.toFixed(2)},{' '}
                          {s.bounds.minY.toFixed(2)}] → [{s.bounds.maxX.toFixed(2)},{' '}
                          {s.bounds.maxY.toFixed(2)}]
                        </div>
                      ) : (
                        <div className="mt-1 opacity-70">bounds: (not computed)</div>
                      )}
                      <div className="mt-1 opacity-80">
                        entities:{' '}
                        {s.entityCounts
                          ? Object.entries(s.entityCounts)
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 8)
                              .map(([k, v]) => `${k}:${v}`)
                              .join(' • ')
                          : '(none)'}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold">Failed ({bad.length})</div>
                <ul className="mt-2 max-h-96 space-y-2 overflow-auto text-xs">
                  {bad.map((s) => (
                    <li key={s.fileName} className="rounded-lg border border-white/10 bg-black/10 p-2">
                      <div className="font-semibold">{s.fileName}</div>
                      <div className="mt-1 opacity-80">{s.error ?? 'Unknown error'}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
