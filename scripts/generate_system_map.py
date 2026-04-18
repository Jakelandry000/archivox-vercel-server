#!/usr/bin/env python3
"""
generate_system_map.py

Generates docs/system_map.md: Mermaid diagrams + ASCII tables that visualize
the ArchiVox pipeline, rulebook coverage, and package graph.

Usage:
  python scripts/generate_system_map.py

Output:
  docs/system_map.md   -- renderable on GitHub, auto-updates from source of truth
"""

import json
import re
import sys
from pathlib import Path
from collections import defaultdict

REPO_ROOT   = Path(__file__).resolve().parent.parent
MANIFEST    = REPO_ROOT / "rules" / "rulebook" / "rulebook_manifest.json"
CHECKS_FILE = REPO_ROOT / "packages" / "core" / "src" / "ruleChecks.ts"
OUT_DIR     = REPO_ROOT / "docs"
OUT_FILE    = OUT_DIR / "system_map.md"


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_manifest():
    if not MANIFEST.exists():
        print(f"ERROR: manifest not found at {MANIFEST}", file=sys.stderr)
        sys.exit(1)
    with open(MANIFEST, encoding="utf-8") as f:
        return json.load(f)


def scan_registered_checks(ts_file: Path) -> list[str]:
    """Return list of check IDs passed to registerChecks() in the .ts file."""
    if not ts_file.exists():
        return []
    text = ts_file.read_text(encoding="utf-8")
    return re.findall(r'id:\s*["\']([^"\']+)["\']', text)


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------

CONF_SYMBOL = {"high": "**", "medium": "*", "low": "~", None: "?"}


def section_pipeline() -> str:
    return """\
## 1. ArchiVox Pipeline

```mermaid
flowchart LR
    A([Input / User Request]) --> B[Layout Generator<br/>packages/generator]
    B --> C[LayoutV1 JSON<br/>packages/core]
    C --> D[validateLayout<br/>packages/core/validator]
    D --> E{Violations?}
    E -- none --> F([Output: SVG / AutoCAD<br/>packages/engines])
    E -- yes --> G[runChecks<br/>packages/core/ruleChecks]
    G --> H[RB-NNN Checks<br/>70 implemented rules]
    H --> I[RepairActions<br/>moveRoom, resizeRoom,<br/>swapRooms, addRoom...]
    I --> C
    H --> J[(rulebook_manifest.json<br/>R-NNN -> RB-NNN)]
    J -. mapped to .-> H
```
"""


def section_package_graph() -> str:
    return """\
## 2. Package Dependency Graph

```mermaid
graph TD
    WEB["apps/web<br/>(Next.js 16 App Router)"]
    GEN["packages/generator<br/>(deterministic layout)"]
    CORE["packages/core<br/>(validator + ruleChecks)"]
    ENGINES["packages/engines<br/>(SVG + AutoCAD output)"]
    DB["packages/db<br/>(Prisma 7 + Neon Postgres)"]
    API_CHAT["/api/chat"]
    API_DEMO["/api/demo-layout"]
    DEV["/dev dashboard"]

    WEB --> API_CHAT
    WEB --> API_DEMO
    WEB --> DEV
    API_CHAT --> GEN
    API_CHAT --> CORE
    API_CHAT --> ENGINES
    DEV --> DB
    GEN --> CORE
    ENGINES --> CORE
```
"""


def section_coverage_pie(entries: list[dict]) -> str:
    cats: dict[str, int] = defaultdict(int)
    for e in entries:
        cats[e.get("category", "unknown")] += 1

    sorted_cats = sorted(cats.items(), key=lambda x: -x[1])
    pie_lines = "\n".join(f'    "{cat}" : {count}' for cat, count in sorted_cats)

    return f"""\
## 3. Rulebook Check Coverage by Category

```mermaid
pie title RB Checks by Category (70 total)
{pie_lines}
```
"""


def section_confidence_bar(entries: list[dict]) -> str:
    confs: dict[str, int] = defaultdict(int)
    for e in entries:
        confs[e.get("confidence", "unknown")] += 1

    total = sum(confs.values())
    order = ["high", "medium", "low"]
    lines = ["## 4. Confidence Breakdown", "", "```"]
    lines.append(f"  Total implemented checks: {total}")
    lines.append("")
    bar_width = 40
    for cf in order:
        count = confs.get(cf, 0)
        pct = count / total if total else 0
        filled = int(pct * bar_width)
        bar = "#" * filled + "-" * (bar_width - filled)
        sym = CONF_SYMBOL.get(cf, "?")
        lines.append(f"  {sym:2s} {cf:<8s} [{bar}] {count:3d} / {total} ({pct*100:.0f}%)")
    lines.append("```")
    return "\n".join(lines) + "\n"


