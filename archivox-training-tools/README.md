# archivox-training-tools

Standalone CLI for ingesting architectural floorplan datasets into a canonical
internal corpus for downstream ML/evaluation.

**This package is training-only.  It is not wired into the Next.js application
and its outputs must never be placed under web-served directories.**

---

## Prerequisites

- Node.js 18+
- npm (or pnpm)

## Install

```bash
cd archivox-training-tools
npm install
```

## Build

```bash
npm run build
```

Compiled output goes to `dist/`.

## Test

```bash
npm test
```

## CLI usage

### ingest

Ingest source files (DXF, PDF, images) into a corpus directory.

```bash
node dist/cli.js ingest \
  --input ./raw-plans \
  --corpus /data/archivox-corpus \
  --runTag my-first-run

# From a ZIP archive
node dist/cli.js ingest \
  --input ./floorplans.zip \
  --corpus /data/archivox-corpus

# Dry run (discover + manifest, no writes)
node dist/cli.js ingest \
  --input ./raw-plans \
  --corpus /data/archivox-corpus \
  --dryRun

# Limit to first 20 files
node dist/cli.js ingest \
  --input ./raw-plans \
  --corpus /data/archivox-corpus \
  --maxFiles 20
```

### validate

Re-run validation over an existing corpus.

```bash
node dist/cli.js validate --corpus /data/archivox-corpus
```

### summarize

Print a summary of the corpus (plan counts by type, label coverage, warnings).

```bash
node dist/cli.js summarize --corpus /data/archivox-corpus
```

---

## Corpus layout

```
corpus/
  manifests/
    ingest-<run-id>.json       — versioned run manifest
  plans/
    <sha256-plan-id>/
      source/
        original.<ext>         — copy of the original source file
      derived/
        plan.json              — PlanSpec v1
        graph.json             — GraphSpec v1
        metrics.json           — per-plan validation metrics
        preview.png            — (optional, when implemented)
```

`plan-id` is the SHA-256 of the source file bytes, making it stable and
deterministic across re-runs with the same input.

---

## Supported input formats

| Format | Extraction | Status |
|--------|------------|--------|
| DXF    | Text entities, closed polylines, wall segments | **Full** |
| PDF    | Checksum + metadata | Stub (OCR not yet wired) |
| PNG/JPG/WebP | Checksum + metadata | Stub (vision model not yet wired) |
| ZIP    | Unpacked to temp, contents processed | **Full** |

---

## Dependency notes

**dxf-parser** (v1.x): Parses DXF ASCII/binary files into an entity tree
(LWPOLYLINE, LINE, TEXT, MTEXT).  Chosen for its broad entity support and
active maintenance.  Limitation: does not expand INSERT/BLOCK references or
parse HATCH entities.

**adm-zip** (v0.5.x): Synchronous ZIP extraction. Chosen over `unzipper`
(async-only) for simplicity in the sequential ingestion pipeline.

---

## Next steps

### OCR integration

1. Install `pdf2pic` (or call `pdftocairo`) to rasterise PDF pages.
2. Pass each raster through a `Tesseract.js` or cloud-OCR implementation.
3. Implement `OcrProvider` interface in `src/parsers/pdf.ts` and register via
   `setPdfOcrProvider()`.

### Image room segmentation

1. Use `sharp` to normalise image resolution.
2. Pass through a layout-detection model (e.g. a fine-tuned LayoutLM or
   Detectron2 model) to produce polygon annotations.
3. Feed results into the existing label-association pipeline.

### Embedding generation

1. After label extraction stabilises, add a `vectorise` subcommand.
2. Call an embedding API (e.g. OpenAI `text-embedding-3-small`) on normalised
   room labels + plan metadata.
3. Store embeddings alongside `derived/` as `embeddings.json`.

### Dataset versioning strategy

- Each ingest run already emits a versioned manifest (`ingest-<run-id>.json`)
  with SHA-256 checksums of every source file and the config used.
- For a full dataset version: tag git + record the manifest file path.
- Consider adopting DVC (`dvc add corpus/`) for large binary tracking on top
  of this manifest layer.
