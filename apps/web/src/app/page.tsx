'use client';

import { useMemo, useState } from 'react';

type ApiResult = {
  prompt: string;
  layout: any;
  svg: string;
  script: string;
  notes?: string[];
  error?: string;
};

export default function Home() {
  const [prompt, setPrompt] = useState('Design a 3 bedroom 2 bathroom home with an office and laundry.');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);

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
    } catch (e: any) {
      setResult({ prompt, layout: null, svg: '', script: '', error: e?.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">ArchiVox (MVP)</h1>
      <p className="text-sm text-gray-600 mt-2">
        Type a request → get a layout JSON + 2D SVG + AutoCAD script.
      </p>

      <section className="mt-6 rounded-xl border p-4">
        <label className="block text-sm font-medium">Prompt</label>
        <textarea
          className="mt-2 w-full rounded-lg border p-3 text-sm"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={!canSubmit}
            onClick={onSubmit}
          >
            {loading ? 'Generating…' : 'Generate'}
          </button>
          <span className="text-xs text-gray-600">
            Current mode: <b>no-LLM heuristic</b> (no token cost)
          </span>
        </div>
      </section>

      {result?.error ? (
        <p className="mt-6 text-sm text-red-600">Error: {result.error}</p>
      ) : null}

      {result && !result.error ? (
        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border p-4">
            <h2 className="font-medium">2D Floor Plan (SVG)</h2>
            <div
              className="mt-3 bg-white overflow-auto rounded-lg border p-3"
              dangerouslySetInnerHTML={{ __html: result.svg }}
            />
          </div>

          <div className="rounded-xl border p-4">
            <h2 className="font-medium">AutoCAD Script (.scr)</h2>
            <pre className="mt-3 text-xs whitespace-pre-wrap rounded-lg border bg-gray-50 p-3">{result.script}</pre>
          </div>

          <div className="rounded-xl border p-4 lg:col-span-2">
            <h2 className="font-medium">Layout JSON</h2>
            <pre className="mt-3 text-xs whitespace-pre-wrap rounded-lg border bg-gray-50 p-3">
              {JSON.stringify(result.layout, null, 2)}
            </pre>
          </div>

          {result.notes?.length ? (
            <div className="rounded-xl border p-4 lg:col-span-2">
              <h2 className="font-medium">Notes</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-gray-700">
                {result.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
