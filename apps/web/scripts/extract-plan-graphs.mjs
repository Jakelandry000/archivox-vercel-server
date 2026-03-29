#!/usr/bin/env node
/**
 * extract-plan-graphs.mjs
 *
 * Parses a ZIP of DXF floor-plan files and writes one
 * datasets/core-v1/derived/<sha256>.plangraph.json per DXF plus a manifest.
 *
 * Usage:
 *   node scripts/extract-plan-graphs.mjs
 *   ARCHIVOX_DEBUG=1 node scripts/extract-plan-graphs.mjs   # verbose
 *
 * Env vars (all optional):
 *   ZIP_PATH   path to input ZIP  (default: /dataset/packages/archivox_18_dxfs.zip)
 *   OUT_DIR    output directory   (default: <repo-root>/datasets/core-v1/derived)
 *   MAX_FILES  max DXFs to ingest (default: unlimited)
 *   ARCHIVOX_DEBUG=1  print entity-type counts + sample text strings per file
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const DEBUG = process.env.ARCHIVOX_DEBUG === '1';
const __dir = dirname(fileURLToPath(import.meta.url));

const ZIP_PATH  = process.env.ZIP_PATH  ?? '/dataset/packages/archivox_18_dxfs.zip';
const OUT_DIR   = process.env.OUT_DIR   ?? join(__dir, '../../../datasets/core-v1/derived');
const MAX_FILES = process.env.MAX_FILES ? parseInt(process.env.MAX_FILES, 10) : Infinity;

// ─── ZIP reader ───────────────────────────────────────────────────────────────
// Pure-Node implementation: reads central directory → extracts DEFLATE / stored.

function readZipEntries(zipPath) {
  const buf = readFileSync(zipPath);

  // Locate End-of-Central-Directory record (signature 0x06054b50).
  // Search backward from end to support ZIP comment.
  let eocdPos = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocdPos = i; break; }
  }
  if (eocdPos < 0) throw new Error(`Not a valid ZIP: ${zipPath}`);

  const numEntries = buf.readUInt16LE(eocdPos + 10);
  const cdOffset   = buf.readUInt32LE(eocdPos + 16);

  const entries = [];
  let pos = cdOffset;
  for (let e = 0; e < numEntries; e++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break; // central dir signature
    const method      = buf.readUInt16LE(pos + 10);
    const compressed  = buf.readUInt32LE(pos + 20);
    const fnameLen    = buf.readUInt16LE(pos + 28);
    const extraLen    = buf.readUInt16LE(pos + 30);
    const commentLen  = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.slice(pos + 46, pos + 46 + fnameLen).toString('utf8');
    pos += 46 + fnameLen + extraLen + commentLen;

    if (!name.toLowerCase().endsWith('.dxf')) continue;
    if (name.endsWith('/')) continue; // directory entry

    // Read local file header to find data start
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) continue;
    const lfnLen  = buf.readUInt16LE(localOffset + 26);
    const lexLen  = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lfnLen + lexLen;
    const compBuf = buf.slice(dataStart, dataStart + compressed);

    let data;
    if (method === 0) {
      data = compBuf;
    } else if (method === 8) {
      try { data = inflateRawSync(compBuf); } catch { continue; }
    } else {
      continue; // unsupported compression
    }
    entries.push({ name: basename(name), data });
  }
  return entries;
}

// ─── DXF parser ───────────────────────────────────────────────────────────────
// Parses DXF group-code/value pairs and extracts TEXT, MTEXT, LWPOLYLINE,
// POLYLINE/VERTEX, INSERT+ATTRIB entities.

function tokenizeDxf(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (!isNaN(code)) pairs.push([code, lines[i + 1].trim()]);
  }
  return pairs;
}

function stripMtextCodes(raw) {
  // Remove DXF MTEXT control sequences:
  //   \Pcode, \Hval;, \Wval;, \Aval;, \fFont;, \Qval;, \Cval;, \Tval;, \~
  //   \\  →  nothing  (escaped backslash), { } grouping
  return raw
    .replace(/\\[PHWACfQT][^;]*;/g, ' ')  // format codes with semicolon
    .replace(/\\[~LlOoKkXxSsPpNnTt]/g, ' ')  // single-char format codes (P=paragraph, etc.)
    .replace(/\\\\/g, '')                  // escaped backslash
    .replace(/[{}]/g, '')                  // grouping braces
    .replace(/\\\|/g, '|')                 // escaped pipe
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDxfEntities(text) {
  const pairs = tokenizeDxf(text);
  const entities = [];
  let i = 0;
  let inEntities = false;
  let inModelSpaceBlock = false;

  // We collect entities from both ENTITIES section and *MODEL_SPACE block.
  while (i < pairs.length) {
    const [code, val] = pairs[i];

    // Section/block tracking
    if (code === 0 && val === 'SECTION') {
      i++;
      if (i < pairs.length && pairs[i][0] === 2 && pairs[i][1].toUpperCase() === 'ENTITIES') {
        inEntities = true;
      } else if (i < pairs.length && pairs[i][0] === 2 && pairs[i][1].toUpperCase() === 'BLOCKS') {
        inEntities = false;
      }
      continue;
    }
    if (code === 0 && val === 'ENDSEC') { inEntities = false; i++; continue; }

    // Block tracking (MODEL_SPACE block contains real entities in many DXFs)
    if (code === 0 && val === 'BLOCK') {
      i++;
      while (i < pairs.length && pairs[i][0] !== 0) {
        if (pairs[i][0] === 2) {
          const bname = pairs[i][1].toUpperCase();
          inModelSpaceBlock = bname.includes('MODEL_SPACE') || bname === '*MODEL_SPACE';
        }
        i++;
      }
      if (inModelSpaceBlock) inEntities = true;
      continue;
    }
    if (code === 0 && val === 'ENDBLK') {
      if (inModelSpaceBlock) { inEntities = false; inModelSpaceBlock = false; }
      i++;
      continue;
    }

    if (!inEntities || code !== 0) { i++; continue; }

    const type = val.toUpperCase();

    // ── TEXT entity ──────────────────────────────────────────────────────────
    if (type === 'TEXT') {
      i++;
      const e = { type: 'TEXT', text: '', x: 0, y: 0, height: 0.1, rotation: 0, layer: '' };
      while (i < pairs.length && pairs[i][0] !== 0) {
        const [c, v] = pairs[i];
        if (c === 1)  e.text     = v;
        else if (c === 10) e.x   = parseFloat(v);
        else if (c === 20) e.y   = parseFloat(v);
        else if (c === 40) e.height = parseFloat(v);
        else if (c === 50) e.rotation = parseFloat(v);
        else if (c === 8)  e.layer   = v;
        i++;
      }
      if (e.text) entities.push(e);
      continue;
    }

    // ── MTEXT entity ─────────────────────────────────────────────────────────
    if (type === 'MTEXT') {
      i++;
      const e = { type: 'MTEXT', text: '', x: 0, y: 0, height: 0.1, rotation: 0, layer: '' };
      let rawParts = [];
      while (i < pairs.length && pairs[i][0] !== 0) {
        const [c, v] = pairs[i];
        if (c === 1 || c === 3) rawParts.push(v); // 3 = additional text chunks
        else if (c === 10) e.x = parseFloat(v);
        else if (c === 20) e.y = parseFloat(v);
        else if (c === 40) e.height = parseFloat(v);
        else if (c === 50) e.rotation = parseFloat(v);
        else if (c === 8)  e.layer  = v;
        i++;
      }
      e.text = stripMtextCodes(rawParts.join(''));
      if (e.text) entities.push(e);
      continue;
    }

    // ── LWPOLYLINE entity ────────────────────────────────────────────────────
    if (type === 'LWPOLYLINE') {
      i++;
      const e = { type: 'LWPOLYLINE', vertices: [], closed: false, layer: '' };
      let cx = null, cy = null;
      while (i < pairs.length && pairs[i][0] !== 0) {
        const [c, v] = pairs[i];
        if (c === 70) e.closed = (parseInt(v, 10) & 1) === 1;
        else if (c === 8) e.layer = v;
        else if (c === 10) {
          // Flush the previous vertex if we already have an x,y pair
          if (cx !== null && cy !== null) e.vertices.push({ x: cx, y: cy });
          cx = parseFloat(v); cy = null;
        }
        else if (c === 20) { cy = parseFloat(v); }
        i++;
      }
      if (cx !== null && cy !== null) e.vertices.push({ x: cx, y: cy });
      entities.push(e);
      continue;
    }

    // ── POLYLINE entity ──────────────────────────────────────────────────────
    if (type === 'POLYLINE') {
      i++;
      const e = { type: 'POLYLINE', vertices: [], closed: false, layer: '' };
      while (i < pairs.length && pairs[i][0] !== 0) {
        const [c, v] = pairs[i];
        if (c === 70) e.closed = (parseInt(v, 10) & 1) === 1;
        else if (c === 8) e.layer = v;
        i++;
      }
      // Collect VERTEX entities that follow
      while (i < pairs.length && pairs[i][0] === 0 && pairs[i][1].toUpperCase() === 'VERTEX') {
        i++;
        let vx = 0, vy = 0;
        let flags = 0;
        while (i < pairs.length && pairs[i][0] !== 0) {
          const [c, v] = pairs[i];
          if (c === 10) vx = parseFloat(v);
          else if (c === 20) vy = parseFloat(v);
          else if (c === 70) flags = parseInt(v, 10);
          i++;
        }
        // Skip 3D mesh vertices (flags & 64) and other control vertices
        if ((flags & 0xC0) === 0) e.vertices.push({ x: vx, y: vy });
      }
      entities.push(e);
      continue;
    }

    // ── INSERT entity (block reference) with ATTRIBs ─────────────────────────
    if (type === 'INSERT') {
      i++;
      const ins = { type: 'INSERT', block: '', x: 0, y: 0, layer: '', attribs: [] };
      while (i < pairs.length && pairs[i][0] !== 0) {
        const [c, v] = pairs[i];
        if (c === 2)  ins.block = v;
        else if (c === 10) ins.x = parseFloat(v);
        else if (c === 20) ins.y = parseFloat(v);
        else if (c === 8)  ins.layer = v;
        i++;
      }
      // Collect ATTRIB entities that follow
      while (i < pairs.length && pairs[i][0] === 0 &&
             (pairs[i][1].toUpperCase() === 'ATTRIB' || pairs[i][1].toUpperCase() === 'SEQEND')) {
        if (pairs[i][1].toUpperCase() === 'SEQEND') { i++; break; }
        i++;
        const attr = { tag: '', value: '', x: ins.x, y: ins.y };
        while (i < pairs.length && pairs[i][0] !== 0) {
          const [c, v] = pairs[i];
          if (c === 2)  attr.tag   = v.toUpperCase();
          else if (c === 1) attr.value = v;
          else if (c === 10) attr.x = parseFloat(v);
          else if (c === 20) attr.y = parseFloat(v);
          i++;
        }
        if (attr.value) ins.attribs.push(attr);
      }
      // Emit TEXT-like entities for each attrib value
      for (const attr of ins.attribs) {
        entities.push({ type: 'TEXT', text: attr.value, x: attr.x, y: attr.y,
                        height: 0.1, rotation: 0, layer: ins.layer });
      }
      continue;
    }

    i++; // skip unknown entity type
  }
  return entities;
}

// ─── Label normalization ──────────────────────────────────────────────────────

// Canonical label aliases.  Keys are lowercase normalized strings.
// Values are canonical label names (also lowercase).
const ROOM_ALIASES = new Map(Object.entries({
  // ── Master / Primary bedroom ────────────────────────────────────────────
  'master bedroom':   'master bedroom',
  'master bed':       'master bedroom',
  'master bdrm':      'master bedroom',
  'master br':        'master bedroom',
  'master suite':     'master bedroom',
  'master bedrm':     'master bedroom',
  'm bedroom':        'master bedroom',
  'm bed':            'master bedroom',
  'm br':             'master bedroom',
  'm bdrm':           'master bedroom',
  'mbr':              'master bedroom',
  'mbed':             'master bedroom',
  'mstr bed':         'master bedroom',
  'mstr bedroom':     'master bedroom',
  'mstr bdrm':        'master bedroom',
  'primary bedroom':  'master bedroom',
  'primary bed':      'master bedroom',
  'primary suite':    'master bedroom',
  "owner's suite":    'master bedroom',
  'owners suite':     'master bedroom',
  'owner suite':      'master bedroom',
  // ── Bedroom ─────────────────────────────────────────────────────────────
  'bedroom':          'bedroom',
  'bed room':         'bedroom',
  'bed':              'bedroom',
  'bdrm':             'bedroom',
  'bedrm':            'bedroom',
  'br':               'bedroom',
  'sleeping':         'bedroom',
  'sleeping room':    'bedroom',
  // ── Living spaces ────────────────────────────────────────────────────────
  'living room':      'living room',
  'living':           'living room',
  'liv room':         'living room',
  'liv rm':           'living room',
  'great room':       'great room',
  'greatroom':        'great room',
  'great rm':         'great room',
  'family room':      'family room',
  'family':           'family room',
  'fam room':         'family room',
  'fam rm':           'family room',
  'great/family':     'great room',
  // ── Kitchen / Dining ────────────────────────────────────────────────────
  'kitchen':          'kitchen',
  'kit':              'kitchen',
  'kitch':            'kitchen',
  'ktchn':            'kitchen',
  'dining room':      'dining room',
  'dining':           'dining room',
  'din rm':           'dining room',
  'din room':         'dining room',
  'dining area':      'dining room',
  'breakfast':        'breakfast',
  'breakfast room':   'breakfast',
  'breakfast nook':   'breakfast',
  'brkfst':           'breakfast',
  'nook':             'breakfast',
  'eat in kitchen':   'breakfast',
  'eating area':      'breakfast',
  'eat in':           'breakfast',
  // ── Bathroom ─────────────────────────────────────────────────────────────
  'bathroom':         'bathroom',
  'bath room':        'bathroom',
  'bath':             'bathroom',
  'full bath':        'bathroom',
  'full bathroom':    'bathroom',
  'master bath':      'master bath',
  'master bathroom':  'master bath',
  'm bath':           'master bath',
  'm bathroom':       'master bath',
  'ensuite':          'ensuite',
  'en suite':         'ensuite',
  'en-suite':         'ensuite',
  'half bath':        'half bath',
  'half bathroom':    'half bath',
  'powder room':      'half bath',
  'powder':           'half bath',
  'powder rm':        'half bath',
  'lavatory':         'half bath',
  'lav':              'half bath',
  'toilet':           'half bath',
  'wc':               'half bath',
  // ── Entry / Hall ─────────────────────────────────────────────────────────
  'entry':            'entry',
  'entryway':         'entry',
  'entrance':         'entry',
  'foyer':            'foyer',
  'hallway':          'hallway',
  'hall':             'hallway',
  'corridor':         'hallway',
  'landing':          'hallway',
  'mudroom':          'mudroom',
  'mud room':         'mudroom',
  'mud':              'mudroom',
  'mud rm':           'mudroom',
  // ── Office / Study ───────────────────────────────────────────────────────
  'office':           'office',
  'home office':      'office',
  'study':            'study',
  'den':              'den',
  'library':          'library',
  'workroom':         'office',
  'work room':        'office',
  // ── Utility / Mechanical ────────────────────────────────────────────────
  'laundry':          'laundry',
  'laundry room':     'laundry',
  'utility':          'utility',
  'utility room':     'utility',
  'mechanical':       'mechanical',
  'mechanical room':  'mechanical',
  'mech':             'mechanical',
  'mech room':        'mechanical',
  'hvac':             'mechanical',
  'boiler room':      'mechanical',
  // ── Storage / Closet ────────────────────────────────────────────────────
  'storage':          'storage',
  'storage room':     'storage',
  'closet':           'closet',
  'walk in closet':   'closet',
  'walk-in closet':   'closet',
  'wic':              'closet',
  'pantry':           'pantry',
  'linen':            'linen',
  'linen closet':     'linen',
  // ── Rec / Bonus / Basement ──────────────────────────────────────────────
  'basement':         'basement',
  'rec room':         'rec room',
  'recreation room':  'rec room',
  'rec':              'rec room',
  'game room':        'game room',
  'games room':       'game room',
  'media room':       'media room',
  'theater':          'media room',
  'home theater':     'media room',
  'theatre':          'media room',
  'gym':              'gym',
  'exercise':         'gym',
  'exercise room':    'gym',
  'fitness':          'gym',
  'fitness room':     'gym',
  'bonus room':       'bonus room',
  'bonus':            'bonus room',
  // ── Outdoor / Attached ──────────────────────────────────────────────────
  'garage':           'garage',
  '2 car garage':     'garage',
  '3 car garage':     'garage',
  'patio':            'patio',
  'porch':            'porch',
  'front porch':      'porch',
  'back porch':       'porch',
  'screened porch':   'porch',
  'covered porch':    'porch',
  'deck':             'deck',
  'sunroom':          'sunroom',
  'sun room':         'sunroom',
  'florida room':     'sunroom',
}));

/**
 * Normalise raw text to a canonical label, or null if not a known room type.
 *
 * Steps:
 *  1. Lowercase + strip non-alphanumeric/space
 *  2. Remove trailing numbers ("bedroom 2" → "bedroom")
 *  3. Lookup alias table
 *  4. Strip "room" suffix and retry (e.g. "study room" → "study")
 */
