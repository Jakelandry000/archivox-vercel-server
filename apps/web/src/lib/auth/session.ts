/**
 * Dev-stub session encoding. Uses plain base64 JSON — NOT cryptographically signed.
 * Replace with HMAC (crypto.subtle) or iron-session before any production deployment.
 */
import type { Session } from './types';

export const SESSION_COOKIE = '__av_session';

/** Encode a session into a cookie value (edge-safe: uses btoa). */
export function signSession(session: Session): string {
  return btoa(JSON.stringify(session));
}

/** Decode and validate a cookie value. Returns null if malformed. */
export function parseSession(value: string): Session | null {
  try {
    const json = atob(value);
    const parsed = JSON.parse(json) as Session;
    // Minimal structural validation
    if (!parsed?.user?.id || !parsed?.user?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}
