# Extracted Rulebook Content

> **Auto-synced — do not edit manually.**
> Run `python scripts/sync_rulebook_from_extraction.py` to refresh.

| Field | Value |
|-------|-------|
| Upstream source | `C:\Users\jakel\ARCHIVOX_school_notes dataset\_archivox_ruleset_output` |
| Last synced | 2026-04-04 14:14 |
| Sync script | `scripts/sync_rulebook_from_extraction.py` |

## Contents

| File / Dir | Description |
|------------|-------------|
| `RULEBOOK_DRAFT.md` | Full extracted rulebook — C:\Users\jakel\ARCHIVOX_school_notes dataset\_archivox_ruleset_output\RULEBOOK_DRAFT.md |
| `failure_modes_to_checks.md` | Maps architectural failure modes to rule IDs |
| `progress.log` | Log of PDF extraction runs |
| `notes/` | Per-PDF annotation notes (one .md per source document) |
| `processed_pdfs.json` | Registry of processed PDFs with extraction metadata |

## Canonical Sync Workflow

```
# 1. Run extraction (updates upstream _archivox_ruleset_output/)
#    (external script — see detect_new_pdfs.py in upstream dir)

# 2. Mirror into repo
python scripts/sync_rulebook_from_extraction.py

# 3. Optional: remove stale files no longer in upstream
python scripts/sync_rulebook_from_extraction.py --clean

# 4. Commit
git add rules/rulebook/extracted/
git commit -m "chore(rulebook): sync extracted outputs 2026-04-04"
```
