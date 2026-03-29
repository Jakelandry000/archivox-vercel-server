import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LayoutV1, Room2D } from './layout.js';
import { Violation } from './validator.js';

// ── IBC Rule types ────────────────────────────────────────────────────────────

export interface IbcRule {
  id: string;
  description: string;
  severity: 'info' | 'warn';
  appliesTo: string[];
  params: Record<string, unknown>;
  source: string;
}

export interface IbcRuleSet {
  schemaVersion: string;
  rules: IbcRule[];
}

// ── Path resolution ───────────────────────────────────────────────────────────

const DEFAULT_IBC_REL = '../../../rules/ibc/ibc-v0.json';

function resolveIbcPath(): string {
  const envPath = typeof process !== 'undefined' ? process.env?.ARCHIVOX_IBC_RULES_PATH : undefined;
  if (envPath) return envPath;
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    return resolve(__dirname, DEFAULT_IBC_REL);
  } catch {
    return DEFAULT_IBC_REL;
  }
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let _ibcCache: IbcRuleSet | null | undefined; // undefined = not yet attempted

export function loadIbcRules(path?: string): IbcRuleSet | null {
  if (_ibcCache !== undefined) return _ibcCache;
  const resolved = path ?? resolveIbcPath();
  try {
    const raw = readFileSync(resolved, 'utf8');
    _ibcCache = JSON.parse(raw) as IbcRuleSet;
    return _ibcCache;
  } catch {
    _ibcCache = null;
    return null;
  }
}

// ── Rule application ──────────────────────────────────────────────────────────

/**
 * Apply loaded IBC rules to a layout and return additional soft violations.
 * Returns an empty array when no rules file is present.
 */
export function applyIbcRules(layout: LayoutV1, ruleset?: IbcRuleSet | null): Violation[] {
  const rs = ruleset ?? loadIbcRules();
  if (!rs) return [];

  const violations: Violation[] = [];
  const { rooms, units } = layout;
  const ftToUnit = units === 'meters' ? 0.3048 : 1;
  const validRooms = rooms.filter(r => r.width > 0 && r.height > 0);

  for (const rule of rs.rules) {
    switch (rule.id) {
      case 'ibc-001': {
        // Corridor minimum width
        const minW = (rule.params.minWidthFt as number) * ftToUnit;
        const hallRooms = validRooms.filter(r => r.type === 'hall');
        for (const r of hallRooms) {
          const minDim = Math.min(r.width, r.height);
          if (minDim < minW) {
            violations.push({
              code: rule.id,
              severity: rule.severity === 'warn' ? 'warning' : 'info',
              message: `${rule.description} Room "${r.label ?? r.id}" min dim ${minDim.toFixed(1)} ${units} < ${minW.toFixed(1)} ${units}. (${rule.source})`,
              roomIds: [r.id],
              value: minDim,
              threshold: minW,
            });
          }
        }
        break;
      }
      case 'ibc-003': {
        // Egress path: require at least one hall or entry
        const egress = rule.params.requiredTypes as string[];
        const hasEgress = validRooms.some(r => egress.includes(r.type));
        if (!hasEgress) {
          violations.push({
            code: rule.id,
            severity: 'warning',
            message: `${rule.description} (${rule.source})`,
          });
        }
        break;
      }
      case 'ibc-002':
      case 'ibc-004':
      case 'ibc-005':
        // Placeholder rules — emit info once when relevant room types are present
        if (rule.appliesTo.length === 0 || rule.appliesTo.some(t => validRooms.some(r => r.type === t))) {
          violations.push({
            code: rule.id,
            severity: 'info',
            message: `[IBC placeholder] ${rule.description} (${rule.source})`,
          });
        }
        break;
    }
  }

  return violations;
}
