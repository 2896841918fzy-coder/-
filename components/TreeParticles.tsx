import React, { useMemo, useRef, useState, useEffect, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Image, Float, RoundedBox } from '@react-three/drei';
import { AppMode, PhotoData } from '../types';

interface TreeParticlesProps {
  mode: AppMode;
  photos: PhotoData[];
  handPositionRef: React.MutableRefObject<{ x: number; y: number }>;
  density: number;
  sizeFactor: number;
  breathingSpeed: number;
  starBrightness: number;
  focusedId: string | null;
  onPhotoClick: (id: string) => void;
}

// --- CONFIGURATION ---
const STARDUST_COUNT = 12000;
const CUBE_COUNT = 450; // Increased slightly to ensure enough fillers + body
const BULB_COUNT = 300; 
const TREE_HEIGHT = 18;
const TREE_RADIUS_BASE = 9;
const INTRO_DURATION = 4.0; 

// --- HELPER: CUBIC EASE OUT ---
const cubicOut = (t: number) => {
    const f = t - 1.0;
    return f * f * f + 1.0;
};

// --- LOGIC FOR SPIRAL CONSTRUCTION ---
const calculateSpiralConstruction = (
    finalPos: THREE.Vector3, 
    time: number, 
    outVec: THREE.Vector3
) => {
    const normalizedHeight = (finalPos.y + (TREE_HEIGHT / 2)) / TREE_HEIGHT;
    const startDelay = normalizedHeight * 1.8;
    const travelDuration = 1.8; 
    
    let p = (time - startDelay) / travelDuration;
    
    if (p < 0) {
        const waitAngle = time * 2.0 + normalizedHeight * 10.0;
        outVec.set(Math.cos(waitAngle) * 5, -12, Math.sin(waitAngle) * 5);
        return 0; 
    }
    
    if (p > 1) {
        outVec.copy(finalPos);
        return 1;
    }
    
    const ease = cubicOut(p);
    
    const startY = -12.0; 
    const currentY = startY + (finalPos.y - startY) * ease;
    
    const finalRadius = Math.sqrt(finalPos.x * finalPos.x + finalPos.z * finalPos.z);
    const startRadius = finalRadius * 1.5 + 8.0; 
    const currentRadius = startRadius + (finalRadius - startRadius) * ease;
    
    const finalAngle = Math.atan2(finalPos.z, finalPos.x);
    
    // SLOWER: Reduced spins from PI*3 to PI*1.2 for a gentle assembly
    const totalSpins = Math.PI * 1.2; 
    const currentAngle = finalAngle - (totalSpins * (1.0 - ease));
    
    outVec.set(
        currentRadius * Math.cos(currentAngle),
        currentY,
        currentRadius * Math.sin(currentAngle)
    );
    
    return ease; 
};

// --- SHADERS & MATERIALS ---
const createShinyMaterial = (color: THREE.Color) => {
    const mat = new THREE.MeshStandardMaterial({
        color: color, roughness: 0.2, metalness: 0.8, envMapIntensity: 1.0, 
    });
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 };
        shader.uniforms.uMode = { value: 0 }; 
        shader.uniforms.uBrightness = { value: 1.0 }; 
        mat.userData.shader = shader;
        shader.vertexShader = `varying vec3 vWorldPos;\n` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4( transformed, 1.0 )).xyz;`);
        shader.fragmentShader = `uniform float uTime; uniform float uMode; uniform float uBrightness; varying vec3 vWorldPos;\n` + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
            #include <emissivemap_fragment>
            float pulse = sin(uTime + vWorldPos.x * 0.5 + vWorldPos.y * 0.5) * 0.5 + 0.5;
            float yPos = vWorldPos.y;
            float holyFactor = smoothstep(-9.0, 8.0, yPos); 
            vec3 holyColor = vec3(1.0, 0.65, 0.1); 
            float modeFactor = 1.0 - smoothstep(0.0, 0.9, uMode);
            diffuseColor.rgb = mix(diffuseColor.rgb, holyColor, holyFactor * 0.3 * modeFactor);
            vec3 baseGlow = diffuseColor.rgb * (0.1 + 0.2 * pulse);
            float holyIntensity = pow(holyFactor, 1.5) * 1.5 * modeFactor; 
            totalEmissiveRadiance += (baseGlow + (holyColor * holyIntensity)) * uBrightness;
        `);
    };
    return mat;
};

const bulbMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.9, envMapIntensity: 1.0 });
bulbMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = { value: 0 };
  shader.uniforms.uBrightness = { value: 1.0 }; 
  bulbMaterial.userData.shader = shader;
  shader.vertexShader = `varying vec3 vWorldPos;\n` + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4( transformed, 1.0 )).xyz;`);
  shader.fragmentShader = `uniform float uTime; uniform float uBrightness;\nvarying vec3 vWorldPos;\n` + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
    #include <emissivemap_fragment>
    float blinkPhase = vWorldPos.x * 0.3 + vWorldPos.y * 0.3 + vWorldPos.z * 0.3; 
    float blink = sin(uTime * 0.8 + blinkPhase); 
    blink = smoothstep(-0.2, 0.8, blink); 
    vec3 lightGlow = diffuseColor.rgb * (0.5 + 1.5 * blink); 
    totalEmissiveRadiance += lightGlow * uBrightness;
  `);
};

const vertexShader = `
  uniform float uTime; uniform float uPixelRatio; uniform float uSizeFactor; uniform float uSpeed;
  attribute vec3 aTargetPos; attribute float aScale; attribute float aSpeed; attribute float aPhase; 
  varying float vAlpha;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aScale * uSizeFactor * uPixelRatio * (50.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    float time = uTime * aSpeed * uSpeed;
    float wave = sin(time + aPhase);
    vAlpha = pow(wave * 0.5 + 0.5, 3.0);
  }
`;
const fragmentShader = `
  uniform float uBrightness; varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    if (length(uv) > 0.5) discard;
    float glow = 0.05 / (length(uv) * length(uv) + 0.05);
    gl_FragColor = vec4(vec3(1.0, 0.8, 0.4) * glow * vAlpha * uBrightness * 2.0, 1.0); 
  }
`;

