---
date: 2026-04-15
task: cc-014
topic: 3D rendering — Spline + Lenis integration
status: superseded
superseded_by: cc-039
superseded_date: 2026-04-17
---

# 3D Rendering: Spline + Lenis Integration (SUPERSEDED)

> **Superseded by cc-039 (2026-04-17).** Spline dependency removed.
> `SplineHero.tsx` replaced by `HeroSection.tsx` which uses the built-in
> `BlueprintBackground` SVG (Framer Motion pathLength) as the sole visual layer.
> `@splinetool/react-spline` removed from `apps/web/package.json`.

## Summary

Phase 1 of 3D rendering for ArchiVox — ambient hero scenes (Spline) with smooth scroll (Lenis).
Phase 2 (if needed) adds React Three Fiber for procedural/code-driven 3D.

## Architecture

```
layout.tsx
└── SmoothScroll          ← Lenis RAF loop; client component
    └── page / route
        └── ScrollShell   ← Framer Motion parallax blobs
            └── SplineHero (optional per page)   ← Spline canvas
```

### Library roles

| Library | Role | Decision Rule |
|---|---|---|
| Lenis `^1.3.21` | Global smooth scroll — every page | Always present via layout.tsx |
| Framer Motion `^12.23.12` | UI animation, parallax blobs | Non-3D motion |
| `@splinetool/react-spline` `^4.1.0` | Visually-designed 3D scenes | Pre-authored in spline.design |
| React Three Fiber (not installed) | Code-driven 3D geometry | Only when Spline is insufficient |

## Components

### `SmoothScroll` (`apps/web/src/components/SmoothScroll.tsx`)

Client component. Starts a Lenis `requestAnimationFrame` loop on mount; destroys it on unmount.
Wired into `apps/web/src/app/layout.tsx` — every page inherits smooth scroll automatically.

### `SplineHero` (`apps/web/src/components/SplineHero.tsx`)

Server-compatible (uses `/next` import for async RSC rendering).
Props: `scene` (required `.splinecode` URL), `className` (optional), `onLoad` (optional `Application` callback).

Container design:
- `position: relative` + `overflow: hidden` — prevents canvas bleed on resize
- `background: rgb(12 16 14)` — design system `--bg` colour shows while scene loads
- Spline canvas is `absolute inset-0` — fills container

Not wired to any page yet. A Spline scene URL is needed before use.

## Design System Alignment

- Background fallback: `rgb(12 16 14)` matches `--bg` token — no flash of wrong colour
- No custom fonts or Tailwind colour classes introduced
- No Framer Motion used inside 3D components — motion libraries kept separate
- `prefers-reduced-motion` note: Spline scenes are inherently animated; future work should wrap `SplineHero` in a reduced-motion conditional or substitute a static image when the media query fires

## What Is Not Done (by design)

- No Spline scene created yet — a designer must author the scene in spline.design and provide the URL
- React Three Fiber not installed — add only when a feature requires procedural 3D
- `prefers-reduced-motion` fallback for SplineHero not implemented (deferred; complexity not yet justified)

## Next Steps

1. [parallel-ok] Author Spline hero scene in spline.design; export `.splinecode` URL
2. [sequential] Wire `<SplineHero scene="..." />` into `apps/web/src/app/page.tsx` hero section
3. [parallel-ok] Install R3F when/if a feature requires code-driven 3D:
   `npm install @react-three/fiber three @react-three/drei --workspace @archivox/web`
