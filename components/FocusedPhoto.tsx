import React, { useRef, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Image, Float, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { PhotoData } from '../types';

interface FocusedPhotoProps {
  data: PhotoData;
  isZoomed: boolean;
}

export const FocusedPhoto: React.FC<FocusedPhotoProps> = ({ data, isZoomed }) => {
  const groupRef = useRef<THREE.Group>(null);
  const contentRef = useRef<THREE.Group>(null);

  // FIX #2: Force scale to 0 instantly on mount to prevent any flash before the first frame
  useLayoutEffect(() => {
    if (contentRef.current) {
        contentRef.current.scale.set(0, 0, 0);
    }
  }, []);

  useFrame((state, delta) => {
    if (groupRef.current && contentRef.current) {
      const camera = state.camera;

      // --- HUD LOGIC ---
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const targetPos = camera.position.clone().add(forward.multiplyScalar(5));
      const lerpAlpha = Math.min(1.0, delta * 20);
      groupRef.current.position.lerp(targetPos, lerpAlpha);
      groupRef.current.quaternion.copy(camera.quaternion);

      // --- ANIMATION LOGIC ---
      const targetScale = isZoomed ? 1.5 : 0.0;
      const animSpeed = isZoomed ? 5 : 8;
      
      contentRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * animSpeed);
    }
  });

  return (
    <group ref={groupRef}>
      <Float speed={2} rotationIntensity={0.02} floatIntensity={0.02} floatingRange={[-0.05, 0.05]}>
        {/* Scale starts at 0 */}
        <group ref={contentRef} scale={[0, 0, 0]}>
          <RoundedBox args={[1.22, 1.42, 0.05]} radius={0.05} smoothness={4} position={[0, 0, -0.01]}>
              <meshStandardMaterial color="#D4AF37" metalness={1.0} roughness={0.2} />
          </RoundedBox>
          <RoundedBox args={[1.15, 1.35, 0.06]} radius={0.02} smoothness={1} position={[0, 0, 0.01]}>
              <meshStandardMaterial color="#FDFBF7" roughness={0.9} />
          </RoundedBox>
          <group position={[0, 0.7, 0]}>
             <mesh rotation={[0, 0, Math.PI / 2]} position={[0, -0.02, 0.04]}>
                 <cylinderGeometry args={[0.04, 0.04, 0.3, 16]} />
                 <meshStandardMaterial color="#FFD700" metalness={0.9} roughness={0.3} />
             </mesh>
             <mesh position={[0, 0.08, 0.03]} rotation={[0, Math.PI / 2, 0]}>
                 <torusGeometry args={[0.08, 0.015, 8, 16]} />
                 <meshStandardMaterial color="#FFD700" metalness={1.0} roughness={0.2} />
             </mesh>
          </group>
          <Image
            url={data.url}
            transparent
            side={THREE.DoubleSide}
            position={[0, 0.08, 0.06]}
            scale={[0.95, 0.95, 1]}
          />
        </group>
      </Float>
    </group>
  );
};