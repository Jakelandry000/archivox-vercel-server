'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, OrbitControls, Html } from '@react-three/drei';
import type { LayoutV1, Room2D, DoorElement, WindowElement } from '@archivox/core';
import { RoomMesh } from './RoomMesh';
import { WallMesh } from './WallMesh';
import { WindowMesh } from './WindowMesh';
import { DoorMesh } from './DoorMesh';

const WALL_HEIGHT = 2.7;

const ROOM_FLOOR_COLOR: Record<string, string> = {
  kitchen:       '#f59e0b',
  bathroom:      '#38bdf8',
  bedroom:       '#a78bfa',
  living:        '#34d399',
  'living room': '#34d399',
  dining:        '#fb923c',
  office:        '#60a5fa',
  laundry:       '#94a3b8',
  garage:        '#9ca3af',
  hall:          '#e5e7eb',
  closet:        '#d1d5db',
};

function RoomFloorSlab({ room }: { room: Room2D }) {
  const color = ROOM_FLOOR_COLOR[room.type] ?? '#e2e8f0';
  return (
    <mesh position={[room.x + room.width / 2, 0.01, room.y + room.height / 2]}>
      <boxGeometry args={[room.width, 0.02, room.height]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

// Thin translucent ceiling slab that closes the top of each room volume.
function RoomCeilingSlab({ room }: { room: Room2D }) {
  const color = ROOM_FLOOR_COLOR[room.type] ?? '#e2e8f0';
  return (
    <mesh position={[room.x + room.width / 2, WALL_HEIGHT, room.y + room.height / 2]}>
      <boxGeometry args={[room.width, 0.02, room.height]} />
      <meshStandardMaterial color={color} transparent opacity={0.08} />
    </mesh>
  );
}

// Always-visible room label in wall-based mode. Rendered as a DOM overlay so it
// remains legible from any orbit angle. Positioned just above ceiling height to
// clear wall tops and stay readable in isometric views.
function RoomLabel3D({ room }: { room: Room2D }) {
  const label = room.label ?? room.id;
  const cx = room.x + room.width / 2;
  const cz = room.y + room.height / 2;
  return (
    <Html position={[cx, WALL_HEIGHT + 0.15, cz]} center style={{ pointerEvents: 'none' }}>
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
      </div>
    </Html>
  );
}

interface FloorPlan3DProps {
  layout: LayoutV1;
  className?: string;
}

// Returns the explicit position if present; otherwise interpolates along the
// referenced wall segment using offsetAlongWall (defaults to midpoint 0.5).
// Returns undefined if neither position nor wallSegmentId is available.
function resolvePosition(
  el: { position?: { x: number; y: number }; wallSegmentId?: string; offsetAlongWall?: number },
  wallsById: Record<string, { start: { x: number; y: number }; end: { x: number; y: number } }>,
): { x: number; y: number } | undefined {
  if (el.position) return el.position;
  if (el.wallSegmentId) {
    const wall = wallsById[el.wallSegmentId];
    if (wall) {
      const t = el.offsetAlongWall ?? 0.5;
      return {
        x: wall.start.x + t * (wall.end.x - wall.start.x),
        y: wall.start.y + t * (wall.end.y - wall.start.y),
      };
    }
  }
  return undefined;
}

export function FloorPlan3D({ layout, className }: FloorPlan3DProps) {
  const { width, depth } = layout.dimensions;
  const rooms = layout.rooms.filter(r => r.width > 0 && r.height > 0);
  const hasWalls = (layout.walls?.length ?? 0) > 0;
  const wallsById = Object.fromEntries((layout.walls ?? []).map(w => [w.id, w]));

  // Pre-compute each wall's angle (radians) so WindowMesh and DoorMesh can
  // rotate their openings to align with the wall they sit on.
  const wallAngleById = Object.fromEntries(
    (layout.walls ?? []).map(w => {
      const dx = w.end.x - w.start.x;
      const dz = w.end.y - w.start.y;
      return [w.id, Math.atan2(dz, dx)];
    })
  );

  // Group resolved doors/windows by wallSegmentId so WallMesh can cut openings.
  const doorsByWallId = useMemo(() => {
    const map: Record<string, DoorElement[]> = {};
    for (const door of layout.doors ?? []) {
      if (!door.wallSegmentId) continue;
      const pos = resolvePosition(door, wallsById);
      if (!pos) continue;
      (map[door.wallSegmentId] ??= []).push({ ...door, position: pos });
    }
    return map;
  }, [layout.doors, wallsById]);

  const windowsByWallId = useMemo(() => {
    const map: Record<string, WindowElement[]> = {};
    for (const win of layout.windows ?? []) {
      if (!win.wallSegmentId) continue;
      const pos = resolvePosition(win, wallsById);
      if (!pos) continue;
      (map[win.wallSegmentId] ??= []).push({ ...win, position: pos });
    }
    return map;
  }, [layout.windows, wallsById]);

  // Orthographic zoom computed so the plan roughly fills the canvas at ~380px
  // regardless of layout scale. Clamped so very small or very large plans
  // remain usable (user can still zoom with OrbitControls).
  const maxDim = Math.max(width, depth, 1);
  const zoom = Math.max(15, Math.min(60, Math.round(380 / maxDim)));

  // In wall mode, camera starts at an isometric southeast position so walls,
  // doors, and windows are visible. In plan mode, stay top-down.
  const cx = width / 2;
  const cz = depth / 2;
  const camPos: [number, number, number] = hasWalls
    ? [cx + maxDim * 0.55, maxDim * 0.5, cz + maxDim * 0.65]
    : [cx, 20, cz];
  const orbitTarget: [number, number, number] = hasWalls
    ? [cx, WALL_HEIGHT / 2, cz]
    : [cx, 0, cz];

  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Canvas shadows>
        <OrthographicCamera
          makeDefault
          position={camPos}
          zoom={zoom}
          near={0.1}
          far={200}
        />
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[width / 2 + maxDim * 0.6, maxDim * 0.8, depth / 2 - maxDim * 0.3]}
          castShadow
          intensity={1.2}
        />
        <mesh position={[width / 2, 0, depth / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[width, depth]} />
          <meshStandardMaterial color="#121a16" />
        </mesh>
        {hasWalls ? (
          <>
            {rooms.map(room => (
              <RoomFloorSlab key={room.id} room={room} />
            ))}
            {rooms.map(room => (
              <RoomCeilingSlab key={`ceil-${room.id}`} room={room} />
            ))}
            {rooms.map(room => (
              <RoomLabel3D key={`lbl-${room.id}`} room={room} />
            ))}
            {layout.walls!.map(wall => (
              <WallMesh
                key={wall.id}
                wall={wall}
                doors={doorsByWallId[wall.id]}
                windows={windowsByWallId[wall.id]}
              />
            ))}
            {layout.windows?.map(win => {
              const pos = resolvePosition(win, wallsById);
              const wallAngle = win.wallSegmentId ? (wallAngleById[win.wallSegmentId] ?? 0) : 0;
              return pos ? (
                <WindowMesh key={win.id} window={{ ...win, position: pos }} wallAngle={wallAngle} />
              ) : null;
            })}
            {layout.doors?.map(door => {
              const pos = resolvePosition(door, wallsById);
              const wallAngle = door.wallSegmentId ? (wallAngleById[door.wallSegmentId] ?? 0) : 0;
              return pos ? (
                <DoorMesh key={door.id} door={{ ...door, position: pos }} wallAngle={wallAngle} />
              ) : null;
            })}
          </>
        ) : (
          rooms.map(room => (
            <RoomMesh key={room.id} room={room} units={layout.units} />
          ))
        )}
        <OrbitControls
          enablePan
          enableZoom
          maxPolarAngle={Math.PI / 2}
          target={orbitTarget}
        />
      </Canvas>
    </div>
  );
}
