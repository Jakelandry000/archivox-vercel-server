import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, signSession } from '@/lib/auth/session';

// Dev stub credentials — replace with real identity provider before production.
const DEV_EMAIL = 'dev@archivox.app';
const DEV_PASSWORD = 'archivox-dev';

export async function POST(req: NextRequest) {
  const body = await req.json() as { email?: string; password?: string };

  if (body.email !== DEV_EMAIL || body.password !== DEV_PASSWORD) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = signSession({
    user: { id: 'dev-user-1', email: DEV_EMAIL, name: 'Dev User' },
    createdAt: Date.now(),
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
