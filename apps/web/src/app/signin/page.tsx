'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ScrollShell } from '../components/ScrollShell';

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('dev@archivox.app');
  const [password, setPassword] = useState('archivox-dev');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Login failed');
        return;
      }
      router.push(params.get('next') ?? '/dashboard');
    } catch {
      setError('Network error — is the dev server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="glass rounded-3xl p-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field"
          required
        />
      </div>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className={'btn btn-primary w-full' + (loading ? ' opacity-60 cursor-not-allowed' : '')}
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function SignInPage() {
  return (
    <ScrollShell>
      <div className="flex min-h-screen items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-sm"
        >
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-white/5 border border-white/10 grid place-items-center">
              <div
                className="h-6 w-6 rounded-md"
                style={{ background: 'linear-gradient(135deg, rgba(34,197,94,1), rgba(16,185,129,1))' }}
              />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Sign in to ArchiVox</h1>
            <p className="mt-1 text-xs text-white/40">Dev stub — credentials are pre-filled</p>
          </div>

          <Suspense>
            <SignInForm />
          </Suspense>

          <div className="mt-4 text-center">
            <Link href="/" className="text-xs text-white/40 hover:text-white/60 transition-colors">
              ← Back to home
            </Link>
          </div>
        </motion.div>
      </div>
    </ScrollShell>
  );
}
