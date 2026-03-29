'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  }

  return (
    <button
      onClick={onLogout}
      disabled={loading}
      className="btn btn-ghost text-xs text-white/60 px-3 py-1.5"
    >
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
