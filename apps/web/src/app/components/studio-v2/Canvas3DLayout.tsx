'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { LayoutV1 } from '@archivox/core';
import { ROOM_COLORS } from './roomColors';

const WALL_HEIGHT = 8;

export function Canvas3DLayout({ layout }: { layout: LayoutV1 | null }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current || !layout) return;

    const container = mountRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    scene.fog = new THREE.Fog(0xf8fafc, 80, 150);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(30, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 100;
    const shadowCam = dirLight.shadow.camera as THREE.OrthographicCamera;
    shadowCam.left = -50;
    shadowCam.right = 50;
    shadowCam.top = 50;
    shadowCam.bottom = -50;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xd4e9ff, 0.3);
    fillLight.position.set(-20, 20, -10);
    scene.add(fillLight);

    const hemi = new THREE.HemisphereLight(0xdeeeff, 0xc2b280, 0.3);
    scene.add(hemi);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0xf1f5f9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    const cx = layout.dimensions.width / 2;
    const cz = layout.dimensions.depth / 2;

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(layout.dimensions.width, 0.3, layout.dimensions.depth),
      new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.8 })
    );
    slab.position.set(0, -0.15, 0);
    slab.receiveShadow = true;
    scene.add(slab);

    for (const room of layout.rooms) {
      const geo = new THREE.PlaneGeometry(room.width, room.height);
      const hex = ROOM_COLORS[String(room.type).toLowerCase()] ?? ROOM_COLORS.other;
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.9, transparent: true, opacity: 0.55 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(room.x + room.width / 2 - cx, 0.02, room.y + room.height / 2 - cz);
      scene.add(mesh);
    }

    for (const wall of layout.walls ?? []) {
      const ax = wall.a.x - cx;
      const az = wall.a.y - cz;
      const bx = wall.b.x - cx;
      const bz = wall.b.y - cz;
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;

      const thickness = Math.max(wall.thickness, 0.1);
      const height = (wall.kind ?? 'unknown') === 'exterior' ? WALL_HEIGHT : WALL_HEIGHT * 0.9;
      const color = (wall.kind ?? 'unknown') === 'exterior' ? 0xe5e7eb : 0xf3f4f6;

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(len, height, thickness),
        new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
      );

      const midX = (ax + bx) / 2;
      const midZ = (az + bz) / 2;
      mesh.position.set(midX, height / 2, midZ);

      const angle = Math.atan2(dz, dx);
      mesh.rotation.y = -angle;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    const mouse = { down: false, px: 0, py: 0 };
    const orbit = { theta: Math.PI / 4, phi: Math.PI / 4, dist: 50 };

    const updateCamera = () => {
      camera.position.x = orbit.dist * Math.sin(orbit.phi) * Math.cos(orbit.theta);
      camera.position.y = orbit.dist * Math.cos(orbit.phi);
      camera.position.z = orbit.dist * Math.sin(orbit.phi) * Math.sin(orbit.theta);
      camera.lookAt(0, 2, 0);
    };

    updateCamera();

    let raf = 0;
    let drift = 0;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (!mouse.down && !prefersReducedMotion) {
        drift += 0.0008;
        orbit.theta = Math.PI / 4 + Math.sin(drift) * 0.08;
        updateCamera();
      }
      renderer.render(scene, camera);
    };

    animate();

    const el = renderer.domElement;

    const onDown = (e: MouseEvent) => {
      mouse.down = true;
      mouse.px = e.clientX;
      mouse.py = e.clientY;
    };
    const onMove = (e: MouseEvent) => {
      if (!mouse.down) return;
      const dx = e.clientX - mouse.px;
      const dy = e.clientY - mouse.py;
      mouse.px = e.clientX;
      mouse.py = e.clientY;
      orbit.theta -= dx * 0.005;
      orbit.phi = Math.max(0.2, Math.min(Math.PI / 2 - 0.1, orbit.phi - dy * 0.005));
      updateCamera();
    };
    const onUp = () => {
      mouse.down = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbit.dist = Math.max(20, Math.min(80, orbit.dist + e.deltaY * 0.03));
      updateCamera();
    };

    el.addEventListener('mousedown', onDown);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseup', onUp);
    el.addEventListener('mouseleave', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      const w2 = container.clientWidth;
      const h2 = container.clientHeight;
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
      renderer.setSize(w2, h2);
    };

    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      el.removeEventListener('mousedown', onDown);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseup', onUp);
      el.removeEventListener('mouseleave', onUp);
      el.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [layout]);

  if (!layout) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 4L24 10V18L14 24L4 18V10L14 4Z" stroke="#94a3b8" strokeWidth="1.5" fill="none" />
              <path d="M14 4V24M4 10L24 10" stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-600">No 3D model yet</p>
          <p className="mt-1 text-xs text-slate-500">Generate a plan first</p>
        </div>
      </div>
    );
  }

  return <div ref={mountRef} className="h-full w-full" aria-label="3D floor plan model" role="img" />;
}
