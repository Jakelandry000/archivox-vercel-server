'use client';

import { useEffect, useState } from 'react';

const LINES = [
  '> curved staircase — 12 steps, 900mm rise,',
  '  900mm tread, glass balustrade. Anchor to',
  '  level-02 slab, mirror to entry hall. Place',
  '  flush with wall WS-04, layer A-STAIR-01.',
];
const FULL = LINES.join('\n');

export function TypedPrompt() {
  const [n, setN] = useState(0);

  useEffect(() => {
    if (n >= FULL.length) return;
    const id = setTimeout(() => setN(n + 1), n < 2 ? 400 : 14 + Math.random() * 26);
    return () => clearTimeout(id);
  }, [n]);

  return (
    <div style={{
      background: 'rgb(var(--panel-2-rgb))', padding: 18, borderRadius: 10,
      fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.55,
      minHeight: 130, position: 'relative', border: '1px solid var(--border)',
    }}>
      <div style={{ position: 'absolute', top: 12, right: 14 }}>
        <span className="mono-label" style={{ fontSize: 9.5 }}>PROMPT · #A77</span>
      </div>
      <pre style={{ margin: 0, marginTop: 18, whiteSpace: 'pre-wrap', color: 'rgb(var(--text-rgb))' }}>
        {FULL.slice(0, n)}
        <span style={{
          display: 'inline-block', width: 7, height: 13,
          background: 'var(--accent-fg)', marginLeft: 1,
          verticalAlign: '-2px', animation: 'blink 1s steps(2) infinite',
        }} />
      </pre>
    </div>
  );
}
