/**
 * LLM-backed room program extractor.
 *
 * Calls the Claude API (claude-haiku-4-5) to parse a natural-language floor
 * plan description and return a structured list of rooms with dimensions.
 * Falls back gracefully to null when ANTHROPIC_API_KEY is absent or the
 * API call fails — callers should treat null as "use heuristic fallback".
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Units } from '@archivox/core';

export type PlannedRoom = {
  id?: string;
  type: string;
  width: number;
  height: number;
  label?: string;
};

export type PlannedDoor = {
  id?: string;
  type: 'hinged' | 'sliding' | 'entrance' | 'other';
  fromRoomId: string;
  toRoomId: string | null;
  clearWidth: number;
  wallSegmentId?: string;
  /** Normalized offset [0–1] along the wall from start to end; omit for midpoint */
  offsetAlongWall?: number;
};

export type PlannedWindow = {
  id?: string;
  roomId: string;
  sillHeight: number;
  wallSegmentId?: string;
  type?: 'standard' | 'glazed' | 'clerestory';
  /** Normalized offset [0–1] along the wall from start to end; omit for midpoint */
  offsetAlongWall?: number;
};

export type RoomProgram = {
  rooms: PlannedRoom[];
  doors?: PlannedDoor[];
  windows?: PlannedWindow[];
};

const SYSTEM_PROMPT = `You are an expert residential floor plan analyst.
Given a plain-language description of a floor plan, output a JSON room program.
Return ONLY valid JSON — no markdown, no explanation — matching this exact schema:
{
  "rooms": [
    { "id": "<room_id>", "type": "<room type>", "width": <number>, "height": <number>, "label": "<room name>" }
  ],
  "doors": [
    { "id": "<door_id>", "type": "hinged|sliding|entrance|other", "fromRoomId": "<room_id>", "toRoomId": "<room_id or null>", "clearWidth": <number>, "offsetAlongWall": <0–1, omit if midpoint> }
  ],
  "windows": [
    { "id": "<window_id>", "roomId": "<room_id>", "sillHeight": <number>, "type": "standard|glazed|clerestory", "offsetAlongWall": <0–1, omit if midpoint> }
  ]
}

Guidelines:
- Every room MUST include an "id" (e.g. "living_room_1", "kitchen_1") and a "label" (e.g. "Living Room", "Kitchen").
- Always include at least one living room, one kitchen, and one bathroom.
- Common room types (lowercase): "living room", "kitchen", "bedroom", "master bedroom",
  "bathroom", "dining room", "hallway", "office", "garage", "laundry", "storage",
  "entrance", "terrace".
- In feet: bedroom 10-14 wide, master bedroom 12-16 wide, bathroom 6-9 wide,
  kitchen 10-14 wide, living room 14-20 wide, garage 20-24 wide, hallway 4-8 wide.
- In meters: divide foot values by 3.28.
- width and height must be positive numbers.
- doors and windows are optional — include them only when the description specifies them.
- offsetAlongWall: normalized [0–1] position along a wall from its start to end; omit the
  field entirely when placing at the midpoint (0.5). Only set it for non-midpoint placements.
- Door clearWidth: interior hinged 0.8–0.9m, entrance 0.9–1.0m, sliding 1.2–2.4m.
- Window sillHeight: 0.6–1.0m (or 24–40 inches) above finished floor level.`;

/**
 * Uses the Claude API to convert a text prompt into a room program.
 * Returns null if ANTHROPIC_API_KEY is unset, or if parsing/network fails.
 */
export async function extractRoomProgram(
  prompt: string,
  units: Units,
  targetWidth: number,
  targetDepth: number,
): Promise<RoomProgram | null> {
  const apiKey = typeof process !== 'undefined' ? process.env?.ANTHROPIC_API_KEY : undefined;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const userMessage =
    `Floor plan description: "${prompt}"\n` +
    `Canvas: approximately ${targetWidth} × ${targetDepth} ${units}.\n` +
    `Return the room program as JSON.`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    if (!text) return null;

    // Strip markdown code fences if the model wrapped the JSON.
    const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as RoomProgram).rooms) ||
      (parsed as RoomProgram).rooms.length === 0
    ) {
      return null;
    }

    // Sanitize: ensure every room has positive numeric dimensions and a string type.
    const rooms: PlannedRoom[] = (parsed as RoomProgram).rooms
      .filter(
        r =>
          r &&
          typeof r.type === 'string' &&
          r.type.length > 0 &&
          typeof r.width === 'number' && r.width > 0 &&
          typeof r.height === 'number' && r.height > 0,
      )
      .map((r, i) => ({
        id: typeof r.id === 'string' && r.id.length > 0 ? r.id : undefined,
        type: r.type,
        width: r.width,
        height: r.height,
        label: r.label ?? r.type,
      }));

    const rawDoors = Array.isArray((parsed as RoomProgram).doors)
      ? (parsed as RoomProgram).doors
      : undefined;
    const doors: PlannedDoor[] | undefined = rawDoors
      ?.filter(
        (d: PlannedDoor) =>
          d &&
          typeof d.type === 'string' &&
          typeof d.fromRoomId === 'string' &&
          typeof d.clearWidth === 'number' && d.clearWidth > 0,
      )
      .map((d: PlannedDoor, i: number) => ({
        id: typeof d.id === 'string' && d.id.length > 0 ? d.id : `door_${i + 1}`,
        type: d.type,
        fromRoomId: d.fromRoomId,
        toRoomId: d.toRoomId ?? null,
        clearWidth: d.clearWidth,
        ...(typeof d.wallSegmentId === 'string' ? { wallSegmentId: d.wallSegmentId } : {}),
        ...(typeof d.offsetAlongWall === 'number' ? { offsetAlongWall: d.offsetAlongWall } : {}),
      }));

    const rawWindows = Array.isArray((parsed as RoomProgram).windows)
      ? (parsed as RoomProgram).windows
      : undefined;
    const windows: PlannedWindow[] | undefined = rawWindows
      ?.filter(
        (w: PlannedWindow) =>
          w &&
          typeof w.roomId === 'string' &&
          typeof w.sillHeight === 'number' && w.sillHeight >= 0,
      )
      .map((w: PlannedWindow, i: number) => ({
        id: typeof w.id === 'string' && w.id.length > 0 ? w.id : `window_${i + 1}`,
        roomId: w.roomId,
        sillHeight: w.sillHeight,
        ...(typeof w.wallSegmentId === 'string' ? { wallSegmentId: w.wallSegmentId } : {}),
        ...(typeof w.type === 'string' ? { type: w.type } : {}),
        ...(typeof w.offsetAlongWall === 'number' ? { offsetAlongWall: w.offsetAlongWall } : {}),
      }));

    if (rooms.length === 0) return null;
    return {
      rooms,
      ...(doors && doors.length > 0 ? { doors } : {}),
      ...(windows && windows.length > 0 ? { windows } : {}),
    };
  } catch {
    return null;
  }
}
