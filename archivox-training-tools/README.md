# archivox-training-tools

Standalone CLI for ingesting training data into ArchiVox corpora.
This package is **not** wired into the Next.js app.

## Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)

## Setup

```bash
pnpm -C archivox-training-tools install
```

## Build

```bash
pnpm -C archivox-training-tools build
```

## Run

```bash
# Show help
pnpm -C archivox-training-tools start -- --help

# Ingest a corpus (stub — prints parsed args)
pnpm -C archivox-training-tools start -- ingest --input ./data --corpus my-corpus
```

## Development

Source lives in `src/cli.ts`. Compiled output goes to `dist/`.

Run `pnpm build` after any changes.
