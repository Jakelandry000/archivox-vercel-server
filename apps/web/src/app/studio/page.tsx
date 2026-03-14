import { Suspense } from 'react';
import StudioClient from './StudioClient';

// This route depends on client-side search params + interactive canvases.
export const dynamic = 'force-dynamic';

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-[#0b0f12] text-white">
          <div className="text-sm text-white/60">Loading Studio…</div>
        </div>
      }
    >
      <StudioClient />
    </Suspense>
  );
}