// --- MAIN COMPONENT ---
export const TreeParticles: React.FC<TreeParticlesProps> = ({ 
    mode, photos, handPositionRef, density, sizeFactor, breathingSpeed, starBrightness, focusedId, onPhotoClick 
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const shaderRef = useRef<THREE.ShaderMaterial>(null);
  const bulbsRef = useRef<THREE.InstancedMesh>(null);
  const { clock } = useThree();
  
  const [mountTime] = useState(() => clock.elapsedTime);

  const materials = useMemo(() => ({
    red: createShinyMaterial(new THREE.Color('#D6001C')),
    gold: createShinyMaterial(new THREE.Color('#FFAA00')), 
    green: createShinyMaterial(new THREE.Color('#005735')),
  }), []);
  
  const stardustData = useMemo(() => {
    const pos = new Float32Array(STARDUST_COUNT * 3);
    const tTree = new Float32Array(STARDUST_COUNT * 3);
    const tScatter = new Float32Array(STARDUST_COUNT * 3);
    const sc = new Float32Array(STARDUST_COUNT);
    const sp = new Float32Array(STARDUST_COUNT);
    const ph = new Float32Array(STARDUST_COUNT);
    for (let i = 0; i < STARDUST_COUNT; i++) {
      let treeP;
      // Stardust filling logic is good, keep it
      if (Math.random() < 0.15) {
          treeP = randomOnTreeTip(TREE_HEIGHT, TREE_RADIUS_BASE);
      } else {
          treeP = randomOnTreeVolume(TREE_HEIGHT, TREE_RADIUS_BASE);
      }
      const scatP = randomInSphere(18);
      tTree[i*3] = treeP.x; tTree[i*3+1] = treeP.y; tTree[i*3+2] = treeP.z;
      tScatter[i*3] = scatP.x; tScatter[i*3+1] = scatP.y; tScatter[i*3+2] = scatP.z;
      pos[i*3] = 0; pos[i*3+1] = -20; pos[i*3+2] = 0;
      sc[i] = 0.2 + Math.random() * 0.8; 
      sp[i] = 1.0 + Math.random() * 4.0; 
      ph[i] = Math.random() * 100.0;
    }
    return { positions: pos, targetTree: tTree, targetScatter: tScatter, scales: sc, speeds: sp, phases: ph };
  }, []);

  const cubeData = useMemo(() => {
    const data = [];
    const mats = [materials.red, materials.gold, materials.green];
    
    // FILLER LOGIC: The user requested "Glowing Square Particles" to fill the gap.
    // We reserve the first 35 cubes specifically for the top "neck" of the tree.
    const FILLER_COUNT = 35;

    for(let i=0; i<CUBE_COUNT; i++) {
        let pos, scale;

        if (i < FILLER_COUNT) {
            // TOP FILLER GENERATION
            const h = TREE_HEIGHT;
            // Generate in the top 18% of the tree (just under the star)
            const distFromTip = h * 0.18 * Math.random(); 
            const y = (h / 2) - distFromTip;
            const radiusAtY = (distFromTip / h) * TREE_RADIUS_BASE;
            // Fill the volume, not just surface, so it looks dense
            const r = radiusAtY * (0.2 + 0.8 * Math.random()); 
            const angle = Math.random() * Math.PI * 2;
            pos = new THREE.Vector3(Math.cos(angle)*r, y, Math.sin(angle)*r);
            
            // Varied sizes for natural look
            scale = 0.4 + Math.random() * 0.35; 
        } else {
            // STANDARD GENERATION
            const isLarge = Math.random() < 0.3; 
            pos = surfaceOnTree(TREE_HEIGHT, TREE_RADIUS_BASE).multiplyScalar(isLarge ? 1.0 : 0.85 + Math.random() * 0.1);
            scale = isLarge ? 0.7 + Math.random() * 0.5 : 0.25 + Math.random() * 0.25;
        }

        data.push({
            id: i,
            treePos: pos,
            scatterPos: randomInSphere(14),
            baseScale: scale,
            rotationAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
            rotationSpeed: (Math.random() * 0.5 + 0.2) * (Math.random() < 0.5 ? 1 : -1),
            material: mats[i % 3]
        });
    }
    return data;
  }, [materials]);

  const bulbData = useMemo(() => {
    const data = [];
    const colors = [new THREE.Color('#FF0000'), new THREE.Color('#FFAA00')];
    
    // REVERTED: Bulbs are back to standard distribution.
    // The "filling" job is now done by the Cubes above.
    for (let i = 0; i < BULB_COUNT; i++) {
        const isLarge = Math.random() < 0.3;
        const pos = surfaceOnTree(TREE_HEIGHT, TREE_RADIUS_BASE).multiplyScalar(isLarge ? 1.0 : 0.9);
        data.push({
            treePos: pos,
            scatterPos: randomInSphere(12),
            currentPos: new THREE.Vector3(0, -20, 0),
            scale: isLarge ? 0.35 + Math.random() * 0.15 : 0.12 + Math.random() * 0.1,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
    return data;
  }, []);

  useEffect(() => {
    if (bulbsRef.current) {
        bulbData.forEach((d, i) => { bulbsRef.current!.setColorAt(i, d.color); });
        bulbsRef.current.instanceColor!.needsUpdate = true;
    }
  }, [bulbData]);

  const photoItems = useMemo(() => {
    return photos.map((photo, i) => ({
        ...photo,
        treePos: surfaceOnTree(TREE_HEIGHT, TREE_RADIUS_BASE).add(new THREE.Vector3(0, 0, 1)), 
        scatterPos: randomInSphere(8),
    }));
  }, [photos]);

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime - mountTime;
    // SLOWER: Reduced lerp speed from 2.5 to 1.5 for smoother drift
    const lerpFactor = delta * 1.5;
    const isIntro = time < INTRO_DURATION;

    // --- ROTATION CONTROL ---
    if (groupRef.current) {
        if (isIntro) {
            groupRef.current.rotation.y = time * 0.2;
            groupRef.current.rotation.x = 0;
            groupRef.current.rotation.z = 0;
        } else {
            const { x: handX, y: handY } = handPositionRef.current;
            let targetRotY, targetRotX;

            if (mode === AppMode.SCATTER) {
                // SLOWER: Reduced auto rotation from 0.1 to 0.05
                const autoRotY = time * 0.05; 
                // SLOWER: Reduced hand sensitivity
                targetRotY = autoRotY + (handX * Math.PI * 1.0); 
                targetRotX = -handY * Math.PI * 0.8; 
            } else {
                const autoRotY = time * 0.1;
                const nudgeY = handX * 3.5; 
                const nudgeX = -handY * 0.5; 
                targetRotY = autoRotY + nudgeY;
                targetRotX = nudgeX;
            }

            groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotY, delta * 3);
            groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetRotX, delta * 3);
            if (mode === AppMode.TREE) {
                 groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, 0, delta * 3);
            }
        }
    }

    if (shaderRef.current) {
        shaderRef.current.uniforms.uTime.value = time;
        shaderRef.current.uniforms.uSizeFactor.value = sizeFactor;
        shaderRef.current.uniforms.uSpeed.value = breathingSpeed;
        shaderRef.current.uniforms.uBrightness.value = starBrightness;
    }
    
    // --- STARDUST UPDATE ---
    if (pointsRef.current) {
        const attr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
        const currPos = attr.array as Float32Array;
        const activeStardustCount = Math.floor(STARDUST_COUNT * density);
        const scratchVec = new THREE.Vector3(); 
        
        for (let i = 0; i < activeStardustCount; i++) {
            let tx, ty, tz;
            if (isIntro) {
                scratchVec.set(stardustData.targetTree[i*3], stardustData.targetTree[i*3+1], stardustData.targetTree[i*3+2]);
                calculateSpiralConstruction(scratchVec, time, scratchVec);
                currPos[i*3] = scratchVec.x;
                currPos[i*3+1] = scratchVec.y;
                currPos[i*3+2] = scratchVec.z;
            } else {
                if (mode === AppMode.TREE) {
                    tx = stardustData.targetTree[i*3]; ty = stardustData.targetTree[i*3+1]; tz = stardustData.targetTree[i*3+2];
                    tx += Math.sin(time * 0.2 + ty * 0.5) * 0.05; 
                } else {
                    tx = stardustData.targetScatter[i*3]; ty = stardustData.targetScatter[i*3+1]; tz = stardustData.targetScatter[i*3+2];
                }
                const ix = i*3;
                if ((tx - currPos[ix])**2 + (ty - currPos[ix+1])**2 + (tz - currPos[ix+2])**2 > 100) {
                     currPos[ix] = tx; currPos[ix+1] = ty; currPos[ix+2] = tz;
                } else {
                     currPos[ix] += (tx - currPos[ix]) * lerpFactor;
                     currPos[ix+1] += (ty - currPos[ix+1]) * lerpFactor;
                     currPos[ix+2] += (tz - currPos[ix+2]) * lerpFactor;
                }
            }
        }
        attr.needsUpdate = true;
        pointsRef.current.geometry.setDrawRange(0, activeStardustCount);
    }

    const targetModeValue = mode === AppMode.TREE ? 0.0 : 1.0;
    (Object.values(materials) as THREE.MeshStandardMaterial[]).forEach(mat => {
        if (mat.userData.shader) {
            mat.userData.shader.uniforms.uTime.value = time * breathingSpeed;
            mat.userData.shader.uniforms.uMode.value = isIntro ? 0.0 : THREE.MathUtils.lerp(mat.userData.shader.uniforms.uMode.value, targetModeValue, delta * 2.5);
            mat.userData.shader.uniforms.uBrightness.value = starBrightness;
        }
    });

    // --- BULBS UPDATE ---
    if (bulbsRef.current) {
        const activeBulbCount = Math.floor(BULB_COUNT * density);
        bulbsRef.current.count = activeBulbCount;
        const tempObj = new THREE.Object3D();
        const scratchVec = new THREE.Vector3();

        for (let i = 0; i < activeBulbCount; i++) {
            const d = bulbData[i];
            if (isIntro) {
                const scaleFactor = calculateSpiralConstruction(d.treePos, time, scratchVec);
                d.currentPos.copy(scratchVec);
                tempObj.position.copy(scratchVec);
                tempObj.scale.setScalar(d.scale * sizeFactor * scaleFactor);
            } else {
                const target = mode === AppMode.TREE ? d.treePos : d.scatterPos;
                if (d.currentPos.distanceTo(target) > 10) d.currentPos.copy(target);
                else d.currentPos.lerp(target, lerpFactor);
                tempObj.position.copy(d.currentPos);
                tempObj.scale.setScalar(d.scale * sizeFactor);
            }
            tempObj.updateMatrix();
            bulbsRef.current!.setMatrixAt(i, tempObj.matrix);
        }
        bulbsRef.current.instanceMatrix.needsUpdate = true;
    }
    
    if (bulbMaterial.userData.shader) {
        bulbMaterial.userData.shader.uniforms.uTime.value = time * breathingSpeed;
        bulbMaterial.userData.shader.uniforms.uBrightness.value = starBrightness;
    }
  });

  const visibleCubes = useMemo(() => cubeData.slice(0, Math.floor(CUBE_COUNT * density)), [cubeData, density]);
  const showGlints = (clock.elapsedTime - mountTime) > INTRO_DURATION * 0.8;

  return (
    <group ref={groupRef}>
      <TopStar mode={mode} sizeFactor={sizeFactor} mountTime={mountTime} />
      
      {showGlints && <GlintParticles mode={mode} sizeFactor={sizeFactor} mountTime={mountTime} />}

      <points ref={pointsRef} frustumCulled={false}>
        <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={STARDUST_COUNT} array={stardustData.positions} itemSize={3} />
            <bufferAttribute attach="attributes-aScale" count={STARDUST_COUNT} array={stardustData.scales} itemSize={1} />
            <bufferAttribute attach="attributes-aSpeed" count={STARDUST_COUNT} array={stardustData.speeds} itemSize={1} />
            <bufferAttribute attach="attributes-aPhase" count={STARDUST_COUNT} array={stardustData.phases} itemSize={1} />
        </bufferGeometry>
        <shaderMaterial
            ref={shaderRef}
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            transparent={true} depthWrite={false} blending={THREE.AdditiveBlending} 
            uniforms={{
                uTime: { value: 0 },
                uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
                uSizeFactor: { value: 1.0 },
                uSpeed: { value: 1.0 },
                uBrightness: { value: 1.0 }
            }}
        />
      </points>

      {visibleCubes.map((d) => (
        <ShinyCube key={d.id} data={d} mode={mode} sizeFactor={sizeFactor} breathingSpeed={breathingSpeed} mountTime={mountTime} />
      ))}

      <instancedMesh ref={bulbsRef} args={[undefined, undefined, BULB_COUNT]} material={bulbMaterial} frustumCulled={false}>
        <sphereGeometry args={[1, 16, 16]} /> 
      </instancedMesh>

      {photoItems.map((data, i) => (
         <PhotoItem 
            key={data.id} 
            data={data} 
            mode={mode} 
            isFocused={mode === AppMode.PHOTO_ZOOM && data.id === focusedId} 
            mountTime={mountTime}
            onClick={onPhotoClick}
         />
      ))}
    </group>
  );
};

