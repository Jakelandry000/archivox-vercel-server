'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { LayoutV1, normalizeLegacyLayout } from '@archivox/core';

const WALL_HEIGHT = 8;

type Props = {
  layout: LayoutV1 | unknown | null;
};

export function Canvas3D({ layout }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current || !layout) return;

    const l = normalizeLegacyLayout(layout);

    const container = mountRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    scene.fog = new THREE.Fog(0xf8fafc, 80, 160);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 600);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    container.appendChild(renderer.domElement);

    // Lights (studio-ish)
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(30, 45, 20);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 140;

    // DirectionalLight uses an orthographic shadow camera.
    const shadowCam = key.shadow.camera as THREE.OrthographicCamera;
    shadowCam.left = -60;
    shadowCam.right = 60;
    shadowCam.top = 60;
    shadowCam.bottom = -60;

    scene.add(key);

    const fill = new THREE.DirectionalLight(0xd4e9ff, 0.25);
    fill.position.set(-25, 25, -10);
    scene.add(fill);

    const hemi = new THREE.HemisphereLight(0xe9f3ff, 0xc2b280, 0.25);
    scene.add(hemi);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshLambertMaterial({ color: 0xf1f5f9 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    // Center the plan around origin.
    const cx = l.dimensions.width / 2;
    const cz = l.dimensions.depth / 2;

    // Slab
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(l.dimensions.width, 0.25, l.dimensions.depth),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })
    );
    slab.position.set(0, -0.125, 0);
    slab.receiveShadow = true;
    scene.add(slab);

    // Rooms: tinted floor planes
    for (const r of l.rooms) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(r.width, r.height),
        new THREE.MeshStandardMaterial({
          color: 0x10b981,
          roughness: 0.95,
          transparent: true,
          opacity: 0.08
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(r.x + r.width / 2 - cx, 0.01, r.y + r.height / 2 - cz);
      scene.add(mesh);
    }

    // Walls: if present use them, otherwise create an exterior box.
    const walls = (l.walls?.length ? l.walls : exteriorWalls(l)) ?? [];

    for (const w2d of walls) {
      const ax = w2d.a.x - cx;
      const az = w2d.a.y - cz;
      const bx = w2d.b.x - cx;
      const bz = w2d.b.y - cz;

      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;

      const thickness = Math.max(w2d.thickness, 0.1);
      const height = w2d.kind === 'exterior' ? WALL_HEIGHT : WALL_HEIGHT * 0.9;

      const mat = new THREE.MeshStandardMaterial({
        color: w2d.kind === 'exterior' ? 0xe5e7eb : 0xf3f4f6,
        roughness: 0.75
      });

      const geo = new THREE.BoxGeometry(len, height, thickness);
      const mesh = new THREE.Mesh(geo, mat);

      const midX = (ax + bx) / 2;
      const midZ = (az + bz) / 2;
      mesh.position.set(midX, height / 2, midZ);

      const angle = Math.atan2(dz, dx);
      mesh.rotation.y = -angle;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    // Orbit controls (simple)
    const mouse = { down: false, px: 0, py: 0 };
    const orbit = { theta: Math.PI / 4, phi: Math.PI / 3.6, dist: 65 };

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
      orbit.phi = clamp(orbit.phi - dy * 0.005, 0.25, Math.PI / 2 - 0.08);
      updateCamera();
    };
    const onUp = () => {
      mouse.down = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbit.dist = clamp(orbit.dist + e.deltaY * 0.03, 25, 120);
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
      // Clean scene
      scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;

        obj.geometry?.dispose?.();

        const mat = obj.material;
        if (Array.isArray(mat)) {
          for (const m of mat) m.dispose?.();
        } else {
          mat?.dispose?.();
        }
      });
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, [layout]);

  if (!layout) {
    return (
      <div className="grid h-full w-full place-items-center bg-slate-100 text-sm text-slate-500">
        Generate a layout to see the 3D model.
      </div>
    );
  }

  return <div ref={mountRef} className="h-full w-full" aria-label="3D model" role="img" />;
}

function exteriorWalls(l: LayoutV1) {
  const t = l.units === 'meters' ? 0.2 : 0.67;
  return [
    { id: 'ext_1', a: { x: 0, y: 0 }, b: { x: l.dimensions.width, y: 0 }, thickness: t, kind: 'exterior' as const },
    { id: 'ext_2', a: { x: l.dimensions.width, y: 0 }, b: { x: l.dimensions.width, y: l.dimensions.depth }, thickness: t, kind: 'exterior' as const },
    { id: 'ext_3', a: { x: l.dimensions.width, y: l.dimensions.depth }, b: { x: 0, y: l.dimensions.depth }, thickness: t, kind: 'exterior' as const },
    { id: 'ext_4', a: { x: 0, y: l.dimensions.depth }, b: { x: 0, y: 0 }, thickness: t, kind: 'exterior' as const }
  ];
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
