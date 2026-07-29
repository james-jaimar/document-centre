import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import type { CanvasTransformState } from "@/lib/canvasPrints/types";
import { renderFaceBitmaps } from "@/lib/canvasPrints/renderWrap";

const PREVIEW_DPI = 96;

interface Props {
  image: HTMLImageElement | HTMLCanvasElement | null;
  state: CanvasTransformState;
}


/**
 * Real 3D preview of a stretched canvas print — six textured faces of a box,
 * lit and shadowed, at a fixed 3/4 hero angle (per product decision).
 */
export default function Canvas3DPreview({ image, state }: Props) {
  if (!image) {
    return (
      <div className="w-full h-full min-h-[320px] rounded-lg bg-gradient-to-br from-neutral-100 to-neutral-200 flex items-center justify-center border">
        <p className="text-sm text-muted-foreground">Upload an image to see the finished canvas.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[320px] rounded-lg bg-gradient-to-br from-neutral-50 to-neutral-200 border overflow-hidden">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [1.2, 0.9, 1.8], fov: 32 }}
        gl={{ antialias: true, preserveDrawingBuffer: false }}
      >
        <ambientLight intensity={0.75} />
        <hemisphereLight args={["#fff4e6", "#2a3550", 0.55]} />
        <directionalLight
          position={[3, 4, 2]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight position={[-2, 2, -1]} intensity={0.35} />

        <CanvasBox image={image} state={state} />
        <ContactShadows
          position={[0, -0.55, 0]}
          opacity={0.42}
          blur={2.4}
          scale={4}
          far={2}
        />
      </Canvas>
    </div>
  );
}

/** The physical canvas box — six materials backed by CanvasTexture. */
function CanvasBox({ image, state }: { image: HTMLImageElement | HTMLCanvasElement; state: CanvasTransformState }) {
  const meshRef = useRef<THREE.Mesh>(null!);

  // Compute physical dimensions in world units. Longest edge normalised to 1.
  const dims = useMemo(() => {
    const longEdgeMm = Math.max(state.frontWidthMm, state.frontHeightMm);
    const w = state.frontWidthMm / longEdgeMm;
    const h = state.frontHeightMm / longEdgeMm;
    const d = state.wrapMm / longEdgeMm; // real depth relative to face
    return { w, h, d };
  }, [state.frontWidthMm, state.frontHeightMm, state.wrapMm]);

  // Rebuild bitmaps only when inputs that affect the artwork change.
  const bitmaps = useMemo(
    () => renderFaceBitmaps(image, state, PREVIEW_DPI),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      image,
      state.frontWidthMm,
      state.frontHeightMm,
      state.wrapMm,
      state.bleedMm,
      state.wrapMode,
      state.wrapColorHex,
      state.imageScale,
      state.imageX,
      state.imageY,
      state.imageRotation,
    ],
  );

  const textures = useMemo(() => {
    const make = (c: HTMLCanvasElement) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.needsUpdate = true;
      return t;
    };
    return {
      front: make(bitmaps.front),
      back: make(bitmaps.back),
      top: make(bitmaps.top),
      bottom: make(bitmaps.bottom),
      left: make(bitmaps.left),
      right: make(bitmaps.right),
    };
  }, [bitmaps]);

  // Dispose old textures on swap.
  useEffect(() => {
    return () => {
      Object.values(textures).forEach((t) => t.dispose());
    };
  }, [textures]);

  // Fixed 3/4 hero angle — gentle constant rotation off.
  useFrame(() => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x = -0.14;
    meshRef.current.rotation.y = -0.42;
  });

  // BoxGeometry face material order: +x (right), -x (left), +y (top), -y (bottom), +z (front), -z (back).
  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ map: textures.right, roughness: 0.85, metalness: 0 }),
      new THREE.MeshStandardMaterial({ map: textures.left, roughness: 0.85, metalness: 0 }),
      new THREE.MeshStandardMaterial({ map: textures.top, roughness: 0.85, metalness: 0 }),
      new THREE.MeshStandardMaterial({ map: textures.bottom, roughness: 0.85, metalness: 0 }),
      new THREE.MeshStandardMaterial({ map: textures.front, roughness: 0.78, metalness: 0 }),
      new THREE.MeshStandardMaterial({ map: textures.back, roughness: 0.9, metalness: 0 }),
    ],
    [textures],
  );

  useEffect(() => {
    return () => materials.forEach((m) => m.dispose());
  }, [materials]);

  return (
    <mesh ref={meshRef} castShadow receiveShadow material={materials}>
      <boxGeometry args={[dims.w, dims.h, dims.d]} />
    </mesh>
  );
}
