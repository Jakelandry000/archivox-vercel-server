---
type: project
project: archivox
status: active
tags: [repo-map, blast-radius, dependencies, archivox]
related:
date: 2026-04-10
---
# ArchiVox Repo Map

Last updated: 2026-04-10
Regenerate when: cross-package edit planned, map > 7 days old, IMPACT task

## Package Dependency Tree

- apps/web (@archivox/web) → @archivox/core, @archivox/db, @archivox/engines, @archivox/generator
- packages/engines (@archivox/engines) → @archivox/core
- packages/generator (@archivox/generator) → @archivox/core
- packages/db (@archivox/db) → @prisma/client, @prisma/adapter-pg, pg (no internal @archivox deps)
- packages/core (@archivox/core) → no dependencies (leaf package)

## High-Risk Files (wide blast radius)

- packages/core/src/index.ts — exported root of @archivox/core; consumed by engines, generator, and web. Any breaking change here cascades to all three.
- packages/core/src/layout.ts — likely shared layout types; changes affect anything that renders or validates layouts.
- packages/core/src/rules.ts + ruleChecks.ts — shared rule logic consumed wherever validation runs.
- packages/core/src/validator.ts — shared validator; engines and generator likely depend on this indirectly via core.
- packages/db/prisma/schema.prisma — any model change requires `prisma migrate dev` + regenerating the client; touches all DB queries in web.
- apps/web/src/app/layout.tsx — root Next.js layout; wraps every page. Changes affect the entire app.

## Entry Points

- apps/web: `src/app/layout.tsx` (root layout), `src/app/page.tsx` (home route)
- packages/core: `src/index.ts`
- packages/db: `src/index.ts`
- packages/engines: `src/index.ts`
- packages/generator: `src/index.ts`

## Cross-Cutting Concerns

| Change | What else must be updated |
|---|---|
| Edit packages/core/src/index.ts exports | engines, generator, and web — rebuild all three |
| Add/remove/rename a Prisma model in schema.prisma | Run `prisma migrate dev`, run `prisma generate`, update any query code in apps/web |
| Change shared type in packages/core/src/layout.ts | engines and generator may need updates; web rendering may break |
| Change packages/core/src/validator.ts API | Audit engines and generator for call-site breakage |
| Add a new route or API handler in apps/web | Check middleware at src/proxy.ts; may need route guard updates |
| Bump Next.js version in apps/web | Check @archivox/* package peer deps and Vercel deployment config |

## How to Regenerate This Map

Ask Claude Code:
"Regenerate the repo map at archivox-vault/repo-index/archivox-map.md
and archivox-vercel-server/repo-index.md.
Scan the packages/ and apps/ directories and update all sections."
