'use client';

import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import type { WallSegment, DoorElement, WindowElement } from '@archivox/core';

const WALL_HEIGHT = 2.7;
const DOOR_HEIGHT = 2.1;
const DEFAULT_WINDOW_WIDTH = 0.9;
const DEFAULT_WINDOW_HEIGHT = 1.2;
const CLERESTORY_HEIGHT = 0.4;
// Tiny margin so opening edges don't z-fight with door/window panel meshes.
const VOID_MARGIN = 0.02;

// Stable empty arrays so useMemo deps don't thrash on walls with no openings.
const EMPTY_DOORS: DoorElement[] = [];
const EMPTY_WINDOWS: WindowElement[] = [];

interface WallMeshProps {
  wall: WallSegment;
  doors?: DoorElement[];
  windows?: WindowElement[];
}

// Returns the signed distance from the wall's midpoint to a world-space position,
// measured along the wall's own X axis (the along-wall direction).
function wallLocalX(wx: number, wz: number, cx: number, cz: number, angle: number): number {
  return (wx - cx) * Math.cos(angle) + (wz - cz) * Math.sin(angle);
}

export function WallMesh({ wall, doors = EMPTY_DOORS, windows = EMPTY_WINDOWS }: WallMeshProps) {
  const { start, end, thickness, type } = wall;
  const dx = end.x - start.x;
  const dz = end.y - start.y;
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dz, dx);
  const cx = (start.x + end.x) / 2;
  const cz = (start.y + end.y) / 2;
  const color = type === 'exterior' ? '#b0bec5' : '#cfd8dc';

  const geometry = useMemo(() => {
    if (length < 0.001) return null;

    if (doors.length === 0 && windows.length === 0) {
      return new THREE.BoxGeometry(length, WALL_HEIGHT, thickness);
    }

    // Build the wall's 2D profile in the XY plane (X = along wall, Y = up),
    // then extrude it by `thickness` along Z (= wall depth direction).
    const halfL = length / 2;
    const halfH = WALL_HEIGHT / 2;

    const shape = new THREE.Shape();
    shape.moveTo(-halfL, -halfH);
    shape.lineTo( halfL, -halfH);
    shape.lineTo( halfL,  halfH);
    shape.lineTo(-halfL,  halfH);
    shape.closePath();

    for (const door of doors) {
      if (!door.position) continue;
      const lx = wallLocalX(door.position.x, door.position.y, cx, cz, angle);
      const w = door.clearWidth + VOID_MARGIN;
      const h = DOOR_HEIGHT + VOID_MARGIN;
      const hole = new THREE.Path();
      hole.moveTo(lx - w / 2, -halfH);
      hole.lineTo(lx + w / 2, -halfH);
      hole.lineTo(lx + w / 2, -halfH + h);
      hole.lineTo(lx - w / 2, -halfH + h);
      hole.closePath();
      shape.holes.push(hole);
    }

    for (const win of windows) {
      if (!win.position) continue;
      const lx = wallLocalX(win.position.x, win.position.y, cx, cz, angle);
      const windowH = win.type === 'clerestory' ? CLERESTORY_HEIGHT : DEFAULT_WINDOW_HEIGHT;
      const w = DEFAULT_WINDOW_WIDTH + VOID_MARGIN;
      const sillY = Math.max(win.sillHeight, 0);
      const hole = new THREE.Path();
      hole.moveTo(lx - w / 2, -halfH + sillY);
      hole.lineTo(lx + w / 2, -halfH + sillY);
      hole.lineTo(lx + w / 2, -halfH + sillY + windowH);
      hole.lineTo(lx - w / 2, -halfH + sillY + windowH);
      hole.closePath();
      shape.holes.push(hole);
    }

    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    // ExtrudeGeometry extrudes from z=0 to z=thickness; shift to center on z=0.
    geo.translate(0, 0, -thickness / 2);
    return geo;
  }, [length, thickness, angle, cx, cz, doors, windows]);

  useEffect(() => {
    return () => { geometry?.dispose(); };
  }, [geometry]);

  if (!geometry) return null;

  return (
    <mesh
      geometry={geometry}
      position={[cx, WALL_HEIGHT / 2, cz]}
      rotation={[0, -angle, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={color} side={THREE.DoubleSide} />
    </mesh>
  );
}
