import Link from 'next/link';
import { ScrollShell } from './components/ScrollShell';
import { HeroSection } from '../components/HeroSection';
import { NarrativeSection } from '../components/NarrativeSection';
import { FeatureStrip } from '../components/FeatureStrip';

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
        <HeroSection />

        {/* ── Narrative journey ───────────────────────────────────────────── */}
        <NarrativeSection />

        {/* ── Feature strip ───────────────────────────────────────────────── */}
        <FeatureStrip />

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