// --- SUB-COMPONENTS WITH SPIRAL SUPPORT ---

const GlintParticles: React.FC<{ mode: AppMode, sizeFactor: number, mountTime: number }> = ({ mode, sizeFactor, mountTime }) => {
    const maxCount = 25; 
    const meshRef = useRef<THREE.Points>(null);
    const [attributes] = useState(() => {
        const positions = new Float32Array(maxCount * 3);
        const phases = new Float32Array(maxCount);
        for(let i=0; i<maxCount; i++) {
            const pos = surfaceOnTree(TREE_HEIGHT, TREE_RADIUS_BASE);
            positions[i*3] = pos.x; positions[i*3+1] = pos.y; positions[i*3+2] = pos.z;
            phases[i] = Math.random();
        }
        return { positions, phases };
    });

    useLayoutEffect(() => {
        if (meshRef.current) {
            meshRef.current.geometry.setDrawRange(0, mode === AppMode.TREE ? 15 : 25);
        }
    }, [mode]);
    
    const glintVertex = `
    uniform float uTime; uniform float uSizeFactor; attribute float aPhase; varying float vAlpha;
    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vec4 mvPosition = viewMatrix * worldPos;
      gl_Position = projectionMatrix * mvPosition;
      vec3 center = vec3(0.0, position.y, 0.0);
      vec3 localNormal = normalize(position - center);
      vec3 worldNormal = normalize(mat3(modelMatrix) * localNormal);
      vec3 viewDir = normalize(cameraPosition - worldPos.xyz);
      float facing = dot(worldNormal, viewDir);
      float cycle = sin(uTime * 6.0 + aPhase * 20.0 + facing * 12.0);
      vAlpha = pow(smoothstep(0.6, 1.0, cycle), 16.0);
      gl_PointSize = (600.0 + vAlpha * 400.0) * uSizeFactor * (15.0 / -mvPosition.z) * vAlpha; 
    }`;

    const glintFragment = `
    varying float vAlpha;
    void main() {
      vec2 uv = gl_PointCoord - vec2(0.5);
      if (length(uv) > 0.49) discard;
      float x = abs(uv.x), y = abs(uv.y);
      float intensity = (0.0005/(x*x+0.0002) * pow(max(0.0, 1.0-(y/0.45)), 3.0)) + (0.0005/(y*y+0.0002) * pow(max(0.0, 1.0-(x/0.45)), 3.0));
      intensity += (0.01/(length(uv)+0.01)) * pow(max(0.0, 1.0-(length(uv)/0.4)), 3.0);
      gl_FragColor = vec4(vec3(1.0, 0.8, 0.2), intensity * vAlpha);
    }`;

    useFrame((state) => {
        if(meshRef.current) {
             const material = meshRef.current.material as THREE.ShaderMaterial;
             material.uniforms.uTime.value = state.clock.elapsedTime - mountTime;
             material.uniforms.uSizeFactor.value = sizeFactor;
        }
    });

    return (
        <points ref={meshRef}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={maxCount} array={attributes.positions} itemSize={3} />
                <bufferAttribute attach="attributes-aPhase" count={maxCount} array={attributes.phases} itemSize={1} />
            </bufferGeometry>
            <shaderMaterial 
                vertexShader={glintVertex} fragmentShader={glintFragment} transparent depthWrite={false} blending={THREE.AdditiveBlending}
                uniforms={{ uTime: { value: 0 }, uSizeFactor: { value: 1.0 } }}
            />
        </points>
    );
};

