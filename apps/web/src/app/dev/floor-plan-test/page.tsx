'use client';

/**
 * Test fixture for cursor-overlap E2E spec.
 *
 * Uses a front-facing camera (position Z=50, looking toward Z=0) so the
 * ExtrudeGeometry rooms in the XY plane are actually within the frustum and
 * can be hit by the R3F raycaster.
 *
 * Layout: two rooms that overlap in the X=[12,16], Y=[6,12] zone.
 *   Room A (kitchen):  x=6,  y=4,  w=10, h=8   → X=[6,16],  Y=[4,12]
 *   Room B (bedroom):  x=12, y=6,  w=10, h=8   → X=[12,22], Y=[6,14]
 *
 * With OrthographicCamera(position=(20,12,50), zoom=40) and a 1280×720
 * viewport the screen formulas are:
 *   screen_x = (world_x − 4)  × 40
 *   screen_y = (21 − world_y) × 40
 *
 * Key test coordinates (world → screen):
 *   Only-A   (9,  8)  → (200, 520)
 *   Overlap  (14, 9)  → (400, 480)
 *   Only-B   (19, 10) → (600, 440)
 *   Outside  (25, 17) → (840, 160)
 */

import { Canvas } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import { RoomMesh } from '../../../components/RoomMesh';
import type { Room2D } from '@archivox/core';

const ROOM_A: Room2D = {
  id: 'test-room-a',
  type: 'kitchen',
  label: 'Kitchen (A)',
  x: 6,
  y: 4,
  width: 10,
  height: 8,
};

const ROOM_B: Room2D = {
  id: 'test-room-b',
  type: 'bedroom',
  label: 'Bedroom (B)',
  x: 12,
  y: 6,
  width: 10,
  height: 8,
};

export default function FloorPlanTestPage() {
  return (
    <div
      data-testid="floor-plan-test-root"
      style={{ width: '100vw', height: '100vh', background: '#121a16' }}
    >
      <Canvas>
        {/*
          Front-facing camera: sits at Z=50, looks toward Z=0.
          With zoom=40 and a 1280×720 viewport the effective half-frustum is
          ±16 world-units wide and ±9 world-units tall, centred on (20, 12).
          Both rooms are fully inside that frustum.
        */}
        <OrthographicCamera
          makeDefault
          position={[20, 12, 50]}
          zoom={40}
          near={0.1}
          far={200}
        />
        <ambientLight intensity={1} />
        <directionalLight position={[0, 10, 20]} intensity={0.5} />
        <RoomMesh room={ROOM_A} />
        <RoomMesh room={ROOM_B} />
      </Canvas>
    </div>
  );
}
