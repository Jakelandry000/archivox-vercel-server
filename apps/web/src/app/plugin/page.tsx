import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ArchiVox Rhino Plugin — Download',
  description: 'Generate 3D architectural geometry in Rhino 8 from plain language using the ArchiVox plugin.',
};

/* ── Nav ─────────────────────────────────────────────────────────────── */
function Nav() {
  return (
    <nav className="topnav">
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 28, height: 28, display: 'grid', placeItems: 'center',
          borderRadius: 4, background: 'rgb(var(--text-rgb))', color: 'rgb(var(--bg-rgb))',
          fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 17, lineHeight: 1,
        }}>A</div>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 20, letterSpacing: '-0.01em' }}>
          Archivox
        </span>
      </Link>
      <div style={{ display: 'flex', gap: 4, marginLeft: 32 }}>
        {[['Studio', '/project/demo/editor'], ['Dashboard', '/dashboard'], ['Pricing', '/#pricing']].map(([t, to]) => (
          <Link key={t} href={to} className="btn btn-link"
            style={{ padding: '6px 12px', color: 'rgb(var(--muted-rgb))', fontSize: 13 }}>{t}</Link>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <Link href="/signin" className="btn btn-link" style={{ padding: '6px 12px', color: 'rgb(var(--text-rgb))', fontSize: 13 }}>Sign in</Link>
      <Link href="/auth/signup" className="btn btn-primary">Start drafting →</Link>
    </nav>
  );
}

/* ── Steps ───────────────────────────────────────────────────────────── */
const STEPS = [
  { n: '01', title: 'Set your API key', body: 'Open PowerShell and run: $env:ARCHIVOX_API_KEY = "sk-ant-…" then launch Rhino from the same terminal.' },
  { n: '02', title: 'Install the plugin', body: 'In Rhino go to Tools → Options → Plug-ins → Install… and select the downloaded .rhp file.' },
  { n: '03', title: 'Open the panel', body: 'Type ArchiVoxOpen in the Rhino command bar. The ArchiVox chat panel will appear.' },
  { n: '04', title: 'Describe geometry', body: 'Type a prompt like "add a 12-step staircase, 175mm rise" and hit Enter. Geometry appears in the viewport.' },
];

/* ── Features ────────────────────────────────────────────────────────── */
const FEATURES = [
  { label: 'Staircase', desc: 'Steps, rise, going, tread count' },
  { label: 'Wall', desc: 'Length, thickness, height' },
  { label: 'Column', desc: 'Square section, height' },
  { label: 'Slab', desc: 'Span, depth, thickness' },
  { label: 'Window', desc: 'Opening width and height' },
  { label: 'Door', desc: 'Opening width and height' },
];

/* ── Page ────────────────────────────────────────────────────────────── */
export default function PluginPage() {
  return (
    <>
      <Nav />

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '72px 28px 120px' }}>

        {/* Hero */}
        <div style={{ marginBottom: 64 }}>
          <p className="eyebrow" style={{ marginBottom: 24 }}>Rhino 8 Plugin · v1.0</p>
          <h1 className="display-lg" style={{ marginBottom: 20 }}>
            Generate 3D geometry<br />from <em>plain language</em>
          </h1>
          <p style={{ fontSize: 16, color: 'rgb(var(--muted-rgb))', maxWidth: 520, lineHeight: 1.7, marginBottom: 36 }}>
            ArchiVox brings Claude directly into Rhino 8. Describe any architectural
            element and watch it appear in your viewport — no scripting required.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a
              href="/downloads/ArchiVox.RhinoPlugin.rhp"
              download
              className="btn btn-primary"
              style={{ fontSize: 14, padding: '12px 24px' }}
            >
              Download .rhp — Rhino 8
            </a>
            <a href="#install" className="btn btn-ghost" style={{ fontSize: 14, padding: '12px 24px' }}>
              Install guide ↓
            </a>
          </div>
        </div>

        {/* Requirements strip */}
        <div className="panel-2" style={{ padding: '16px 24px', marginBottom: 64, display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          {[
            ['Rhino', '8.0 or later'],
            ['Platform', 'Windows only'],
            ['API key', 'Anthropic (console.anthropic.com)'],
            ['Model', 'claude-sonnet-4-6'],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="mono-label" style={{ marginBottom: 4 }}>{k}</div>
              <div style={{ fontSize: 13, color: 'rgb(var(--text-rgb))' }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Install steps */}
        <section id="install" style={{ marginBottom: 80 }}>
          <p className="eyebrow" style={{ marginBottom: 32 }}>Installation</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {STEPS.map(({ n, title, body }) => (
              <div key={n} className="panel" style={{ padding: 24 }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-fg)',
                  letterSpacing: '0.1em', marginBottom: 12,
                }}>{n}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginBottom: 10, lineHeight: 1.15 }}>{title}</div>
                <div style={{ fontSize: 13, color: 'rgb(var(--muted-rgb))', lineHeight: 1.6 }}>{body}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Supported geometry */}
        <section style={{ marginBottom: 80 }}>
          <p className="eyebrow" style={{ marginBottom: 32 }}>Supported geometry</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {FEATURES.map(({ label, desc }) => (
              <div key={label} className="panel-2" style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 12, color: 'rgb(var(--muted-rgb))', lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Code example */}
        <section style={{ marginBottom: 80 }}>
          <p className="eyebrow" style={{ marginBottom: 32 }}>Example prompts</p>
          <div className="panel" style={{ padding: 28 }}>
            {[
              'add a 12-step staircase, 175mm rise, 280mm going',
              'add a 6000mm × 200mm × 3000mm concrete wall',
              'add a 400mm square column, 3200mm tall',
              'add a 300mm × 200mm window opening',
            ].map((p) => (
              <div key={p} style={{
                fontFamily: 'var(--font-mono)', fontSize: 13,
                color: 'var(--accent-fg)', padding: '10px 0',
                borderBottom: '1px solid var(--border-subtle)',
              }}>
                <span style={{ color: 'rgb(var(--muted-2-rgb))', marginRight: 12 }}>›</span>{p}
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div style={{
          textAlign: 'center', padding: '56px 28px',
          background: 'rgb(var(--panel-rgb))',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <h2 className="display-md" style={{ marginBottom: 12 }}>Ready to build?</h2>
          <p style={{ color: 'rgb(var(--muted-rgb))', marginBottom: 32, fontSize: 14 }}>
            Download the plugin, add your Anthropic API key, and start generating.
          </p>
          <a
            href="/downloads/ArchiVox.RhinoPlugin.rhp"
            download
            className="btn btn-primary"
            style={{ fontSize: 14, padding: '12px 28px' }}
          >
            Download ArchiVox.RhinoPlugin.rhp
          </a>
        </div>

      </main>
    </>
  );
}
