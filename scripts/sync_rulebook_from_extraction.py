#!/usr/bin/env python3
"""
sync_rulebook_from_extraction.py

Copies (mirrors) extraction outputs from an upstream directory into
rules/rulebook/extracted/ inside the ArchiVox repo.

Default upstream: C:/Users/jakel/ARCHIVOX_school_notes dataset/_archivox_ruleset_output

Usage:
  python scripts/sync_rulebook_from_extraction.py
  python scripts/sync_rulebook_from_extraction.py --source /path/to/output
  python scripts/sync_rulebook_from_extraction.py --dry-run
  python scripts/sync_rulebook_from_extraction.py --clean
"""

import argparse
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

# ── Defaults ──────────────────────────────────────────────────────────────────

DEFAULT_SOURCE = Path("C:/Users/jakel/ARCHIVOX_school_notes dataset/_archivox_ruleset_output")

# Relative to this script's repo root (two levels up from scripts/).
REPO_ROOT = Path(__file__).resolve().parent.parent
DEST_DIR = REPO_ROOT / "rules" / "rulebook" / "extracted"

# Files/dirs to sync from the upstream source.
SYNC_TARGETS = [
    "RULEBOOK_DRAFT.md",
    "failure_modes_to_checks.md",
    "progress.log",
    "notes",
    "processed_pdfs.json",
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg: str) -> None:
    print(msg)


def copy_item(src: Path, dst: Path, dry_run: bool) -> None:
    """Copy a file or directory tree from src to dst."""
    if src.is_dir():
        if dry_run:
            log(f"  [dry-run] copytree {src} -> {dst}")
        else:
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
            log(f"  copied dir  {src.name}/ -> {dst.relative_to(REPO_ROOT)}")
    elif src.is_file():
        if dry_run:
            log(f"  [dry-run] copy {src} -> {dst}")
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            log(f"  copied file {src.name} -> {dst.relative_to(REPO_ROOT)}")
    else:
        log(f"  [skip] not found upstream: {src}")


def write_readme(dest_dir: Path, source: Path, dry_run: bool) -> None:
    """Write/overwrite README.md in the extracted/ directory."""
    readme_path = dest_dir / "README.md"
    sync_date = datetime.now().strftime("%Y-%m-%d %H:%M")
    content = f"""# Extracted Rulebook Content

> **Auto-synced — do not edit manually.**
> Run `python scripts/sync_rulebook_from_extraction.py` to refresh.

| Field | Value |
|-------|-------|
| Upstream source | `{source}` |
| Last synced | {sync_date} |
| Sync script | `scripts/sync_rulebook_from_extraction.py` |

## Contents

| File / Dir | Description |
|------------|-------------|
| `RULEBOOK_DRAFT.md` | Full extracted rulebook — {source / "RULEBOOK_DRAFT.md"} |
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
git commit -m "chore(rulebook): sync extracted outputs {sync_date[:10]}"
```
"""
    if dry_run:
        log(f"  [dry-run] write {readme_path.relative_to(REPO_ROOT)}")
    else:
        dest_dir.mkdir(parents=True, exist_ok=True)
        readme_path.write_text(content, encoding="utf-8")
        log(f"  wrote     README.md -> {readme_path.relative_to(REPO_ROOT)}")


def clean_stale(dest_dir: Path, source: Path, dry_run: bool) -> None:
    """Remove files/dirs in dest that are not present in source."""
    if not dest_dir.exists():
        return
    expected = set(SYNC_TARGETS) | {"README.md"}
    for item in dest_dir.iterdir():
        if item.name not in expected:
            if dry_run:
                log(f"  [dry-run] remove stale: {item.relative_to(REPO_ROOT)}")
            else:
                if item.is_dir():
                    shutil.rmtree(item)
                else:
                    item.unlink()
                log(f"  removed stale: {item.relative_to(REPO_ROOT)}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sync extraction outputs into rules/rulebook/extracted/."
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help=f"Path to upstream extraction output directory (default: {DEFAULT_SOURCE})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print actions without executing them.",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Remove files in extracted/ that are not present upstream.",
    )
    args = parser.parse_args()

    source: Path = args.source.resolve() if not args.source.is_absolute() else args.source
    dry_run: bool = args.dry_run
    clean: bool = args.clean

    log(f"Source : {source}")
    log(f"Dest   : {DEST_DIR}")
    log(f"Dry-run: {dry_run}")
    log("")

    if not source.exists():
        log(f"ERROR: Source directory not found: {source}")
        log("Pass --source <path> to override.")
        return 1

    # Ensure dest exists
    if not dry_run:
        DEST_DIR.mkdir(parents=True, exist_ok=True)

    # Sync each target
    for target in SYNC_TARGETS:
        src_path = source / target
        dst_path = DEST_DIR / target
        copy_item(src_path, dst_path, dry_run)

    # Write README
    write_readme(DEST_DIR, source, dry_run)

    # Optional clean
    if clean:
        log("\nCleaning stale files...")
        clean_stale(DEST_DIR, source, dry_run)

    log("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