function normalizeLabel(raw) {
  if (!raw || typeof raw !== 'string') return null;

  // Step 1: lowercase, remove punctuation except spaces
  let s = raw.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;

  // Step 2: remove trailing ordinal/number ("bedroom 2", "bed 3", "bath 1st")
  s = s.replace(/\s+(?:\d+(?:st|nd|rd|th)?|\d+)$/, '').trim();
  s = s.replace(/\s+(?:no|#)\s*\d+$/, '').trim();

  // Step 3: direct alias lookup
  if (ROOM_ALIASES.has(s)) return ROOM_ALIASES.get(s);

  // Step 4: try without leading/trailing noise words
  const withoutRoom = s.replace(/\s*\broom\b\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (withoutRoom && withoutRoom !== s && ROOM_ALIASES.has(withoutRoom)) {
    return ROOM_ALIASES.get(withoutRoom);
  }

  // Step 5: prefix match for numbered bedrooms inline ("bedroom2", "bed2")
  for (const [key, val] of ROOM_ALIASES) {
    if (s.startsWith(key) && /^\d*$/.test(s.slice(key.length).trim())) return val;
  }

  return null; // not a known room type
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function polygonArea(verts) {
  let a = 0;
  for (let i = 0, n = verts.length; i < n; i++) {
    const j = (i + 1) % n;
    a += verts[i].x * verts[j].y - verts[j].x * verts[i].y;
  }
  return Math.abs(a) / 2;
}

function polygonCentroid(verts) {
  const n = verts.length;
  if (n === 0) return { x: 0, y: 0 };
  let cx = 0, cy = 0;
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = verts[i].x * verts[j].y - verts[j].x * verts[i].y;
    signedArea += cross;
    cx += (verts[i].x + verts[j].x) * cross;
    cy += (verts[i].y + verts[j].y) * cross;
  }
  if (Math.abs(signedArea) < 1e-12) {
    return { x: verts.reduce((s,v) => s+v.x, 0)/n, y: verts.reduce((s,v) => s+v.y, 0)/n };
  }
  const f = 1 / (3 * signedArea);
  return { x: cx * f, y: cy * f };
}

function pointInPolygon(p, verts) {
  const n = verts.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = verts[i].x, yi = verts[i].y;
    const xj = verts[j].x, yj = verts[j].y;
    if ((yi > p.y) !== (yj > p.y) &&
        p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function distSq(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function distPointToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx*dx + dy*dy;
  if (lenSq === 0) return Math.sqrt(distSq(p, a));
  const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.y-a.y)*dy) / lenSq));
  return Math.sqrt(distSq(p, { x: a.x+t*dx, y: a.y+t*dy }));
}

// ─── Room extraction ──────────────────────────────────────────────────────────

function isClosedPolyline(entity) {
  if (entity.closed) return true;
  const verts = entity.vertices;
  if (verts.length < 2) return false;
  const first = verts[0], last = verts[verts.length - 1];
  return Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6;
}

// Filter polygons: must have >= 3 unique vertices, area > minArea.
// Only filters obviously degenerate polygons (near-zero area, fewer than 3
// unique vertices).  We do NOT filter by relative area to avoid discarding
// large-but-valid rooms; the label-association step handles non-room polygons
// by leaving them unlabeled.
function filterPolygons(rawPolygons) {
  if (rawPolygons.length === 0) return [];

  const result = [];
  for (const verts of rawPolygons) {
    // Deduplicate closing vertex
    const last = verts[verts.length - 1];
    const first = verts[0];
    const deduped = (Math.abs(last.x - first.x) < 1e-6 && Math.abs(last.y - first.y) < 1e-6)
      ? verts.slice(0, -1) : verts;
    if (deduped.length < 3) continue;
    // Unique-vertex check
    const seen = new Set(deduped.map(v => `${v.x.toFixed(4)},${v.y.toFixed(4)}`));
    if (seen.size < 3) continue;
    const area = polygonArea(deduped);
    if (area < 1e-6) continue; // near-zero / degenerate
    result.push(deduped);
  }
  return result;
}

/**
 * Associate each text label to a polygon.
 * Returns an array parallel to `polygons`: each entry is the best label or null.
 */
function associateLabels(labels, polygons, maxDistFraction = 0.15) {
  if (polygons.length === 0 || labels.length === 0) return polygons.map(() => null);

  // Compute overall plan extent for scaling the maxDist heuristic
  const allPts = polygons.flat();
  const xs = allPts.map(p => p.x), ys = allPts.map(p => p.y);
  const planW = Math.max(...xs) - Math.min(...xs);
  const planH = Math.max(...ys) - Math.min(...ys);
  const maxDist = Math.max(planW, planH) * maxDistFraction;

  const centroids = polygons.map(polygonCentroid);
  const polyLabels = polygons.map(() => ({ label: null, confidence: -1 }));

  for (const lbl of labels) {
    const pos = { x: lbl.x, y: lbl.y };

    // Step 1: containment
    const containing = [];
    for (let pi = 0; pi < polygons.length; pi++) {
      if (pointInPolygon(pos, polygons[pi])) containing.push(pi);
    }

    let bestIdx = -1, bestConf = -1;
    if (containing.length === 1) {
      bestIdx = containing[0]; bestConf = 1.0;
    } else if (containing.length > 1) {
      // Pick smallest containing polygon (most specific)
      const areas = containing.map(pi => polygonArea(polygons[pi]));
      const minIdx = areas.indexOf(Math.min(...areas));
      bestIdx = containing[minIdx]; bestConf = 0.8;
    } else {
      // Step 2: nearest centroid within maxDist
      let minD = Infinity;
      for (let pi = 0; pi < centroids.length; pi++) {
        const d = Math.sqrt(distSq(pos, centroids[pi]));
        if (d < minD) { minD = d; bestIdx = pi; }
      }
      if (bestIdx >= 0 && minD <= maxDist) {
        bestConf = 0.4 * (1 - minD / maxDist);
      } else {
        bestIdx = -1;
      }
    }

    if (bestIdx >= 0 && bestConf > polyLabels[bestIdx].confidence) {
      polyLabels[bestIdx] = { label: lbl.normalizedLabel, confidence: bestConf };
    }
  }

  return polyLabels.map(pl => pl.label);
}

/**
 * Build adjacency edges: two rooms are adjacent when their boundaries are
 * within `threshold` plan units of each other.
 */
function buildEdges(rooms, threshold) {
  const edges = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const pa = rooms[i].polygon, pb = rooms[j].polygon;
      // Fast bbox reject
      const axs = pa.map(v=>v.x), ays = pa.map(v=>v.y);
      const bxs = pb.map(v=>v.x), bys = pb.map(v=>v.y);
      const aminX = Math.min(...axs), amaxX = Math.max(...axs);
      const aminY = Math.min(...ays), amaxY = Math.max(...ays);
      const bminX = Math.min(...bxs), bmaxX = Math.max(...bxs);
      const bminY = Math.min(...bys), bmaxY = Math.max(...bys);
      if (aminX > bmaxX + threshold || bminX > amaxX + threshold ||
          aminY > bmaxY + threshold || bminY > amaxY + threshold) continue;
      // Polygon boundary distance
      let minDist = Infinity;
      for (let ai = 0; ai < pa.length && minDist > 0; ai++) {
        for (let bi = 0; bi < pb.length; bi++) {
          const d = distPointToSegment(pa[ai], pb[bi], pb[(bi+1)%pb.length]);
          if (d < minDist) minDist = d;
        }
      }
      if (minDist <= threshold) {
        edges.push({ a: rooms[i].id, b: rooms[j].id, dist: minDist });
      }
    }
  }
  return edges;
}

