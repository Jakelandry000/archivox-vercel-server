import { LayoutV1, Units, validateLayout, ValidationResult } from '@archivox/core';

export type GenerateInput = {
  prompt: string;
  units?: Units;
  width?: number;
  depth?: number;
};

export type GenerateResult = {
  layout: LayoutV1;
  validation: ValidationResult;
  /** Number of generation attempts made (1 = passed on first try) */
  attempts: number;
};

// MVP heuristic generator: cheap, deterministic, good enough to demo.
// Later: swap with an LLM-backed planner that outputs LayoutV1.
export function generateLayoutFromText(input: GenerateInput): LayoutV1 {
  const prompt = (input.prompt ?? '').toLowerCase();

  const units: Units = input.units ?? 'feet';
  const width = clampNum(input.width ?? 40, 10, 200);
  const depth = clampNum(input.depth ?? 30, 10, 200);

  const wants = {
    bedrooms: parseCount(prompt, ['bedroom', 'bedrooms', 'bed']) ?? 1,
    bathrooms: parseCount(prompt, ['bathroom', 'bathrooms', 'bath']) ?? 1,
    office: /\boffice\b/.test(prompt),
    garage: /\bgarage\b/.test(prompt),
    laundry: /\blaundry\b/.test(prompt),
    kitchen: true,
    living: true,
  };

  // Very simple packing: stack rooms in rows.
  const rooms: LayoutV1['rooms'] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowH = 0;

  const place = (type: string, w: number, h: number, label?: string) => {
    // new row if overflow
    if (cursorX + w > width) {
      cursorX = 0;
      cursorY += rowH;
      rowH = 0;
    }
    // if vertical overflow, start over (MVP: just clamp into bounds)
    if (cursorY + h > depth) {
      cursorY = Math.max(0, depth - h);
    }

    const id = `${type.replace(/\s+/g, '_')}_${rooms.length + 1}`;
    rooms.push({ id, type, label, x: cursorX, y: cursorY, width: w, height: h });
    cursorX += w;
    rowH = Math.max(rowH, h);
  };

  // Public-ish zone
  place('living room', 18, 14);
  place('kitchen', 12, 10);

  if (wants.laundry) place('laundry', 6, 6);
  if (wants.office) place('office', 10, 10);

  // Beds + baths
  for (let i = 0; i < clampNum(wants.bedrooms, 1, 6); i++) place('bedroom', 12, 10);
  for (let i = 0; i < clampNum(wants.bathrooms, 1, 4); i++) place('bathroom', 8, 8);

  if (wants.garage) place('garage', 20, 18);

  return {
    schemaVersion: 'layout.v1',
    units,
    dimensions: { width, depth },
    rooms,
  };
}

/**
 * Generates a layout and validates it.  If the score is below `scoreThreshold`,
 * retries up to `maxAttempts` total by expanding the floor-plan canvas slightly
 * (±5% per attempt) to relieve packing pressure.  Returns the highest-scoring
 * result along with its validation and the number of attempts made.
 */
export function generateAndValidate(
  input: GenerateInput,
  options: { scoreThreshold?: number; maxAttempts?: number } = {}
): GenerateResult {
  const { scoreThreshold = 70, maxAttempts = 4 } = options;

  let best: GenerateResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Each retry nudges dimensions by a small factor to vary the packing outcome
    const scaleFactor = attempt === 1 ? 1 : 1 + (attempt - 1) * 0.05;
    const tweakedInput: GenerateInput = {
      ...input,
      width: input.width ? input.width * scaleFactor : undefined,
      depth: input.depth ? input.depth * scaleFactor : undefined,
    };

    const layout = generateLayoutFromText(tweakedInput);
    const validation = validateLayout(layout);

    const result: GenerateResult = { layout, validation, attempts: attempt };

    if (!best || validation.score > best.validation.score) {
      best = result;
    }

    if (validation.score >= scoreThreshold) break;
  }

  return best!;
}

function parseCount(prompt: string, keywords: string[]): number | null {
  // crude: "3 bedroom" or "3 bedrooms"
  for (const k of keywords) {
    const re = new RegExp(`(\\d+)\\s+${escapeRegex(k)}`);
    const m = prompt.match(re);
    if (m?.[1]) return Number(m[1]);
  }
  return null;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clampNum(n: number, min: number, max: number) {
  n = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, n));
}