const TopStar: React.FC<{ mode: AppMode, sizeFactor: number, mountTime: number }> = ({ mode, sizeFactor, mountTime }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const treePos = useMemo(() => new THREE.Vector3(0, 10, 0), []);
    const scatterPos = useMemo(() => randomInSphere(12), []);
    const scratchVec = useRef(new THREE.Vector3());

    const starGeometry = useMemo(() => {
        const shape = new THREE.Shape();
        const points = 5;
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? 1.2 : 0.5;
            const a = (i / points) * Math.PI;
            shape[i===0?'moveTo':'lineTo'](Math.sin(a)*r, Math.cos(a)*r);
        }
        shape.closePath();
        return new THREE.ExtrudeGeometry(shape, { steps: 1, depth: 0.4, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2 });
    }, []);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        const time = state.clock.elapsedTime - mountTime;
        
        if (time < INTRO_DURATION) {
            const scaleFactor = calculateSpiralConstruction(treePos, time, scratchVec.current);
            meshRef.current.position.copy(scratchVec.current);
            meshRef.current.scale.setScalar(sizeFactor * scaleFactor);
            // SLOWER: Reduced spin speed from 4.0 to 1.5
            meshRef.current.rotation.y += delta * 1.5;
        } else {
            const target = mode === AppMode.TREE ? treePos : scatterPos;
            if (meshRef.current.position.distanceTo(target) > 10) meshRef.current.position.copy(target);
            else meshRef.current.position.lerp(target, delta * 2.0);
            
            // SLOWER: Reduced normal rotation from 1.5 to 0.5
            meshRef.current.rotation.y += delta * 0.5;
            if (mode === AppMode.TREE) meshRef.current.position.y += Math.sin(time * 2) * 0.005;
            const scale = mode === AppMode.TREE ? sizeFactor : sizeFactor * 0.5;
            meshRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), delta * 3);
        }
    });

    return <mesh ref={meshRef} geometry={starGeometry} frustumCulled={false}>
         <meshStandardMaterial color="#FFD700" emissive="#FFA500" emissiveIntensity={2.0} metalness={1.0} roughness={0.1} />
    </mesh>;
};

