'use client';

import { useRouter } from 'next/navigation';
import { HeroSection } from './components/landing/HeroSection';
import { PromptSection } from './components/landing/PromptSection';

export default function Home() {
  const router = useRouter();

  return (
    <main className="overflow-x-hidden bg-[#060a09]">
      <HeroSection />
      <PromptSection
        onStart={(prompt) => {
          const qs = new URLSearchParams({ prompt, autogen: '1' });
          router.push(`/studio?${qs.toString()}`);
        }}
      />

      <section className="bg-[#0b0f12] px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <h3 className="text-2xl font-semibold tracking-tight text-white">Why ArchiVox</h3>
          <p className="mt-3 text-white/60">
            This is the public landing shell. The Studio experience (2D/3D + outputs) is intentionally unchanged.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { title: '2D + 3D', body: 'Explore the same layout in plan view and a simple 3D massing model.' },
              { title: 'Export', body: 'Get SVG + layout JSON + AutoCAD script output for downstream tooling.' },
              { title: 'Dataset priors', body: 'Build smarter generation with curated plan priors and ingest stats.' }
            ].map((c) => (
              <div key={c.title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm font-semibold text-white">{c.title}</div>
                <div className="mt-2 text-sm text-white/60">{c.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-[#0b0f12] px-6 pb-10 text-center text-xs text-white/35">
        © {new Date().getFullYear()} ArchiVox
      </footer>
    </main>
  );
}
