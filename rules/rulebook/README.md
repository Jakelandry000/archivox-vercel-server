# ArchiVox Rulebook Directory

This directory stores the authoritative rulebook content that maps high-level design
rules to code-level check IDs in `packages/core/src/ruleChecks.ts`.

## Canonical Workflow

```
1. Extraction
   Run the PDF extraction pipeline (outside repo):
     cd "C:/Users/jakel/ARCHIVOX_school_notes dataset/_archivox_ruleset_output"
     python detect_new_pdfs.py
   → Updates RULEBOOK_DRAFT.md, progress.log, processed_pdfs.json, notes/

2. Sync into repo
   python scripts/sync_rulebook_from_extraction.py
   # or with options:
   python scripts/sync_rulebook_from_extraction.py --source /custom/path  # override source
   python scripts/sync_rulebook_from_extraction.py --dry-run              # preview only
   python scripts/sync_rulebook_from_extraction.py --clean                # remove stale files

3. Update manifest (if new rules added)
   Edit rules/rulebook/rulebook_manifest.json to map new R-### to RB-### check IDs.

4. Implement check (if new mapping)
   Add a RuleCheck to packages/core/src/ruleChecks.ts.
   Add a test in packages/core/src/validator.test.ts.

5. Check coverage
   python scripts/rulebook_status.py

6. Commit
   git add rules/rulebook/extracted/ rules/rulebook/rulebook_manifest.json
   git commit -m "chore(rulebook): sync + map YYYY-MM-DD"
```

## File Descriptions

| File / Dir | Purpose |
|------------|---------|
| `RULEBOOK_DRAFT.md` | **Placeholder** — superseded by `extracted/RULEBOOK_DRAFT.md` after first sync. Keep for reference or delete. |
| `rulebook_manifest.json` | Machine-readable mapping: `checkId` (RB-###) → `ruleId` (R-###) → metadata. Source of truth for code ↔ rulebook linkage. |
| `extracted/` | **Auto-synced** outputs from extraction pipeline. Do not edit manually. Run sync script to refresh. |
| `extracted/RULEBOOK_DRAFT.md` | 103 extracted rules from 25 source PDFs across 4 architecture courses. |
| `extracted/failure_modes_to_checks.md` | Maps common architectural failure modes to rule IDs. |
| `extracted/notes/` | Per-PDF annotation notes (one .md per source document). |
| `extracted/processed_pdfs.json` | Registry of processed PDFs with extraction status. |
| `extracted/progress.log` | Log of extraction runs. |
| `extracted/README.md` | Auto-generated metadata (upstream path, sync date). |

## Architecture of the Mapping

```
extracted/RULEBOOK_DRAFT.md       (103 rules: R-001..R-103)
        │
        ▼
rulebook_manifest.json            (R-### → RB-### + metadata)
        │
        ▼
packages/core/src/ruleChecks.ts   (10 implemented checks: RB-001..RB-010)
        │
        ▼
Violation.code + RuleCheck.ruleId (surfaced in reports)
```

## Mapping Confidence Levels

| Level | Meaning |
|-------|---------|
| `high` | Rule text directly motivates the check (e.g., R-021 → RB-004 daylighting) |
| `medium` | Rule overlaps substantially but check is more specific than the rule |
| `low` | No direct match found; best-effort academic analog or residential code convention |
| `null ruleId` | Explicitly unmapped — check is driven by IRC/code, not the extracted academic rulebook |

## Adding a New Rule

1. Add a section to `extracted/RULEBOOK_DRAFT.md` (or sync from extraction).
2. Add an entry to `rulebook_manifest.json` assigning the next available `RB-###` ID.
3. Implement the check in `packages/core/src/ruleChecks.ts` with `id: 'RB-###'` and `ruleId: 'R-###'`.
4. Write a test in `packages/core/src/validator.test.ts`.
5. Run `python scripts/rulebook_status.py` to verify counts.
