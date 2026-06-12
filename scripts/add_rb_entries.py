import json, os

manifest_path = os.path.join(os.path.dirname(__file__), '..', 'rules', 'rulebook', 'rulebook_manifest.json')
d = json.load(open(manifest_path, encoding='utf-8'))

# Only add if not already present
existing_ids = {e['checkId'] for e in d['entries']}

new_entries = [
  {
    "checkId": "RB-051",
    "ruleId": "R-049",
    "title": "Dining Room Minimum Area",
    "severity": "warning",
    "category": "dimensions",
    "implemented": True,
    "confidence": "medium",
    "notes": "R-049 (Collaborative Seating Orientation) requires sufficient floor area for a shared dining group. Architectural Graphic Standards sets 80 sq ft as minimum for a 4-person table with clearances. Below 60 sq ft cannot accommodate even a 2-person table with egress (error). R-013 (ADA Turning Radius) implies at least a 5-ft turning diameter at the activity node.",
    "source_hint": "Architectural_Graphic_Standards_11th.md - Dining room sizing; ADA Standards section 902",
    "related_ruleIds": ["R-049", "R-013", "R-026"]
  },
  {
    "checkId": "RB-052",
    "ruleId": "R-046",
    "title": "Office Minimum Area",
    "severity": "warning",
    "category": "dimensions",
    "implemented": True,
    "confidence": "medium",
    "notes": "R-046 (Social-Distance Workstation Compliance) requires adequate personal space clearance per workstation. For a residential home office, Architectural Graphic Standards recommends 80 sq ft for a single-person workspace with desk, chair, and circulation. R-013 (ADA Turning Radius) requires a 5-ft clear turning circle at the activity node.",
    "source_hint": "Architectural_Graphic_Standards_11th.md - Home office sizing; ADA Standards section 902",
    "related_ruleIds": ["R-046", "R-013", "R-025"]
  },
  {
    "checkId": "RB-053",
    "ruleId": "R-014",
    "title": "Stair Room Geometry",
    "severity": "error",
    "category": "dimensions",
    "implemented": True,
    "confidence": "high",
    "notes": "R-014 (Stair Geometry Compliance) mandates minimum stair width (IRC R311.7.1: 36-in clear, approx 3.5 ft with framing). The stair enclosure must be at least 3.5 ft in its narrower dimension and at least 6 ft in its longer dimension to accommodate a functional stair run. An undersized stair room is non-buildable and a code violation.",
    "source_hint": "Architectural_Graphic_Standards_11th.md - Stair geometry; IRC R311.7.1; IBC 2021 section 1009",
    "related_ruleIds": ["R-014", "R-024", "R-025"]
  },
  {
    "checkId": "RB-054",
    "ruleId": "R-013",
    "title": "Primary Bedroom Minimum Area",
    "severity": "warning",
    "category": "dimensions",
    "implemented": True,
    "confidence": "medium",
    "notes": "R-013 (ADA Turning Radius) requires a 5-ft clear turning circle at activity nodes. The primary/master bedroom must accommodate a king/queen bed, two bedside clearances, and ADA turning radius - Architectural Graphic Standards sets 120 sq ft as minimum. Identified by primary/master label or as the largest bedroom when multiple bedrooms exist.",
    "source_hint": "Architectural_Graphic_Standards_11th.md - Master bedroom sizing; ADA Standards section 802; IRC R304.1",
    "related_ruleIds": ["R-013", "R-026", "R-021"]
  },
  {
    "checkId": "RB-055",
    "ruleId": "R-082",
    "title": "Kitchen-Dining Adjacency",
    "severity": "info",
    "category": "zone",
    "implemented": True,
    "confidence": "medium",
    "notes": "R-082 (Repetitive-Task Workstation Hubs) requires functionally linked work areas to be sited in proximity. The kitchen (food prep) and dining room (consumption) are the two primary food-service workstations; separating them forces repeated travel. Complements RB-042 (Kitchen-Living Adjacency). Severity is info because open-plan designs may share the space without a wall boundary.",
    "source_hint": "Architectural_Graphic_Standards_11th.md - Kitchen/dining zone adjacency",
    "related_ruleIds": ["R-082", "R-025", "R-032"]
  },
  {
    "checkId": "RB-056",
    "ruleId": "R-082",
    "title": "Kitchen Minimum Width",
    "severity": "warning",
    "category": "dimensions",
    "implemented": True,
    "confidence": "high",
    "notes": "R-082 (Repetitive-Task Workstation Hubs) and Architectural Graphic Standards require that kitchen work triangles fit without overlap. A standard kitchen requires at least 8 ft clear width for counter depths (2 ft each side) plus a 4-ft aisle. Undersized kitchens force overlap of work zones and violate ergonomic task hub principles.",
    "source_hint": "Architectural_Graphic_Standards_11th.md - Kitchen work triangle; NKBA Planning Guidelines; IRC R304.1",
    "related_ruleIds": ["R-082", "R-013", "R-046"]
  },
  {
    "checkId": "RB-057",
    "ruleId": "R-036",
    "title": "Laundry Exterior Access",
    "severity": "info",
    "category": "envelope",
    "implemented": True,
    "confidence": "medium",
    "notes": "R-036 (Exterior Door Count Minimization) requires coordination of penetrations with exterior walls. A dryer requires an exterior vent penetration - without exterior wall contact, the dryer cannot be vented per IRC M1502.3. An interior laundry room is not a code violation but is a practical constraint flagged at info severity.",
    "source_hint": "Architectural_Graphic_Standards_11th.md - Laundry room placement; IRC M1502.3 dryer vent requirements",
    "related_ruleIds": ["R-036", "R-082", "R-088"]
  },
  {
    "checkId": "RB-058",
    "ruleId": "R-013",
    "title": "Bathroom Minimum Width",
    "severity": "warning",
    "category": "dimensions",
    "implemented": True,
    "confidence": "high",
    "notes": "R-013 (ADA Turning Radius) requires a 5-ft (60-in) clear turning diameter at activity nodes. Architectural Graphic Standards sets 5 ft as the absolute minimum bathroom width to accommodate a toilet, lavatory, and turning clearance. A bathroom narrower than 5 ft cannot maintain required fixture clearances. Complements RB-029 (Bathroom Minimum Area) by enforcing the dimensional constraint independently.",
    "source_hint": "Architectural_Graphic_Standards_11th.md - Bathroom fixture clearances; ADA Standards section 603; IRC R307.1",
    "related_ruleIds": ["R-013", "R-014", "R-046"]
  },
  {
    "checkId": "RB-059",
    "ruleId": "R-021",
    "title": "Habitable Room Daylighting Depth",
    "severity": "warning",
    "category": "dimensions",
    "implemented": True,
    "confidence": "medium",
    "notes": "R-021 (Daylighting Depth Rule) states that natural daylight does not effectively penetrate beyond 2.5x the floor-to-ceiling height. In a 2D floor plan this is approximated as: room depth (longer dimension) must not exceed 2.5x room width (shorter dimension). Applies to habitable rooms (bedrooms, offices, living, dining). Beyond this ratio there is a permanently dark interior zone. Severity is warning because window placement is not captured in the plan.",
    "source_hint": "Architectural_Graphic_Standards_11th.md - Daylighting rules of thumb; 06_Ch6_Environmental_Psychology.md",
    "related_ruleIds": ["R-021", "R-003", "R-013"]
  },
  {
    "checkId": "RB-060",
    "ruleId": "R-013",
    "title": "Bedroom Minimum Width",
    "severity": "warning",
    "category": "dimensions",
    "implemented": True,
    "confidence": "high",
    "notes": "R-013 (ADA Turning Radius) requires a 5-ft clear turning diameter. Architectural Graphic Standards sets 8 ft as the minimum bedroom width to accommodate a twin bed (38 in) plus required circulation clearances (30 in each side) and a 5-ft ADA turning radius. A bedroom narrower than 8 ft cannot fit a bed with required clearances. Complements RB-002 (Bedroom Minimum Area) by enforcing the dimensional constraint independently.",
    "source_hint": "Architectural_Graphic_Standards_11th.md - Bedroom minimum dimensions; ADA Standards section 802; IRC R304.1",
    "related_ruleIds": ["R-013", "R-014", "R-021"]
  }
]

added = 0
for entry in new_entries:
    if entry['checkId'] not in existing_ids:
        d['entries'].append(entry)
        added += 1

with open(manifest_path, 'w', encoding='utf-8') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
    f.write('\n')

print(f'Added {added} entries. Manifest now has {len(d["entries"])} entries.')
