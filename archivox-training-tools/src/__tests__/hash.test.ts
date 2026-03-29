import { describe, it, expect } from 'vitest';
import { sha256Buffer } from '../utils/hash';

describe('sha256Buffer', () => {
  it('produces the known SHA-256 hex for empty bytes', () => {
    // SHA-256("") is a well-known constant
    expect(sha256Buffer(Buffer.alloc(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('produces the known SHA-256 hex for "hello"', () => {
    // SHA-256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(sha256Buffer(Buffer.from('hello', 'utf-8'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('same bytes always produce the same plan_id (determinism)', () => {
    const buf = Buffer.from('archivox test bytes', 'utf-8');
    expect(sha256Buffer(buf)).toBe(sha256Buffer(buf));
  });

  it('returns a 64-character hex string (full 256 bits)', () => {
    const hash = sha256Buffer(Buffer.from('test', 'utf-8'));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
