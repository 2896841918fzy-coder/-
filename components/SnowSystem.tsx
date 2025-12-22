import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// --- CONFIGURATION ---
const BG_SNOW_COUNT = 3000;
const BOUNDS_Y = 40;
const BOUNDS_XZ = 60; 

// --- 1. BACKGROUND SNOW SHADER ---
const bgVertexShader = `
  uniform float uTime;
  uniform float uHeight;
  attribute float aSpeed;
  attribute float aOffset;
  varying float vAlpha;

  void main() {
    vec3 pos = position;
    
    // Fall logic
    float fallOffset = uTime * aSpeed * 2.5; // Slightly faster for better visibility
    pos.y = mod(position.y - fallOffset, uHeight) - (uHeight * 0.5);
    
    // Wind drift (sine wave based on time and height)
    pos.x += sin(uTime * 0.5 + pos.y * 0.1 + aOffset) * 0.5;
    pos.z += cos(uTime * 0.3 + pos.y * 0.1 + aOffset) * 0.5;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    
    // Size calculation
    gl_PointSize = (50.0 * aSpeed + 25.0) * (1.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    
    // Fade out at top and bottom
    float normY = (pos.y + uHeight * 0.5) / uHeight;
    vAlpha = smoothstep(0.0, 0.15, normY) * (1.0 - smoothstep(0.85, 1.0, normY));
  }
`;

const bgFragmentShader = `
  varying float vAlpha;
  
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float dist = length(uv);
    if (dist > 0.5) discard;
    
    // Soft blurry dot
    float alpha = (1.0 - smoothstep(0.0, 0.5, dist)) * 0.5;
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha * vAlpha * 0.8); 
  }
`;

export const SnowSystem: React.FC = () => {
  const bgRef = useRef<THREE.ShaderMaterial>(null);

  // --- Background Data ---
  const bgData = useMemo(() => {
    const positions = new Float32Array(BG_SNOW_COUNT * 3);
    const speeds = new Float32Array(BG_SNOW_COUNT);
    const offsets = new Float32Array(BG_SNOW_COUNT);

    for (let i = 0; i < BG_SNOW_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * BOUNDS_XZ;
      positions[i * 3 + 1] = (Math.random() - 0.5) * BOUNDS_Y;
      // Z-depth distribution:
      // Keep most snow behind (negative Z) to avoid clutter, 
      // but allow some range for depth.
      positions[i * 3 + 2] = -15 + Math.random() * 25; 
      speeds[i] = 0.5 + Math.random() * 0.5;
      offsets[i] = Math.random() * 100;
    }
    return { positions, speeds, offsets };
  }, []);

  // IMPORTANT: Memoize uniforms to prevent recreation on every render.
  // This fixes the issue where snow stops moving because the uniform reference changes.
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uHeight: { value: BOUNDS_Y }
  }), []);

  useFrame((state) => {
    if (bgRef.current) {
      bgRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <group>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={BG_SNOW_COUNT} array={bgData.positions} itemSize={3} />
          <bufferAttribute attach="attributes-aSpeed" count={BG_SNOW_COUNT} array={bgData.speeds} itemSize={1} />
          <bufferAttribute attach="attributes-aOffset" count={BG_SNOW_COUNT} array={bgData.offsets} itemSize={1} />
        </bufferGeometry>
        <shaderMaterial
          ref={bgRef}
          vertexShader={bgVertexShader}
          fragmentShader={bgFragmentShader}
          transparent
          depthWrite={false}
          uniforms={uniforms}
        />
      </points>
    </group>
  );
};
