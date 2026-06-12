import json

with open('rules/rulebook/rulebook_manifest.json') as f:
    m = json.load(f)

new_entries = [
  {
    "checkId": "RB-131",
    "ruleId": "R-131",
    "title": "Joist Span Short Dim",
    "severity": "info",
    "category": "dimensions",
    "implemented": True,
    "confidence": "medium",
    "notes": "R-131 (Light Wood Frame / Floor Joist Span Limits) identifies rooms whose shorter dimension exceeds the allowable clear span for standard 2x12 dimensional lumber floor joists (No. 2 Douglas Fir-Larch at 16in OC, 40-psf live load, L/360 deflection). Checks: no room shorter dimension should exceed 14 ft (4.3 m). Beyond this threshold, engineered joists (TJI, LVL) are required, implying a change of framing system beyond basic platform frame. The shorter room dimension approximates the dominant joist span direction. Applies unconditionally. Distinct from RB-124 (longer dimension > 22 ft triggering structural specification) and RB-115 (shorter dimension <= 25 ft for daylighting).",
    "source_hint": "Fundamentals_of_Building_Construction_Materials_an...Chapter_5_Light_Wood_Frame_Construction.pdf (Ch. 5 - Light Wood Frame / Floor Joist Span Limits)",
    "related_ruleIds": ["R-131"]
  },
  {
    "checkId": "RB-132",
    "ruleId": "R-132",
    "title": "Bidirectional Partitions",
    "severity": "info",
    "category": "adjacency",
    "implemented": True,
    "confidence": "medium",
    "notes": "R-132 (Light Wood Frame / Interior Bearing Wall Layout) requires platform-frame bearing walls in both principal directions to create a two-way load path. Checks: in plans with >= 4 rooms, at least one pair of rooms must share a vertical edge (left/right boundary) AND at least one pair must share a horizontal edge (top/bottom boundary). A plan where all room boundaries align in only one axis produces a one-way spanning floor system that exceeds standard dimensional lumber capacity in the unsupported direction. Distinct from RB-128 (exterior facade coverage on >= 3 sides).",
    "source_hint": "Fundamentals_of_Building_Construction_Materials_an...Chapter_5_Light_Wood_Frame_Construction.pdf (Ch. 5 - Light Wood Frame / Interior Bearing Wall Layout)",
    "related_ruleIds": ["R-132"]
  },
  {
    "checkId": "RB-133",
    "ruleId": "R-133",
    "title": "Utility Plumbing Cluster",
    "severity": "info",
    "category": "adjacency",
    "implemented": True,
    "confidence": "medium",
    "notes": "R-133 (Light Wood Frame / Plumbing Stack Consolidation) requires that plumbing fixtures share a single stack where possible within platform-frame cost and structural limits. Checks: when a plan contains a kitchen and at least one bathroom, laundry, or utility room, the kitchen must be adjacent to at least one of those wet rooms. Adjacent wet rooms share a single wet wall (a framed cavity with back-to-back supply and drain lines on a single stack). Non-adjacent kitchen and bath layouts require a second independent stack, adding structural penetrations and cost. Distinct from RB-013 (kitchen not adjacent to bedroom) and RB-126 (perimeter service room isolation).",
    "source_hint": "Fundamentals_of_Building_Construction_Materials_an...Chapter_5_Light_Wood_Frame_Construction.pdf (Ch. 5 - Light Wood Frame / Plumbing Stack Consolidation)",
    "related_ruleIds": ["R-133"]
  },
  {
    "checkId": "RB-134",
    "ruleId": "R-134",
    "title": "Closet Min Area",
    "severity": "info",
    "category": "dimensions",
    "implemented": True,
    "confidence": "medium",
    "notes": "R-134 (Light Wood Frame / Built-In Storage Sizing) specifies the minimum closet area for standard 24-inch-deep rod-and-shelf systems. Checks: closet rooms must have area >= 16 sq ft (1.5 m2). A 4 ft x 4 ft (16 sq ft) closet is the smallest configuration that accommodates a rod-and-shelf unit on one wall with a 24-inch-deep shelf leaving a 24-inch clear access aisle, the minimum functional walk-in in platform-frame residential construction. Closets smaller than this are wall niches, not framed rooms, and are structurally inefficient within a stud-bay layout. Distinct from RB-129 (mass timber minimum short dimension 6 ft).",
    "source_hint": "Fundamentals_of_Building_Construction_Materials_an...Chapter_5_Light_Wood_Frame_Construction.pdf (Ch. 5 - Light Wood Frame / Built-In Storage Sizing)",
    "related_ruleIds": ["R-134"]
  },
  {
    "checkId": "RB-135",
    "ruleId": "R-135",
    "title": "Bedroom Bath Ratio",
    "severity": "info",
    "category": "zoning",
    "implemented": True,
    "confidence": "medium",
    "notes": "R-135 (Light Wood Frame / Residential Program Balance) reflects standard residential platform-frame programming limits. Checks: in plans with >= 2 bedrooms and >= 1 bathroom, the number of bathrooms must not exceed bedrooms + 1. The maximum of one bathroom per bedroom plus one shared/powder room represents the upper limit before additional independent plumbing stacks are required, structural penetrations that exceed the capacity of a standard platform-frame floor-ceiling assembly. Distinct from RB-097 (room type count thresholds) and RB-133 (plumbing stack consolidation by adjacency).",
    "source_hint": "Fundamentals_of_Building_Construction_Materials_an...Chapter_5_Light_Wood_Frame_Construction.pdf (Ch. 5 - Light Wood Frame / Residential Program Balance)",
    "related_ruleIds": ["R-135"]
  },
  {
    "checkId": "RB-136",
    "ruleId": "R-136",
    "title": "Entry Required",
    "severity": "info",
    "category": "adjacency",
    "implemented": True,
    "confidence": "medium",
    "notes": "R-136 (Light Wood Frame / Entry and Threshold Design) requires a dedicated transition space at the primary building entrance in platform-frame residential construction. Checks: plans with >= 5 rooms must include at least one room of type entry, foyer, vestibule, or hall. Without a separate transition space, the building envelope cannot achieve the air-lock effect that limits conditioned-air loss during door operation, a baseline requirement for the thermal performance of a platform-frame exterior wall. A >= 5 room program implies full residential occupancy where this transition is required. Distinct from RB-099 (hall hub connectivity >= 3) and RB-121 (service space for MEP).",
    "source_hint": "Fundamentals_of_Building_Construction_Materials_an...Chapter_5_Light_Wood_Frame_Construction.pdf (Ch. 5 - Light Wood Frame / Entry and Threshold Design)",
    "related_ruleIds": ["R-136"]
  },
  {
    "checkId": "RB-137",
    "ruleId": "R-137",
    "title": "Garage Fire Separation",
    "severity": "warning",
    "category": "adjacency",
    "implemented": True,
    "confidence": "medium",
    "notes": "R-137 (Light Wood Frame / Garage Fire Separation) requires a rated fire-separation wall between an attached garage and habitable space. Checks: when a garage room is present, it must be adjacent to at least one non-garage room. The fire-separation wall is always a shared wall between the garage and an adjacent room in the plan. A garage with no adjacent rooms within the plan cannot define this fire wall and does not meet the platform-frame residential fire separation requirement (IBC Section 406). Distinct from RB-001 (garage area ratio <= 25%) and RB-126 (perimeter service room isolation).",
    "source_hint": "Fundamentals_of_Building_Construction_Materials_an...Chapter_5_Light_Wood_Frame_Construction.pdf (Ch. 5 - Light Wood Frame / Garage and Fire Separation)",
    "related_ruleIds": ["R-137"]
  },
  {
    "checkId": "RB-138",
    "ruleId": "R-138",
    "title": "Interior Room Share Max",
    "severity": "info",
    "category": "zoning",
    "implemented": True,
    "confidence": "medium",
    "notes": "R-138 (Light Wood Frame / Natural Light Distribution) requires that platform-frame residential buildings provide natural light to the majority of habitable rooms through exterior windows. Checks: in plans with >= 4 rooms, interior rooms (not touching any exterior boundary) must not exceed 50% of total room count. An interior room can only borrow daylight through adjacent exterior rooms; if more than half the rooms are interior, the exterior rooms cannot distribute sufficient natural light to all interior spaces under standard platform-frame window sizing. Distinct from RB-119 (green buffer area >= 5% of total room area) and RB-106 (interior buffer room at any facade).",
    "source_hint": "Fundamentals_of_Building_Construction_Materials_an...Chapter_5_Light_Wood_Frame_Construction.pdf (Ch. 5 - Light Wood Frame / Natural Light and Ventilation)",
    "related_ruleIds": ["R-138"]
  },
  {
    "checkId": "RB-139",
    "ruleId": "R-139",
    "title": "Kitchen Living Adjacency",
    "severity": "info",
    "category": "adjacency",
    "implemented": True,
    "confidence": "medium",
    "notes": "R-139 (Light Wood Frame / Open-Plan Living Zone) establishes the kitchen-living adjacency as the baseline spatial organization for platform-frame residential construction. Checks: in plans with >= 4 rooms containing both a kitchen and a living or dining room, the kitchen must be adjacent to at least one living or dining room. This adjacency enables shared HVAC returns, range exhaust routing, and reduces load-bearing partitions between kitchen and living areas. An isolated kitchen requires additional independent MEP routing and partitions, increasing structural complexity. Distinct from RB-133 (plumbing cluster / wet wall adjacency) and RB-013 (kitchen not adjacent to bedroom).",
    "source_hint": "Fundamentals_of_Building_Construction_Materials_an...Chapter_5_Light_Wood_Frame_Construction.pdf (Ch. 5 - Light Wood Frame / Open-Plan Spatial Organization)",
    "related_ruleIds": ["R-139"]
  },
  {
    "checkId": "RB-140",
    "ruleId": "R-140",
    "title": "Plan Coverage Ratio",
    "severity": "info",
    "category": "dimensions",
    "implemented": True,
    "confidence": "medium",
    "notes": "R-140 (Light Wood Frame / Net-to-Gross Efficiency) specifies that the net-to-gross ratio for platform-frame residential construction must be >= 0.70. Checks: in plans with >= 3 rooms, total room area must be >= 70% of the plan bounding box area (dimensions.width x dimensions.depth). Plans with total room area below 70% of the gross plan area contain excessive void space that cannot be explained by standard platform-frame corridor allowances (typically 10-15% of gross area), signalling room layout misalignment with the structural grid. Distinct from RB-119 (green buffer area >= 5% of total room area) and RB-105 (max single room <= 35% of total room area).",
    "source_hint": "Fundamentals_of_Building_Construction_Materials_an...Chapter_5_Light_Wood_Frame_Construction.pdf (Ch. 5 - Light Wood Frame / Net-to-Gross Floor Plan Efficiency)",
    "related_ruleIds": ["R-140"]
  }
]

m['entries'].extend(new_entries)
m['extractedRuleCount'] = len(m['entries'])

with open('rules/rulebook/rulebook_manifest.json', 'w') as f:
    json.dump(m, f, indent=2, ensure_ascii=False)
    f.write('\n')

print(f'Manifest now has {len(m["entries"])} entries')
