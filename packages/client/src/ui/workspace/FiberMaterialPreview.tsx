import { Canvas } from "@react-three/fiber";
import type { ReactNode } from "react";

function FacetedMaterialScene() {
  return <>
    <ambientLight intensity={1.7} />
    <directionalLight position={[2, 3, 4]} intensity={2.2} />
    <mesh rotation={[0.22, -0.42, 0.14]}>
      <dodecahedronGeometry args={[0.92, 0]} />
      <meshPhysicalMaterial color="#bd765d" roughness={0.28} metalness={0.2} clearcoat={0.7} />
    </mesh>
  </>;
}

export function FiberMaterialPreview({ fallback }: { fallback: ReactNode }) {
  return <Canvas aria-hidden="true" frameloop="demand" dpr={1}
    camera={{ position: [0, 0, 3.6], fov: 38 }}
    gl={{ alpha: true, antialias: false, powerPreference: "low-power" }} fallback={fallback}>
    <FacetedMaterialScene />
  </Canvas>;
}