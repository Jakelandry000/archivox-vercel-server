export default async function Home() {
  const res = await fetch('http://localhost:3000/api/demo-layout', { cache: 'no-store' });
  const data = await res.json();

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">ArchiVox (MVP)</h1>
      <p className="text-sm text-gray-600 mt-2">
        Demo route: <code>/api/demo-layout</code>
      </p>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border p-4">
          <h2 className="font-medium">2D Floor Plan (SVG)</h2>
          <div
            className="mt-3 bg-white overflow-auto rounded-lg border p-3"
            dangerouslySetInnerHTML={{ __html: data.svg }}
          />
        </div>

        <div className="rounded-xl border p-4">
          <h2 className="font-medium">AutoCAD Script (.scr)</h2>
          <pre className="mt-3 text-xs whitespace-pre-wrap rounded-lg border bg-gray-50 p-3">
            {data.script}
          </pre>
        </div>

        <div className="rounded-xl border p-4 lg:col-span-2">
          <h2 className="font-medium">Layout JSON</h2>
          <pre className="mt-3 text-xs whitespace-pre-wrap rounded-lg border bg-gray-50 p-3">
            {JSON.stringify(data.layout, null, 2)}
          </pre>
        </div>
      </section>
    </main>
  );
}
