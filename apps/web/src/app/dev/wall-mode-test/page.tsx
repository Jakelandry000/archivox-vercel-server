'use client';

// Visual test fixture for wall-mode rendering.
//
// Layout: 14 m × 10 m, 5 rooms, 8 wall segments.
// Elements under test:
//   - Entrance door   — south exterior wall (wall-s), x=4.5
//   - Hinged door     — living ↔ kitchen  (wall-lr-kit),      x=9,    y=2.5
//   - Hinged door     — kitchen ↔ hall    (wall-lower-upper),  x=11.5, y=5
//   - Hinged door     — bedroom ↔ bathroom (wall-bed-bath),    x=6,    y=7.5
//   - Standard window — south wall / living room,  x=2,   sill=0.9 m
//   - Standard window — south wall / kitchen,      x=11,  sill=0.9 m
//   - Standard window — north wall / bedroom,      x=3,   sill=0.9 m
//   - Clerestory window — north wall / bathroom,   x=7.5, sill=2.0 m
//
// Accessible at: /dev/wall-mode-test
// Orbit controls: drag to rotate, scroll to zoom, right-drag to pan

import type { LayoutV1 } from '@archivox/core';
import { FloorPlan3D } from '../../../components/FloorPlan3D';

const WALL_MODE_FIXTURE: LayoutV1 = {
  schemaVersion: 'layout.v1',
  units: 'meters',
  dimensions: { width: 14, depth: 10 },

  rooms: [
    { id: 'living',   type: 'living room', label: 'Living Room', x: 0, y: 0, width: 9, height: 5 },
    { id: 'kitchen',  type: 'kitchen',     label: 'Kitchen',     x: 9, y: 0, width: 5, height: 5 },
    { id: 'bedroom',  type: 'bedroom',     label: 'Bedroom',     x: 0, y: 5, width: 6, height: 5 },
    { id: 'bathroom', type: 'bathroom',    label: 'Bathroom',    x: 6, y: 5, width: 3, height: 5 },
    { id: 'hall',     type: 'hall',        label: 'Hall',        x: 9, y: 5, width: 5, height: 5 },
  ],

  walls: [
    // Exterior perimeter — 0.20 m thick
    { id: 'wall-s', type: 'exterior', start: { x: 0,  y: 0  }, end: { x: 14, y: 0  }, thickness: 0.20 },
    { id: 'wall-e', type: 'exterior', start: { x: 14, y: 0  }, end: { x: 14, y: 10 }, thickness: 0.20 },
    { id: 'wall-n', type: 'exterior', start: { x: 14, y: 10 }, end: { x: 0,  y: 10 }, thickness: 0.20 },
    { id: 'wall-w', type: 'exterior', start: { x: 0,  y: 10 }, end: { x: 0,  y: 0  }, thickness: 0.20 },
    // Interior partitions — 0.15 m thick
    { id: 'wall-lr-kit',      type: 'interior', start: { x: 9, y: 0 }, end: { x: 9,  y: 5  }, thickness: 0.15 },
    { id: 'wall-lower-upper', type: 'interior', start: { x: 0, y: 5 }, end: { x: 14, y: 5  }, thickness: 0.15 },
    { id: 'wall-bed-bath',    type: 'interior', start: { x: 6, y: 5 }, end: { x: 6,  y: 10 }, thickness: 0.15 },
    { id: 'wall-bath-hall',   type: 'interior', start: { x: 9, y: 5 }, end: { x: 9,  y: 10 }, thickness: 0.15 },
  ],

  doors: [
    // Entrance door — south exterior wall, centred on living room
    {
      id: 'door-entrance',
      type: 'entrance',
      fromRoomId: 'living',
      toRoomId: null,
      clearWidth: 1.0,
      wallSegmentId: 'wall-s',
      position: { x: 4.5, y: 0 },
    },
    // Hinged interior — living room ↔ kitchen
    {
      id: 'door-lr-kit',
      type: 'hinged',
      fromRoomId: 'living',
      toRoomId: 'kitchen',
      clearWidth: 0.90,
      wallSegmentId: 'wall-lr-kit',
      position: { x: 9, y: 2.5 },
    },
    // Hinged interior — kitchen ↔ hall
    {
      id: 'door-kit-hall',
      type: 'hinged',
      fromRoomId: 'kitchen',
      toRoomId: 'hall',
      clearWidth: 0.90,
      wallSegmentId: 'wall-lower-upper',
      position: { x: 11.5, y: 5 },
    },
    // Hinged interior — bedroom ↔ bathroom
    {
      id: 'door-bed-bath',
      type: 'hinged',
      fromRoomId: 'bedroom',
      toRoomId: 'bathroom',
      clearWidth: 0.80,
      wallSegmentId: 'wall-bed-bath',
      position: { x: 6, y: 7.5 },
    },
  ],

  windows: [
    // Standard windows on south exterior wall
    {
      id: 'win-std-living-s',
      type: 'standard',
      roomId: 'living',
      sillHeight: 0.90,
      wallSegmentId: 'wall-s',
      position: { x: 2, y: 0 },
    },
    {
      id: 'win-std-kitchen-s',
      type: 'standard',
      roomId: 'kitchen',
      sillHeight: 0.90,
      wallSegmentId: 'wall-s',
      position: { x: 11, y: 0 },
    },
    // Standard window on north exterior wall — bedroom
    {
      id: 'win-std-bedroom-n',
      type: 'standard',
      roomId: 'bedroom',
      sillHeight: 0.90,
      wallSegmentId: 'wall-n',
      position: { x: 3, y: 10 },
    },
    // Clerestory window on north exterior wall — bathroom, high sill
    {
      id: 'win-clerestory-bath-n',
      type: 'clerestory',
      roomId: 'bathroom',
      sillHeight: 2.00,
      wallSegmentId: 'wall-n',
      position: { x: 7.5, y: 10 },
    },
  ],
};

const BADGE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  background: 'rgba(18, 26, 22, 0.90)',
  border: '1px solid rgba(235, 244, 238, 0.25)',
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 11,
  color: 'rgb(235, 244, 238)',
  lineHeight: 1.7,
  pointerEvents: 'none',
  userSelect: 'none',
};

export default function WallModeTestPage() {
  return (
    <div
      data-testid="wall-mode-test-root"
      style={{ width: '100vw', height: '100vh', background: '#121a16', position: 'relative' }}
    >
      <div style={{ width: '100%', height: '100%' }}>
        <FloorPlan3D layout={WALL_MODE_FIXTURE} />
      </div>
      <div style={BADGE_STYLE}>
        <strong style={{ fontSize: 12, display: 'block', marginBottom: 2 }}>
          Wall-Mode Test Fixture
        </strong>
        14 m &times; 10 m &middot; 5 rooms &middot; 8 walls
        <br />
        1 entrance &middot; 3 hinged doors
        <br />
        3 standard windows &middot; 1 clerestory
      </div>
    </div>
  );
}
