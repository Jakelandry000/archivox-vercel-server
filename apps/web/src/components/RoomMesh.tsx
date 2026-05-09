'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Room2D } from '@archivox/core';

// Tracks how many room meshes are currently hovered on the shared canvas so
// `pointerOut` on one room doesn't reset the cursor while another is still hovered.
let _hoveredRoomCount = 0;

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
  units?: 'feet' | 'meters';
}

export function RoomMesh({ room, units }: RoomMeshProps) {
  const [hovered, setHovered] = useState(false);
  const { gl } = useThree();
  // Tracks whether this instance is currently counted in _hoveredRoomCount.
  const isCountedRef = useRef(false);
  // True while a pointer-drag is in progress on the canvas; suppresses cursor
  // changes mid-drag so OrbitControls' grab cursor isn't overridden.
  const isDraggingRef = useRef(false);

  // Track OrbitControls drag so we don't fight over the cursor style mid-drag.
  // We attach to gl.domElement directly rather than R3F synthetic events because
  // OrbitControls also uses raw DOM events.
  useEffect(() => {
    const el = gl.domElement;
    const onDown = () => { isDraggingRef.current = true; };
    const onUp = () => {
      isDraggingRef.current = false;
      // Re-assert cursor after drag ends if this instance is still hovered.
      if (isCountedRef.current) el.style.cursor = 'pointer';
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointerup', onUp); };
  }, [gl.domElement]);

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
  const area = (room.width * room.height).toFixed(1);
  const unitSuffix = units === 'meters' ? 'm²' : 'ft²';

  return (
    <group>
      <mesh
        geometry={geometry}
        rotation={[Math.PI / 2, 0, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (!isCountedRef.current) { _hoveredRoomCount++; isCountedRef.current = true; }
          setHovered(true);
          if (!isDraggingRef.current) gl.domElement.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          if (isCountedRef.current) { _hoveredRoomCount = Math.max(0, _hoveredRoomCount - 1); isCountedRef.current = false; }
          setHovered(false);
          if (!isDraggingRef.current && _hoveredRoomCount === 0) gl.domElement.style.cursor = 'auto';
        }}
      >
        <meshStandardMaterial
          color={color}
          transparent
          opacity={hovered ? 1 : 0.85}
          emissive={color}
          emissiveIntensity={hovered ? 0.18 : 0}
        />
      </mesh>
      {hovered && (
        <Html position={[cx, EXTRUDE_DEPTH + 0.3, cy]} center style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(18, 26, 22, 0.88)',
            border: '1px solid rgba(235, 244, 238, 0.25)',
            borderRadius: 4,
            padding: '2px 7px',
            fontSize: 11,
            fontWeight: 600,
            color: 'rgb(235, 244, 238)',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}>
            {label}
            <span style={{ opacity: 0.65, marginLeft: 5, fontWeight: 400, fontSize: 10 }}>
              {area} {unitSuffix}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}
