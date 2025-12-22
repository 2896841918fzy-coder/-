import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { TreeParticles } from './TreeParticles';
import { FocusedPhoto } from './FocusedPhoto';
import { SnowSystem } from './SnowSystem';
import { AppMode, PhotoData } from '../types';

interface SceneProps {
  mode: AppMode;
  photos: PhotoData[];
  handPositionRef: React.MutableRefObject<{ x: number; y: number }>;
  density: number;
  sizeFactor: number;
  breathingSpeed: number;
  starBrightness: number;
  activePhoto: PhotoData | null;
  onPhotoClick: (id: string) => void;
}

const CameraHandler: React.FC<{ mode: AppMode, controlsRef: React.RefObject<any> }> = ({ mode, controlsRef }) => {
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    // When switching to TREE mode, trigger the camera reset animation
    if (mode === AppMode.TREE) {
      setIsResetting(true);
    }
  }, [mode]);

  useFrame((state, delta) => {
    if (isResetting && controlsRef.current) {
      const camera = state.camera;
      const targetPos = new THREE.Vector3(0, 2, 36);
      const targetLookAt = new THREE.Vector3(0, 0, 0);

      // Smoothly interpolate camera position
      camera.position.lerp(targetPos, delta * 3.0);
      
      // Smoothly interpolate controls target (where the camera looks)
      controlsRef.current.target.lerp(targetLookAt, delta * 3.0);
      controlsRef.current.update();

      // Stop animation when close enough to save performance
      if (camera.position.distanceTo(targetPos) < 0.1 && 
          controlsRef.current.target.distanceTo(targetLookAt) < 0.1) {
        setIsResetting(false);
      }
    }
  });

  return null;
};

export const Scene: React.FC<SceneProps> = ({ 
    mode, photos, handPositionRef, density, sizeFactor, breathingSpeed, starBrightness, activePhoto, onPhotoClick 
}) => {
  const controlsRef = useRef<any>(null);

  return (
    <Canvas
      shadows
      camera={{ position: [0, 2, 36], fov: 45 }} 
      dpr={[1, 2]} 
      gl={{ 
        antialias: false, 
        powerPreference: "high-performance",
        alpha: false,
        stencil: false,
        depth: true,
        toneMappingExposure: 1.0 
      }}
    >
      <color attach="background" args={['#000000']} /> 
      
      <ambientLight intensity={0.2} /> 
      
      <pointLight position={[10, 10, 10]} intensity={2.0} color="#fff0dd" />
      <pointLight position={[-10, -5, 5]} intensity={1.0} color="#cceeff" />
      <directionalLight position={[0, 10, 0]} intensity={0.8} color="#ffffff" />
      
      <Environment preset="city" background={false} />

      <CameraHandler mode={mode} controlsRef={controlsRef} />

      <SnowSystem />

      <TreeParticles 
        mode={mode} 
        photos={photos} 
        handPositionRef={handPositionRef}
        density={density}
        sizeFactor={sizeFactor}
        breathingSpeed={breathingSpeed}
        starBrightness={starBrightness}
        focusedId={null} 
        onPhotoClick={onPhotoClick}
      />

      {/* Always render FocusedPhoto if we have an active photo. 
          The component itself handles the enter/exit animations via isZoomed. */}
      {activePhoto && (
        <FocusedPhoto 
          data={activePhoto} 
          isZoomed={mode === AppMode.PHOTO_ZOOM}
        />
      )}

      <EffectComposer disableNormalPass>
        <Bloom 
          luminanceThreshold={0.7} 
          mipmapBlur 
          intensity={1.5} 
          radius={0.5} 
          levels={8}
        />
        <Vignette eskil={false} offset={0.1} darkness={0.7} />
      </EffectComposer>

      {/* Disabled autoRotate to allow full hand control without fighting the camera orbit */}
      <OrbitControls 
        ref={controlsRef}
        enableZoom={true} 
        enablePan={false} 
        dampingFactor={0.05} 
        autoRotate={false} 
      />
    </Canvas>
  );
};
