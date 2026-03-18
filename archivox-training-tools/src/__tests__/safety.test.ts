import { describe, it, expect } from 'vitest';
import { assertSafeOutputPath } from '../safety';

describe('assertSafeOutputPath', () => {
  it('throws when corpus path contains "public"', () => {
    expect(() => assertSafeOutputPath('/home/user/project/public/corpus')).toThrow('[safety]');
  });

  it('throws when corpus path contains ".next"', () => {
    expect(() => assertSafeOutputPath('/home/user/project/.next/data')).toThrow('[safety]');
  });

  it('throws when corpus path contains "dist"', () => {
    expect(() => assertSafeOutputPath('/home/user/project/dist/corpus')).toThrow('[safety]');
  });

  it('throws when corpus path contains "build"', () => {
    expect(() => assertSafeOutputPath('/home/user/app/build/corpus')).toThrow('[safety]');
  });

  it('does not throw for a safe private path', () => {
    expect(() => assertSafeOutputPath('/home/user/corpus')).not.toThrow();
  });

  it('does not throw for a safe data directory', () => {
    expect(() => assertSafeOutputPath('/data/archivox-corpus')).not.toThrow();
  });
});