const ShinyCube: React.FC<any> = ({ data, mode, sizeFactor, breathingSpeed, mountTime }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const scratchVec = useRef(new THREE.Vector3());

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        const time = state.clock.elapsedTime - mountTime;

        if (time < INTRO_DURATION) {
             const scaleFactor = calculateSpiralConstruction(data.treePos, time, scratchVec.current);
             meshRef.current.position.copy(scratchVec.current);
             const scale = data.baseScale * sizeFactor * scaleFactor;
             meshRef.current.scale.setScalar(scale);
             // SLOWER: Reduced intro spin from 5.0 to 2.0
             meshRef.current.rotateOnAxis(data.rotationAxis, data.rotationSpeed * delta * 2.0); 
        } else {
            const target = mode === AppMode.TREE ? data.treePos : data.scatterPos;
            if (meshRef.current.position.distanceTo(target) > 10) meshRef.current.position.copy(target);
            else meshRef.current.position.lerp(target, delta * 2.5);
            // SLOWER: Reduced normal spin to 0.5 multiplier
            meshRef.current.rotateOnAxis(data.rotationAxis, data.rotationSpeed * delta * 0.5);
            const breath = Math.sin(time * breathingSpeed + data.id); 
            meshRef.current.scale.setScalar(data.baseScale * sizeFactor * (1 + breath * 0.1));
        }
    });
    return <RoundedBox ref={meshRef} args={[1, 1, 1]} radius={0.15} smoothness={4} material={data.material} frustumCulled={false} />;
};

