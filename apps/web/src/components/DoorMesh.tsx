'use client';

import type { DoorElement } from '@archivox/core';

// R-006: interior door clear width min 0.70m; R-007: main entrance min 0.90m
const DOOR_HEIGHT = 2.1;
const DOOR_DEPTH = 0.05;

const DOOR_COLORS: Record<string, string> = {
  entrance: '#78350f',
  sliding:  '#0369a1',
  hinged:   '#92400e',
  other:    '#78716c',
};

interface DoorMeshProps {
  door: DoorElement;
  /** Angle (radians) of the wall this door sits on. Rotates the door panel
   *  so it aligns with the wall rather than remaining axis-aligned. */
  wallAngle?: number;
}

export function DoorMesh({ door, wallAngle = 0 }: DoorMeshProps) {
  if (!door.position) return null;
  const color = DOOR_COLORS[door.type] ?? DOOR_COLORS.other;

  return (
    <mesh
      position={[door.position.x, DOOR_HEIGHT / 2, door.position.y]}
      rotation={[0, -wallAngle, 0]}
    >
      <boxGeometry args={[door.clearWidth, DOOR_HEIGHT, DOOR_DEPTH]} />
      <meshStandardMaterial color={color} transparent opacity={0.85} />
    </mesh>
  );
}