// ─── Per-DXF plan graph extraction ───────────────────────────────────────────

const ADJACENCY_THRESHOLD_FRACTION = 0.02; // 2% of plan width

function extractPlanGraph(name, text) {
  const entities = parseDxfEntities(text);

  // Debug: entity type counts + sample text strings
  if (DEBUG) {
    const counts = {};
    for (const e of entities) counts[e.type] = (counts[e.type] ?? 0) + 1;
    const textSamples = entities.filter(e => e.type === 'TEXT' || e.type === 'MTEXT')
      .slice(0, 20).map(e => `[${e.type}] "${e.text}"`);
    console.log(`\n--- DEBUG ${name} ---`);
    console.log('Entity counts:', counts);
    console.log('Text samples:', textSamples);
  }

  // Extract closed polygons
  const rawPolygons = [];
  for (const e of entities) {
    if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.vertices.length >= 3) {
      if (isClosedPolyline(e)) rawPolygons.push(e.vertices);
    }
  }

  // Extract text labels
  const textEntities = entities.filter(e => e.type === 'TEXT' || e.type === 'MTEXT');
  const labels = textEntities.map(e => ({
    text: e.text,
    x: e.x,
    y: e.y,
    normalizedLabel: normalizeLabel(e.text),
  })).filter(l => l.normalizedLabel !== null);

  // Filter polygons to room-sized polygons
  const polygons = filterPolygons(rawPolygons);

  if (DEBUG) {
    console.log(`Closed polygons raw=${rawPolygons.length} filtered=${polygons.length}`);
    console.log(`Text entities total=${textEntities.length} recognized=${labels.length}`);
    if (labels.length > 0) {
      console.log('Recognized labels:', [...new Set(labels.map(l => l.normalizedLabel))].join(', '));
    }
  }

  if (polygons.length === 0) {
    return { rooms: [], edges: [], stats: { rawPolygons: rawPolygons.length, filtered: 0, textTotal: textEntities.length, recognized: labels.length } };
  }

  // Compute plan extent for adjacency threshold
  const allPts = polygons.flat();
  const planW = Math.max(...allPts.map(v=>v.x)) - Math.min(...allPts.map(v=>v.x));
  const adjacencyThreshold = Math.max(planW * ADJACENCY_THRESHOLD_FRACTION, 1);

  // Associate labels to polygons
  const polyLabels = associateLabels(labels, polygons);

  // Build rooms
  const rooms = polygons.map((polygon, i) => ({
    id: `r-${String(i).padStart(4, '0')}`,
    label: polyLabels[i],
    area: polygonArea(polygon),
    centroid: polygonCentroid(polygon),
    polygon,
  }));

  // Build adjacency edges
  const edges = buildEdges(rooms, adjacencyThreshold);

  return {
    rooms,
    edges,
    stats: {
      rawPolygons: rawPolygons.length,
      filtered: polygons.length,
      textTotal: textEntities.length,
      recognized: labels.length,
    },
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[extract] Starting extraction');
  console.log(`[extract] ZIP: ${ZIP_PATH}`);
  console.log(`[extract] OUT: ${OUT_DIR}`);

  mkdirSync(OUT_DIR, { recursive: true });

  let entries;
  try {
    entries = readZipEntries(ZIP_PATH);
  } catch (err) {
    console.error(`[extract] Failed to read ZIP: ${err.message}`);
    process.exit(1);
  }

  console.log(`[extract] Found ${entries.length} DXF entries in ZIP`);

  if (entries.length === 0) {
    console.error('[extract] No DXF files found in ZIP. Check ZIP_PATH.');
    process.exit(1);
  }

  const toProcess = entries.slice(0, MAX_FILES);
  const manifest = {
    schemaVersion: 'PlanGraphManifest@v1',
    generatedAt: new Date().toISOString(),
    totalFiles: toProcess.length,
    plans: [],
    summary: { totalRooms: 0, plansWithRooms: 0, plansWithLabels: 0, totalEdges: 0 },
  };

  // Per-file stats for summary
  const roomCounts = [];
  const labelCounts = [];
  const allLabelsSeen = new Map();

  for (const entry of toProcess) {
    const text = entry.data.toString('utf8');
    const planId = createHash('sha256').update(entry.data).digest('hex');
    const outFile = join(OUT_DIR, `${planId}.plangraph.json`);

    let result;
    try {
      result = extractPlanGraph(entry.name, text);
    } catch (err) {
      console.warn(`  SKIP ${entry.name}: ${err.message}`);
      continue;
    }

    const { rooms, edges } = result;
    const labeledRooms = rooms.filter(r => r.label !== null);

    roomCounts.push(rooms.length);
    labelCounts.push(labeledRooms.length);
    for (const r of labeledRooms) {
      allLabelsSeen.set(r.label, (allLabelsSeen.get(r.label) ?? 0) + 1);
    }

    // Serialize rooms without full polygon (keep centroid + area for priors)
    const planGraph = {
      schemaVersion: 'PlanGraph@v1',
      planId,
      sourceName: entry.name,
      rooms: rooms.map(r => ({
        id: r.id,
        label: r.label,
        area: Math.round(r.area * 100) / 100,
        cx: Math.round(r.centroid.x * 100) / 100,
        cy: Math.round(r.centroid.y * 100) / 100,
      })),
      edges: edges.map(e => ({ a: e.a, b: e.b })),
    };

    writeFileSync(outFile, JSON.stringify(planGraph, null, 2));

    const status = rooms.length > 0
      ? `rooms=${rooms.length} labeled=${labeledRooms.length} edges=${edges.length}`
      : 'rooms=0';
    console.log(`  ${entry.name.padEnd(40)} ${status}`);

    manifest.plans.push({
      planId,
      sourceName: entry.name,
      roomCount: rooms.length,
      labeledCount: labeledRooms.length,
      edgeCount: edges.length,
      file: `${planId}.plangraph.json`,
    });

    manifest.summary.totalRooms  += rooms.length;
    manifest.summary.totalEdges  += edges.length;
    if (rooms.length > 0)         manifest.summary.plansWithRooms++;
    if (labeledRooms.length > 0)  manifest.summary.plansWithLabels++;
  }

  // Write manifest
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // ── Summary stats ────────────────────────────────────────────────────────
  const total = roomCounts.length;
  const withRooms = roomCounts.filter(n => n > 0).length;
  const meanRooms = total > 0 ? (roomCounts.reduce((a,b)=>a+b,0)/total).toFixed(2) : '0';
  const sortedLabels = [...allLabelsSeen.entries()].sort((a,b) => b[1]-a[1]).slice(0, 20);

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  EXTRACTION SUMMARY');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Plans processed : ${total}`);
  console.log(`  Plans w/ rooms  : ${withRooms} / ${total}`);
  console.log(`  Mean rooms/plan : ${meanRooms}`);
  console.log(`  Total rooms     : ${manifest.summary.totalRooms}`);
  console.log(`  Total edges     : ${manifest.summary.totalEdges}`);
  console.log(`  Plans w/ labels : ${manifest.summary.plansWithLabels}`);
  console.log('\n  Room count distribution:');
  const dist = {};
  for (const n of roomCounts) {
    const bucket = n === 0 ? '0' : n <= 3 ? '1-3' : n <= 6 ? '4-6' : n <= 10 ? '7-10' : '11+';
    dist[bucket] = (dist[bucket] ?? 0) + 1;
  }
  for (const [k, v] of Object.entries(dist)) console.log(`    ${k.padStart(4)} rooms: ${v} plans`);

  if (sortedLabels.length > 0) {
    console.log('\n  Top 20 labels found:');
    for (const [label, count] of sortedLabels) {
      console.log(`    ${label.padEnd(25)} ${count}`);
    }
  }
  console.log('══════════════════════════════════════════════════════\n');

  console.log(`[extract] Manifest written: ${join(OUT_DIR, 'manifest.json')}`);
  console.log('[extract] Done.');
}

main().catch(err => { console.error('[extract] Fatal:', err); process.exit(1); });
