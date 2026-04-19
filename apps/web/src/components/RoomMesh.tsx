'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import type { Room2D } from '@archivox/core';

const ROOM_COLOR: Record<string, string> = {
  kitchen:    '#f59e0b',
  bathroom:   '#38bdf8',
  bedroom:    '#a78bfa',
  living:     '#34d399',
  'living room': '#34d399',
  dining:     '#fb923c',
  office:     '#60a5fa',
  laundry:    '#94a3b8',
  garage:     '#9ca3af',
  hall:       '#e5e7eb',
  closet:     '#d1d5db',
};

const EXTRUDE_DEPTH = 2.7;

interface RoomMeshProps {
  room: Room2D;
}

export function RoomMesh({ room }: RoomMeshProps) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(room.x, room.y);
    shape.lineTo(room.x + room.width, room.y);
    shape.lineTo(room.x + room.width, room.y + room.height);
    shape.lineTo(room.x, room.y + room.height);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, {
      depth: EXTRUDE_DEPTH,
      bevelEnabled: false,
    });
  }, [room]);

  const color = ROOM_COLOR[room.type] ?? '#e2e8f0';
  const label = room.label ?? room.id;
  const cx = room.x + room.width / 2;
  const cy = room.y + room.height / 2;

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={color} transparent opacity={0.85} />
      </mesh>
      <Html position={[cx, EXTRUDE_DEPTH + 0.05, cy]} center>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      </Html>
    </group>
  );
}