const PhotoItem: React.FC<{ data: any, mode: AppMode, isFocused: boolean, mountTime: number, onClick: (id: string) => void }> = ({ data, mode, isFocused, mountTime, onClick }) => {
    const groupRef = useRef<THREE.Group>(null);
    const scratchVec = useRef(new THREE.Vector3());

    // Initialize invisible to prevent flash before first frame
    useLayoutEffect(() => { if (groupRef.current) groupRef.current.scale.set(0, 0, 0); }, []);

    useFrame((state, delta) => {
      if (!groupRef.current) return;
      const time = state.clock.elapsedTime - mountTime;
      
      // FIX #3: Spiral animation for photos too!
      if (time < INTRO_DURATION) {
          const scaleFactor = calculateSpiralConstruction(data.treePos, time, scratchVec.current);
          groupRef.current.position.copy(scratchVec.current);
          // Scale up as it arrives
          const scale = 1.0 * scaleFactor; 
          groupRef.current.scale.set(scale, scale, scale);
          
          // SLOWER: Reduced intro spin from 5.0 to 1.5
          groupRef.current.rotation.y += delta * 1.5;
      } else {
          // Normal behavior
          let target = new THREE.Vector3();
          let targetScale = 1;
          if (mode === AppMode.TREE) { target.copy(data.treePos); targetScale = 1.2; } 
          else { target.copy(data.scatterPos); targetScale = 1.2; }
          
          groupRef.current.position.lerp(target, delta * 4);
          groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 4);
          
          // FIX: Use lookAt directly to ensure it faces camera instantly without lag
          groupRef.current.lookAt(state.camera.position);
      }
    });
    
    return (
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.2}>
          <group 
            ref={groupRef} 
            scale={[0,0,0]}
            onClick={(e) => {
                e.stopPropagation();
                onClick(data.id);
            }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
          >
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
              <Image url={data.url} transparent side={THREE.DoubleSide} position={[0, 0.08, 0.06]} scale={[0.95, 0.95, 1]} />
          </group>
      </Float>
    );
};

// --- HELPERS ---

const randomInSphere = (radius: number) => {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = Math.cbrt(Math.random()) * radius;
    const sinPhi = Math.sin(phi);
    return new THREE.Vector3(
        r * sinPhi * Math.cos(theta),
        r * Math.cos(phi),
        r * sinPhi * Math.sin(theta)
    );
};

const randomOnTreeVolume = (height: number, radiusBase: number) => {
    const distFromTip = height * Math.cbrt(Math.random());
    const y = (height / 2) - distFromTip;
    const radiusAtY = (distFromTip / height) * radiusBase;
    const angle = Math.random() * Math.PI * 2;
    const r = radiusAtY * Math.sqrt(Math.random());
    return new THREE.Vector3(
        Math.cos(angle) * r,
        y,
        Math.sin(angle) * r
    );
};

const randomOnTreeTip = (height: number, radiusBase: number) => {
    const tipHeightRatio = 0.20; 
    const distFromTip = height * tipHeightRatio * Math.sqrt(Math.random());
    const y = (height / 2) - distFromTip;
    const radiusAtY = (distFromTip / height) * radiusBase;
    const angle = Math.random() * Math.PI * 2;
    const r = radiusAtY * (0.2 + 0.8 * Math.random()); 
    return new THREE.Vector3(
        Math.cos(angle) * r,
        y,
        Math.sin(angle) * r
    );
};

const surfaceOnTree = (height: number, radiusBase: number) => {
    const distFromTip = height * Math.sqrt(Math.random());
    const y = (height / 2) - distFromTip;
    const radiusAtY = (distFromTip / height) * radiusBase;
    const angle = Math.random() * Math.PI * 2;
    return new THREE.Vector3(
        Math.cos(angle) * radiusAtY,
        y,
        Math.sin(angle) * radiusAtY
    );
};
