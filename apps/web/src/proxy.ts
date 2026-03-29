import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, parseSession } from '@/lib/auth/session';

export function proxy(req: NextRequest) {
  const value = req.cookies.get(SESSION_COOKIE)?.value;
  if (!value || !parseSession(value)) {
    const url = req.nextUrl.clone();
    url.pathname = '/signin';
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
