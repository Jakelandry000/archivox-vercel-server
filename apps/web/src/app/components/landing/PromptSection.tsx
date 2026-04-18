'use client';

import { useCallback, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';

const EXAMPLE_PROMPTS = [
  '3 bedroom family home with open kitchen',
  'Minimalist studio apartment',
  'Modern 2-bedroom with double garage',
  'Community hospital with 4 wards',
  'Open-plan tech office',
  'Small beach house, minimal'
];

export function PromptSection({
  onStart
}: {
  onStart: (prompt: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: '-10%' });

  const [prompt, setPrompt] = useState('');

  const handleSubmit = useCallback(() => {
    if (!prompt.trim()) return;
    onStart(prompt.trim());
  }, [onStart, prompt]);

  const containerVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.7, ease: 'easeOut' as const, staggerChildren: 0.08 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <div
      ref={ref}
      className="flex min-h-screen items-center justify-center px-6 py-20"
      style={{ background: 'linear-gradient(to bottom, #060a09 0%, #0a1628 50%, #0f172a 100%)' }}
    >
      <motion.div variants={containerVariants} initial="hidden" animate={inView ? 'visible' : 'hidden'} className="w-full max-w-2xl">
        <motion.div variants={itemVariants} className="mb-10 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Studio</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Describe your space</h2>
          <p className="mt-2 text-base text-slate-400">Start from a single prompt. You’ll refine and explore in the 2D/3D studio.</p>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all duration-300 focus-within:border-emerald-500/50"
        >
          <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-r from-emerald-500/20 via-transparent to-teal-500/20 opacity-0 blur-sm transition-opacity duration-500 focus-within:opacity-100" />

          <div className="relative p-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="e.g. Open-plan 3 bedroom family home with double garage and large kitchen island..."
              rows={4}
              className="min-h-[96px] w-full resize-none overflow-y-auto bg-transparent text-sm leading-relaxed text-white placeholder:text-slate-500 focus:outline-none"
            />

            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <div className="text-xs text-slate-500">Press <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-300">Enter</span> to start</div>
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                className={
                  'flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-all ' +
                  (prompt.trim()
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400'
                    : 'cursor-not-allowed bg-white/10 text-slate-500')
                }
              >
                <Sparkles className="h-3.5 w-3.5" />
                Open Studio
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="mt-4 flex flex-wrap justify-center gap-2">
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex}
              onClick={() => setPrompt(ex)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 transition-all hover:border-emerald-500/30 hover:bg-white/10 hover:text-white"
            >
              {ex}
            </button>
          ))}
        </motion.div>

        <motion.div variants={itemVariants} className="mt-12 flex justify-center">
          <div className="flex flex-col items-center gap-2 text-slate-600">
            <span className="text-xs uppercase tracking-[0.2em]">Scroll to learn more</span>
            <motion.div animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}>
              <ArrowRight className="h-4 w-4 rotate-90" />
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
