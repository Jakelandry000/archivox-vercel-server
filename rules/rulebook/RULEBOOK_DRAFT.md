# ArchiVox Rulebook Draft

**Status**: Placeholder — paste the generated 145-rule content here.

This file is the canonical drop location for the extracted rulebook output from the
ArchiVox rule-extraction pipeline. Once populated, commit it to this directory so
all rule IDs (R-###) are traceable alongside the code.

---

## How to populate

1. Run the extraction script (or copy from `_archivox_ruleset_output/RULEBOOK_DRAFT.md`).
2. Paste the full output below the `---` separator, preserving section headings of the
   form `### R-NNN — Rule Title`.
3. Update `rulebook_manifest.json` to map each `R-NNN` to its `checkId` (RB-NNN).
4. Commit both files together.

---

## Rules (placeholder)

### R-001 — Garage Area Ratio
Garage area must not exceed 25% of total conditioned floor area.
**checkId**: RB-001

### R-002 — Bedroom Minimum Area
Each bedroom must have a minimum usable area of 70 sq ft (recommended) / 50 sq ft (hard min).
**checkId**: RB-002

### R-003 — No Thin Slivers
No room may have an aspect ratio exceeding 5:1 (warning) or 10:1 (error).
**checkId**: RB-003

### R-004 — Living Room Exterior Access
The primary living room must have at least one exterior-exposed wall face (proxy for natural light/egress).
**checkId**: RB-004

### R-005 — Kitchen Exterior Access
The kitchen should have at least one exterior-exposed wall face (natural ventilation/light).
**checkId**: RB-005

### R-006 — Closet Near Bedroom
When closets are present, at least one closet must be adjacent to a bedroom.
**checkId**: RB-006

### R-007 — Circulation Connectivity
Every habitable room must share an edge (adjacency) with at least one circulation space
(hall, living room, dining, or entry) or be directly connected to the entry of the dwelling.
**checkId**: RB-007

### R-008 — Bedroom Count Minimum
A residential dwelling must contain at least one bedroom.
**checkId**: RB-008

### R-009 — Bathroom Count Minimum
If bedrooms are present, at least one bathroom must exist in the plan.
**checkId**: RB-009

### R-010 — Laundry Not Adjacent Bedroom
Laundry rooms should not share a direct wall with a bedroom (noise/vibration).
**checkId**: RB-010

<!-- R-011 through R-145: add extracted rules here -->
