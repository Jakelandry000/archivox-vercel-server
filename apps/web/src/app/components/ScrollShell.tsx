'use client';

import { PropsWithChildren, useMemo } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

export function ScrollShell({ children }: PropsWithChildren) {
  const { scrollYProgress } = useScroll();
  const y1 = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, -120]);

  const reduce = useReducedMotion();

  const bg = useMemo(() => {
    return (
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-grid vignette opacity-100" />
        <motion.div
          style={reduce ? undefined : { y: y2 }}
          className="absolute -top-24 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full"
        >
          <div className="h-full w-full rounded-full blur-3xl"
            style={{
              background:
                'radial-gradient(circle at 30% 30%, rgba(34,197,94,0.30), rgba(16,185,129,0.12) 45%, rgba(0,0,0,0) 70%)'
            }}
          />
        </motion.div>
        <motion.div
          style={reduce ? undefined : { y: y1 }}
          className="absolute -bottom-40 right-[-80px] h-[520px] w-[520px] rounded-full"
        >
          <div className="h-full w-full rounded-full blur-3xl"
            style={{
              background:
                'radial-gradient(circle at 60% 60%, rgba(16,185,129,0.22), rgba(34,197,94,0.10) 40%, rgba(0,0,0,0) 70%)'
            }}
          />
        </motion.div>
      </div>
    );
  }, [reduce, y1, y2]);

  return (
    <div className="min-h-screen">
      {bg}
      {children}
    </div>
  );
}
