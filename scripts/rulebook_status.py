#!/usr/bin/env python3
"""
rulebook_status.py

Prints a coverage report: how many extracted rules exist, how many have been
mapped to implemented checks, and which are unmapped.

Usage:
  python scripts/rulebook_status.py
  python scripts/rulebook_status.py --full    # show all rules including unmapped
"""

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST  = REPO_ROOT / "rules" / "rulebook" / "rulebook_manifest.json"
DRAFT     = REPO_ROOT / "rules" / "rulebook" / "extracted" / "RULEBOOK_DRAFT.md"

# ── Helpers ───────────────────────────────────────────────────────────────────

def load_manifest():
    if not MANIFEST.exists():
        print(f"ERROR: manifest not found at {MANIFEST}")
        sys.exit(1)
    with open(MANIFEST, encoding="utf-8") as f:
        return json.load(f)


def parse_rulebook_ids(draft_path: Path) -> list[str]:
    """Extract all unique R-NNN IDs from RULEBOOK_DRAFT.md.

    Robust to two common formats:
      - "- R-NNN: Title"   (index list items)
      - "## R-NNN: Title"  (section headers)
    Deduplicates and returns sorted list.
    """
    if not draft_path.exists():
        return []
    seen: set[str] = set()
    for line in draft_path.read_text(encoding="utf-8").splitlines():
        # Match both list items and section headers
        m = re.match(r"^(?:-|#{1,3})\s+(R-\d+):", line)
        if m:
            seen.add(m.group(1))
    ids = sorted(seen, key=lambda rid: int(rid.split("-")[1]))
    return ids


def sanity_check_ids(ids: list[str]) -> list[str]:
    """Return a list of warning strings if the ID set looks inconsistent."""
    warnings = []
    if not ids:
        return ["No R-IDs parsed — check RULEBOOK_DRAFT.md format."]
    nums = [int(rid.split("-")[1]) for rid in ids]
    expected_max = len(ids)
    actual_max   = max(nums)
    if actual_max != expected_max:
        warnings.append(
            f"Max R-ID is R-{actual_max:03d} but only {expected_max} unique IDs found — "
            f"possible gaps or non-sequential numbering."
        )
    # Check for gaps
    full_set = set(range(1, actual_max + 1))
    parsed_set = set(nums)
    missing = sorted(full_set - parsed_set)
    if missing:
        warnings.append(
            f"Missing R-IDs (gaps in sequence): {['R-' + str(n).zfill(3) for n in missing[:10]]}"
            + (" ..." if len(missing) > 10 else "")
        )
    return warnings


def confidence_badge(c: str | None) -> str:
    return {"high": "**", "medium": "* ", "low": "~ ", None: "? "}.get(c or "", "? ")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="Show rulebook ↔ check coverage.")
    parser.add_argument("--full", action="store_true", help="List all extracted rules.")
    args = parser.parse_args()

    manifest = load_manifest()
    entries = manifest.get("entries", [])

    # Build lookup: ruleId -> entry
    mapped_rule_ids: dict[str, dict] = {}
    for e in entries:
        rid = e.get("ruleId")
        if rid:
            mapped_rule_ids[rid] = e

    # Implemented check IDs
    implemented = [e for e in entries if e.get("implemented")]

    # Extract all R-IDs from draft
    all_rule_ids = parse_rulebook_ids(DRAFT)
    total_extracted = len(all_rule_ids)

    # Sanity check
    id_warnings = sanity_check_ids(all_rule_ids)
    for w in id_warnings:
        print(f"  ⚠  {w}")

    mapped_count  = sum(1 for e in entries if e.get("ruleId"))
    high_conf     = sum(1 for e in entries if e.get("confidence") == "high")
    medium_conf   = sum(1 for e in entries if e.get("confidence") == "medium")
    low_conf      = sum(1 for e in entries if e.get("confidence") == "low")
    null_mapped   = sum(1 for e in entries if e.get("ruleId") is None)

    print("=" * 60)
    print("  ArchiVox Rulebook Coverage Report")
    print("=" * 60)
    print(f"  Extracted rules (R-IDs in RULEBOOK_DRAFT.md) : {total_extracted}")
    print(f"  Implemented checks (RB-NNN)                  : {len(implemented)}")
    print(f"  Checks with a mapped R-ID                    : {mapped_count}")
    print(f"  Checks with null ruleId (no academic match)  : {null_mapped}")
    print()
    print(f"  Confidence breakdown:")
    print(f"    ** high   : {high_conf}")
    print(f"    *  medium : {medium_conf}")
    print(f"    ~  low    : {low_conf}")
    print()

    # Which R-IDs have NO implementing check?
    unmapped_rule_ids = [rid for rid in all_rule_ids if rid not in mapped_rule_ids]
    print(f"  Extracted rules NOT yet mapped to any check  : {len(unmapped_rule_ids)}")
    print()

    # Check detail table
    print("  Implemented Checks")
    print("  " + "-" * 56)
    print(f"  {'CheckID':<10} {'RuleID':<8} {'Conf':<4} {'Title'}")
    print("  " + "-" * 56)
    for e in entries:
        rid  = e.get("ruleId") or "-"
        conf = confidence_badge(e.get("confidence"))
        print(f"  {e['checkId']:<10} {rid:<8} {conf}  {e['title']}")
    print()

    if args.full and all_rule_ids:
        print("  All Extracted Rules")
        print("  " + "-" * 56)
        for rid in all_rule_ids:
            if rid in mapped_rule_ids:
                e = mapped_rule_ids[rid]
                tag = f"← {e['checkId']} [{e.get('confidence','?')}]"
            else:
                tag = "(unmapped)"
            print(f"  {rid:<8}  {tag}")
        print()

    print("=" * 60)
    print(f"  Coverage: {mapped_count}/{len(implemented)} checks have an R-ID.")
    if total_extracted:
        pct = mapped_count / total_extracted * 100
        print(f"  {mapped_count}/{total_extracted} extracted rules have an implementing check ({pct:.1f}%).")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
