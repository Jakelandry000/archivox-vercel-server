import Link from 'next/link';
import { ScrollShell } from './components/ScrollShell';
import { HeroContent } from '../components/HeroContent';
import { NarrativeSection } from '../components/NarrativeSection';

export default function Landing() {
  return (
    <ScrollShell>
      <div className="flex flex-col">
        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        <nav className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-8 py-5">
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-xl grid place-items-center"
              style={{
                background: 'rgba(18,26,22,0.8)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div
                className="h-4 w-4 rounded-md"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(34,197,94,1), rgba(16,185,129,1))',
                }}
              />
            </div>
            <span className="text-base font-semibold tracking-tight">ArchiVox</span>
          </div>
          <Link href="/signin" className="btn btn-ghost text-sm" style={{ color: 'rgba(235,244,238,0.8)' }}>
            Sign in →
          </Link>
        </nav>

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="relative min-h-screen flex items-center justify-center px-6 pt-24 pb-16">
          <HeroContent />
        </section>

        {/* ── Scroll indicator ────────────────────────────────────────────── */}
        <div
          className="flex justify-center pb-12 -mt-8"
          aria-hidden="true"
        >
          <div
            className="flex flex-col items-center gap-1.5 text-[10px] font-mono tracking-widest uppercase"
            style={{ color: 'rgba(34,197,94,0.35)' }}
          >
            <span>scroll</span>
            <span className="h-8 w-px" style={{ background: 'linear-gradient(to bottom, rgba(34,197,94,0.35), transparent)' }} />
          </div>
        </div>

        {/* ── Narrative journey ───────────────────────────────────────────── */}
        <NarrativeSection />

        {/* ── Feature strip ───────────────────────────────────────────────── */}
        <main
          className="flex flex-col items-center px-6 py-16 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.05)' }}
        >
          <p
            className="text-xs font-semibold tracking-widest uppercase mb-10"
            style={{ color: 'rgba(34,197,94,0.6)' }}
          >
            What you get
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 max-w-3xl w-full">
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
                <div
                  className="text-sm font-semibold mb-1.5"
                  style={{ color: 'rgba(235,244,238,0.9)' }}
                >
                  {f.title}
                </div>
                <div
                  className="text-xs leading-relaxed"
                  style={{ color: 'rgba(235,244,238,0.55)' }}
                >
                  {f.body}
                </div>
              </div>
            ))}
          </div>
        </main>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <footer
          className="py-6 text-center text-xs"
          style={{ color: 'rgba(235,244,238,0.3)' }}
        >
          © {new Date().getFullYear()} ArchiVox
        </footer>
      </div>
    </ScrollShell>
  );
}
