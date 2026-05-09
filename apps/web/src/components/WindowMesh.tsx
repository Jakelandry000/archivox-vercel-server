'use client';

import type { WindowElement } from '@archivox/core';

// R-050: window sill height minimum 0.60m; standard window height 1.2m
const DEFAULT_WINDOW_HEIGHT = 1.2;
const DEFAULT_WINDOW_WIDTH = 0.9;
const CLERESTORY_HEIGHT = 0.4;
const GLAZING_DEPTH = 0.05;

interface WindowMeshProps {
  window: WindowElement;
  /** Angle (radians) of the wall this window sits on. Rotates the glazing panel
   *  so it faces the same direction as the wall rather than remaining axis-aligned. */
  wallAngle?: number;
}

export function WindowMesh({ window: win, wallAngle = 0 }: WindowMeshProps) {
  if (!win.position) return null;
  const sillY = Math.max(win.sillHeight, 0);
  const windowH = win.type === 'clerestory' ? CLERESTORY_HEIGHT : DEFAULT_WINDOW_HEIGHT;

  return (
    <mesh
      position={[win.position.x, sillY + windowH / 2, win.position.y]}
      rotation={[0, -wallAngle, 0]}
    >
      <boxGeometry args={[DEFAULT_WINDOW_WIDTH, windowH, GLAZING_DEPTH]} />
      <meshStandardMaterial color="#7dd3fc" transparent opacity={0.55} />
    </mesh>
  );
}
