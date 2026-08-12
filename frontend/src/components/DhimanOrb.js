import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function DhimanOrb({ state }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const currentMount = mountRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    
    renderer.setSize(340, 340);
    if (currentMount) currentMount.appendChild(renderer.domElement);

    const geometry = new THREE.IcosahedronGeometry(1.2, 12);
    
    let orbColor = 0x00ff88; // Default: Idle Green
    if (state === 'listening') orbColor = 0x00c8ff; // Deep Cyber Blue
    if (state === 'thinking') orbColor = 0xa855f7;  // Geometric Purple
    if (state === 'speaking') orbColor = 0x22c55e;  // Vibrant Speaking Green

    const material = new THREE.MeshBasicMaterial({
      color: orbColor,
      wireframe: true,
      transparent: true,
      opacity: 0.75
    });

    const orb = new THREE.Mesh(geometry, material);
    scene.add(orb);
    camera.position.z = 2.8;

    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (state === 'listening') {
        orb.rotation.y += 0.03;
        orb.rotation.z += 0.01;
      } else if (state === 'thinking') {
        orb.rotation.x += 0.06;
        orb.rotation.y += 0.04;
      } else if (state === 'speaking') {
        orb.rotation.y += 0.025;
        orb.rotation.x += 0.015;
      } else {
        orb.rotation.y += 0.004;
      }

      const frequency = state === 'thinking' ? 0.01 : state === 'listening' ? 0.006 : state === 'speaking' ? 0.008 : 0.002;
      const amplitude = state === 'thinking' ? 0.15 : state === 'speaking' ? 0.12 : 0.06;
      const basePulse = 1 + Math.sin(Date.now() * frequency) * amplitude;
      
      orb.scale.set(basePulse, basePulse, basePulse);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (currentMount && renderer.domElement) {
        currentMount.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [state]);

  return <div ref={mountRef} className="flex justify-center items-center" />;
}
