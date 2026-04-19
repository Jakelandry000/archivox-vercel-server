'use client';

import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, OrbitControls } from '@react-three/drei';
import type { LayoutV1 } from '@archivox/core';
import { RoomMesh } from './RoomMesh';

interface FloorPlan3DProps {
  layout: LayoutV1;
  className?: string;
}

export function FloorPlan3D({ layout, className }: FloorPlan3DProps) {
  const { width, depth } = layout.dimensions;
  const rooms = layout.rooms.filter(r => r.width > 0 && r.height > 0);

  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Canvas shadows>
        <OrthographicCamera
          makeDefault
          position={[width / 2, 20, depth / 2]}
          zoom={40}
          near={0.1}
          far={200}
        />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} castShadow intensity={1} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[width, depth]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
        {rooms.map(room => (
          <RoomMesh key={room.id} room={room} />
        ))}
        <OrbitControls
          enablePan
          enableZoom
          maxPolarAngle={Math.PI / 2}
          target={[width / 2, 0, depth / 2]}
        />
      </Canvas>
    </div>
  );
}
