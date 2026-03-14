'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useScroll, useTransform } from 'framer-motion';

const ARCH_IMAGES = [
  {
    src: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1280&h=720&fit=crop&crop=entropy&auto=format&q=80',
    alt: 'Modern glass skyscraper',
    scale: [1, 4] as [number, number],
    cls: ''
  },
  {
    src: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800&h=800&fit=crop&crop=entropy&auto=format&q=80',
    alt: 'Urban architecture',
    scale: [1, 5] as [number, number],
    cls: '[&>div]:!-top-[30vh] [&>div]:!left-[5vw] [&>div]:!h-[30vh] [&>div]:!w-[35vw]'
  },
  {
    src: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=600&fit=crop&crop=entropy&auto=format&q=80',
    alt: 'Minimalist interior',
    scale: [1, 6] as [number, number],
    cls: '[&>div]:!-top-[10vh] [&>div]:!-left-[25vw] [&>div]:!h-[45vh] [&>div]:!w-[20vw]'
  },
  {
    src: 'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=800&h=800&fit=crop&crop=entropy&auto=format&q=80',
    alt: 'Architectural detail',
    scale: [1, 5] as [number, number],
    cls: '[&>div]:!left-[27.5vw] [&>div]:!h-[25vh] [&>div]:!w-[25vw]'
  },
  {
    src: 'https://images.unsplash.com/photo-1516455590571-18256e5bb9ff?w=1000&h=700&fit=crop&crop=entropy&auto=format&q=80',
    alt: 'Modern home exterior',
    scale: [1, 6] as [number, number],
    cls: '[&>div]:!top-[27.5vh] [&>div]:!left-[5vw] [&>div]:!h-[25vh] [&>div]:!w-[20vw]'
  },
  {
    src: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1000&h=700&fit=crop&crop=entropy&auto=format&q=80',
    alt: 'Luxury home interior',
    scale: [1, 8] as [number, number],
    cls: '[&>div]:!top-[27.5vh] [&>div]:!-left-[22.5vw] [&>div]:!h-[25vh] [&>div]:!w-[30vw]'
  },
  {
    src: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=800&fit=crop&crop=entropy&auto=format&q=80',
    alt: 'Floor plan drawing',
    scale: [1, 9] as [number, number],
    cls: '[&>div]:!top-[22.5vh] [&>div]:!left-[25vw] [&>div]:!h-[15vh] [&>div]:!w-[15vw]'
  }
];

function ParallaxImage({
  src,
  alt,
  scaleRange,
  cls,
  scrollYProgress
}: {
  src: string;
  alt: string;
  scaleRange: [number, number];
  cls: string;
  scrollYProgress: ReturnType<typeof useScroll>['scrollYProgress'];
}) {
  const scale = useTransform(scrollYProgress, [0, 1], scaleRange);
  return (
    <motion.div style={{ scale }} className={`absolute top-0 flex h-full w-full items-center justify-center ${cls}`}>
      <div className="relative h-[25vh] w-[25vw]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="25vw"
          className="rounded-xl object-cover opacity-50"
        />
      </div>
    </motion.div>
  );
}

export function HeroSection() {
  const container = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: container,
    offset: ['start start', 'end end']
  });

  const titleY = useTransform(scrollYProgress, [0, 0.35], [0, -100]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.35], [1, 0]);
  const bgOpacity = useTransform(scrollYProgress, [0.7, 1], [0, 1]);

  return (
    <div ref={container} className="relative h-[350vh]">
      <div className="sticky top-0 h-screen overflow-hidden bg-[#060a09]">
        {ARCH_IMAGES.map((img) => (
          <ParallaxImage
            key={img.src}
            src={img.src}
            alt={img.alt}
            scaleRange={img.scale}
            cls={img.cls}
            scrollYProgress={scrollYProgress}
          />
        ))}

        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              'linear-gradient(to bottom, rgba(6,10,9,0.85) 0%, rgba(6,10,9,0.3) 40%, rgba(6,10,9,0.5) 70%, rgba(6,10,9,0.95) 100%)'
          }}
        />

        <motion.div style={{ opacity: bgOpacity }} className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-48">
          <div className="h-full w-full" style={{ background: 'linear-gradient(to bottom, transparent, #060a09)' }} />
        </motion.div>

        <motion.div
          style={{ y: titleY, opacity: heroOpacity }}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center px-6 text-center"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="mb-6"
          >
            <div className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/8 px-4 py-2 backdrop-blur-md">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M1.5 9.5L5.5 1.5L9.5 9.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 6.5H8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <span className="text-xs font-semibold uppercase tracking-widest text-white/80">ArchiVox — AI Architectural Copilot</span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                BETA
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 1, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mb-4"
          >
            <h1
              className="select-none font-black leading-none tracking-tighter"
              style={{
                fontSize: 'clamp(5rem, 16vw, 14rem)',
                background: 'linear-gradient(135deg, #ffffff 0%, #a7f3d0 40%, #34d399 70%, #059669 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 0 60px rgba(52,211,153,0.25))'
              }}
            >
              ArchiVox
            </h1>
          </motion.div>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mb-8 max-w-xl text-lg font-light leading-relaxed tracking-wide text-white/50 md:text-2xl"
          >
            Generate professional floor plans.
            <br />
            <span className="text-white/75">Explore in 2D &amp; 3D. Instantly.</span>
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.6 }}
            className="mb-12 flex flex-wrap justify-center gap-2"
          >
            {[
              { icon: '⚡', label: 'AI-Generated Layouts' },
              { icon: '📐', label: '2D Floor Plans' },
              { icon: '🏛️', label: '3D Dollhouse View' },
              { icon: '📤', label: 'Export SVG / JSON' }
            ].map(({ icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-white/60 backdrop-blur-sm"
              >
                <span>{icon}</span>
                <span>{label}</span>
              </div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="flex flex-col items-center gap-2 text-white/25"
          >
            <span className="text-[11px] uppercase tracking-[0.3em]">Scroll to start</span>
            <motion.div animate={{ y: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M10 4v12M6 12l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.div>
          </motion.div>
        </motion.div>

        <div
          className="pointer-events-none absolute inset-0 z-[5] opacity-[0.035]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,1) 2px, rgba(255,255,255,1) 4px)'
          }}
        />
      </div>
    </div>
  );
}