def section_category_table(entries: list[dict]) -> str:
    cats: dict[str, list[dict]] = defaultdict(list)
    for e in entries:
        cats[e.get("category", "unknown")].append(e)

    rows = []
    rows.append("## 5. RB Checks by Category\n")
    rows.append("| Category | Count | High | Medium | Low | Example Check |")
    rows.append("|----------|-------|------|--------|-----|---------------|")

    for cat in sorted(cats.keys()):
        checks = cats[cat]
        high   = sum(1 for c in checks if c.get("confidence") == "high")
        med    = sum(1 for c in checks if c.get("confidence") == "medium")
        low    = sum(1 for c in checks if c.get("confidence") == "low")
        first  = checks[0]["title"]
        rows.append(f"| {cat} | {len(checks)} | {high} | {med} | {low} | {first} |")

    return "\n".join(rows) + "\n"


def section_check_flow(entries: list[dict]) -> str:
    """Mermaid graph: categories as subgraphs, sampled checks as nodes."""
    cats: dict[str, list[dict]] = defaultdict(list)
    for e in entries:
        cats[e.get("category", "unknown")].append(e)

    lines = ["## 6. Rule Check Network (category clusters)\n"]
    lines.append("```mermaid")
    lines.append("graph LR")
    lines.append("    VALIDATOR([validator.ts]) --> CHECKS([runChecks])")

    for cat in sorted(cats.keys()):
        checks = cats[cat]
        safe_cat = cat.upper().replace("-", "_")
        # limit to first 4 per category to keep diagram readable
        sample = checks[:4]
        ids = [f"RB_{e['checkId'].replace('-','_')}" for e in sample]
        id_labels = " & ".join(ids)
        lines.append(f"    CHECKS --> {safe_cat}{{{{ {cat} }}}}")
        for e in sample:
            node_id = f"RB_{e['checkId'].replace('-','_')}"
            title = e["title"][:28].replace('"', "'")
            conf = CONF_SYMBOL.get(e.get("confidence"), "?")
            lines.append(f'    {safe_cat} --> {node_id}["{e["checkId"]} {conf}<br/>{title}"]')

    lines.append("```")
    return "\n".join(lines) + "\n"


def section_repair_actions() -> str:
    return """\
## 7. RepairAction Types

```mermaid
flowchart TD
    V([Violation]) --> RA[RepairAction]
    RA --> M[moveRoom<br/>dx, dy]
    RA --> R[resizeRoom<br/>targetW/H, scaleX/Y]
    RA --> S[swapRooms<br/>roomIdA, roomIdB]
    RA --> AH[addHallwayConnection<br/>nearRoomId]
    RA --> AR[addRoom<br/>roomType]
    RA --> RR[removeRoom<br/>roomId]
```
"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def build_doc(manifest: dict) -> str:
    entries = manifest.get("entries", [])
    schema  = manifest.get("schemaVersion", "unknown")
    count   = manifest.get("extractedRuleCount", "?")

    header = f"""\
# ArchiVox System Map

> Auto-generated by `scripts/generate_system_map.py` from `rulebook_manifest.json`.
> Schema: `{schema}` | Extracted rules: {count} | Implemented checks: {len(entries)}

"""
    sections = [
        header,
        section_pipeline(),
        section_package_graph(),
        section_coverage_pie(entries),
        section_confidence_bar(entries),
        section_category_table(entries),
        section_check_flow(entries),
        section_repair_actions(),
    ]
    return "\n".join(sections)


def main():
    manifest = load_manifest()
    registered = scan_registered_checks(CHECKS_FILE)
    manifest_ids = {e["checkId"] for e in manifest.get("entries", [])}
    extra = set(registered) - manifest_ids
    if extra:
        print(f"NOTE: {len(extra)} check IDs found in ruleChecks.ts not in manifest: {sorted(extra)}")

    OUT_DIR.mkdir(exist_ok=True)
    doc = build_doc(manifest)

    # Write ASCII-safe (replace any stray unicode)
    safe_doc = doc.encode("ascii", errors="replace").decode("ascii")
    OUT_FILE.write_text(safe_doc, encoding="ascii")
    print(f"Written: {OUT_FILE}")
    print(f"  {len(manifest.get('entries', []))} checks across categories")


if __name__ == "__main__":
    main()
