import Link from 'next/link';
import { ScrollShell } from './components/ScrollShell';

export default function Landing() {
  return (
    <ScrollShell>
      <div className="flex min-h-screen flex-col">
        {/* Nav */}
        <nav className="flex items-center justify-between px-8 py-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 grid place-items-center">
              <div
                className="h-4 w-4 rounded-md"
                style={{ background: 'linear-gradient(135deg, rgba(34,197,94,1), rgba(16,185,129,1))' }}
              />
            </div>
            <span className="text-base font-semibold tracking-tight">ArchiVox</span>
          </div>
          <Link href="/signin" className="btn btn-ghost text-sm text-white/80">
            Sign in →
          </Link>
        </nav>

        {/* Hero */}
        <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Early access
            </div>

            <h1 className="text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
              Architectural{' '}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(135deg, rgba(34,197,94,1), rgba(16,185,129,1))' }}
              >
                layouts
              </span>
              <br />
              from plain language.
            </h1>

            <p className="mt-6 text-lg text-white/60 leading-relaxed">
              Describe a home in plain English. ArchiVox generates a 2D floor plan, AutoCAD script, and a full
              validation report — instantly, with no token cost.
            </p>

            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link href="/signin" className="btn btn-primary px-8 py-3 text-base">
                Get started
              </Link>
              <Link href="/generator" className="btn btn-ghost px-8 py-3 text-base text-white/80">
                Try demo ↗
              </Link>
            </div>
          </div>

          {/* Feature strip */}
          <div className="mt-24 grid grid-cols-1 gap-4 sm:grid-cols-3 max-w-3xl w-full">
            {[
              {
                title: '2D Floor Plans',
                body: 'SVG floor plans generated from constraint-driven room packing.',
              },
              {
                title: 'AutoCAD Scripts',
                body: 'Ready-to-run .scr files for every layout, no manual drafting.',
              },
              {
                title: 'Validation + IBC',
                body: 'Automatic overlap detection, coverage scoring, and code checks.',
              },
            ].map((f) => (
              <div key={f.title} className="glass rounded-2xl p-5 text-left">
                <div className="text-sm font-semibold text-white/90">{f.title}</div>
                <div className="mt-1.5 text-xs text-white/55 leading-relaxed">{f.body}</div>
              </div>
            ))}
          </div>
        </main>

        <footer className="py-6 text-center text-xs text-white/30">
          © {new Date().getFullYear()} ArchiVox
        </footer>
      </div>
    </ScrollShell>
  );
}
