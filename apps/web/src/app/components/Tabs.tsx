'use client';

import { PropsWithChildren, useMemo } from 'react';

export type TabKey = 'plan' | '3d' | 'cad' | 'json' | 'validation';

export function Tabs({
  active,
  onChange,
  children
}: PropsWithChildren<{ active: TabKey; onChange: (k: TabKey) => void }>) {
  const items = useMemo(
    () =>
      [
        { key: 'plan', label: '2D Plan' },
        { key: '3d', label: '3D Plan' },
        { key: 'cad', label: 'AutoCAD (.scr)' },
        { key: 'json', label: 'Layout JSON' },
        { key: 'validation', label: 'Validation' }
      ] as const,
    []
  );

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {items.map((it) => {
          const is = it.key === active;
          return (
            <button
              key={it.key}
              onClick={() => onChange(it.key)}
              role="tab"
              aria-selected={is}
              className={
                'btn ' +
                (is
                  ? 'btn-primary shadow-[0_12px_40px_rgba(34,197,94,0.12)]'
                  : 'btn-ghost text-white/90')
              }
              type="button"
            >
              {it.label}
            </button>
          );
        })}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}
