import * as THREE from "three";

/** Small office fixtures that have no dedicated mesh in the staged asset packs. */
export function createOfficePropGeometry(kind: string): THREE.Group | null {
  const root = new THREE.Group();
  const materials = {
    navy: new THREE.MeshStandardMaterial({ color: "#023047", roughness: 0.72 }),
    blue: new THREE.MeshStandardMaterial({ color: "#219ebc", roughness: 0.62 }),
    pale: new THREE.MeshStandardMaterial({ color: "#d9eef3", roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: "#d7b77b", roughness: 0.82 }),
    dark: new THREE.MeshStandardMaterial({ color: "#425b65", roughness: 0.7 }),
    mint: new THREE.MeshStandardMaterial({ color: "#70c1b3", roughness: 0.78 }),
    gold: new THREE.MeshStandardMaterial({ color: "#f6bd60", roughness: 0.76 }),
  };
  const box = (width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number, rotationZ = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.rotation.z = rotationZ;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };

  if (kind === "townhall-stage") {
    box(6, 0.32, 3, materials.wood, 0, 0.16, 0);
    box(5.6, 0.06, 2.7, materials.blue, 0, 0.35, 0);
    box(0.18, 0.12, 3, materials.navy, -2.91, 0.38, 0);
    box(0.18, 0.12, 3, materials.navy, 2.91, 0.38, 0);
  } else if (kind === "civic-park-water") {
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.045, 8),
      new THREE.MeshPhysicalMaterial({ color: "#329ec2", roughness: 0.22, metalness: 0.08, clearcoat: 0.72, clearcoatRoughness: 0.18 }),
    );
    water.position.y = 0.028;
    water.receiveShadow = true;
    root.add(water);
    const shore = new THREE.MeshStandardMaterial({ color: "#c9d2b2", roughness: 0.9 });
    box(6, 0.08, 0.16, shore, 0, 0.04, -3.94);
    box(6, 0.08, 0.16, shore, 0, 0.04, 3.94);
    box(0.16, 0.08, 7.68, shore, -2.92, 0.04, 0);
    box(0.16, 0.08, 7.68, shore, 2.92, 0.04, 0);
  } else if (kind === "civic-park-path") {
    const paving = new THREE.MeshStandardMaterial({ color: "#e8dfc8", roughness: 0.94 });
    box(2, 0.035, 2, paving, 0, 0.018, 0);
  } else if (kind === "civic-park-bridge") {
    const deck = new THREE.MeshStandardMaterial({ color: "#ba9771", roughness: 0.83 });
    box(2, 0.085, 2, deck, 0, 0.08, 0);
    for (const side of [-1, 1]) box(0.1, 0.24, 2, materials.wood, side * 0.94, 0.2, 0);
  } else if (kind === "civic-room-screen") {
    const frame = new THREE.MeshStandardMaterial({ color: "#263d49", roughness: 0.66 });
    const display = new THREE.MeshStandardMaterial({ color: "#e7f2ec", roughness: 0.55, emissive: "#38545d", emissiveIntensity: 0.12 });
    box(6, 2.65, 0.18, frame, 0, 2.15, 0);
    box(5.65, 2.32, 0.025, display, 0, 2.18, 0.105);
    box(4.4, 0.055, 0.03, materials.blue, 0, 1.25, 0.127);
    for (const side of [-1, 1]) {
      box(0.12, 0.84, 0.12, frame, side * 2.15, 0.42, 0);
      box(0.7, 0.08, 0.72, frame, side * 2.15, 0.04, 0);
    }
  } else if (kind === "townhall-podium") {
    box(0.48, 0.78, 0.42, materials.wood, 0, 0.39, 0.08);
    box(0.82, 0.12, 0.66, materials.navy, 0, 0.06, 0.08);
    box(0.76, 0.12, 0.62, materials.blue, 0, 0.82, 0.08, -0.12);
    box(0.12, 0.36, 0.12, materials.dark, -0.18, 1.03, -0.12);
  } else if (kind === "restroom-partition") {
    box(2, 1.9, 0.08, materials.pale, 0, 0.95, -0.46);
    box(0.08, 1.9, 0.92, materials.blue, -0.96, 0.95, 0);
    box(0.08, 1.9, 0.92, materials.blue, 0.96, 0.95, 0);
    box(2, 0.08, 0.08, materials.navy, 0, 0.12, -0.46);
  } else if (kind === "restroom-wash-backboard") {
    box(10.8, 2.2, 0.16, materials.pale, 0, 1.1, 0);
    box(10.8, 0.12, 0.18, materials.mint, 0, 0.06, 0);
  } else if (kind === "wayfinding-sign") {
    box(0.1, 1.25, 0.1, materials.dark, 0, 0.63, 0);
    box(1.2, 0.58, 0.08, materials.navy, 0, 1.57, 0);
    box(0.94, 0.34, 0.025, materials.pale, 0, 1.57, 0.055);
    box(0.68, 0.045, 0.02, materials.blue, 0, 1.62, 0.08);
    box(0.4, 0.035, 0.02, materials.blue, -0.14, 1.52, 0.08);
    box(0.64, 0.1, 0.46, materials.dark, 0, 0.05, 0);
  } else if (kind === "wall-picture") {
    // Front faces +Z. In the world this is rotated to sit flush against a wall.
    box(1.2, 0.9, 0.08, materials.wood, 0, 0.45, 0);
    box(1.04, 0.74, 0.025, materials.navy, 0, 0.45, 0.052);
    box(0.9, 0.6, 0.018, materials.pale, 0, 0.45, 0.075);
    box(0.9, 0.22, 0.012, materials.blue, 0, 0.29, 0.09);
    box(0.9, 0.12, 0.014, materials.mint, 0, 0.22, 0.1);
    box(0.24, 0.3, 0.016, materials.gold, -0.24, 0.54, 0.098);
    box(0.18, 0.22, 0.016, materials.wood, 0.14, 0.51, 0.098);
    box(0.12, 0.12, 0.016, materials.blue, 0.32, 0.38, 0.098);
  } else if (kind === "wall-shelf") {
    box(1.2, 0.1, 0.34, materials.wood, 0, 0.1, 0.08);
    box(1.2, 0.44, 0.06, materials.wood, 0, 0.36, -0.09);
    box(0.08, 0.2, 0.18, materials.dark, -0.43, 0.2, -0.015);
    box(0.08, 0.2, 0.18, materials.dark, 0.43, 0.2, -0.015);
    box(0.13, 0.25, 0.16, materials.blue, -0.3, 0.275, 0.04);
    box(0.12, 0.3, 0.16, materials.mint, -0.14, 0.3, 0.04);
    box(0.18, 0.22, 0.16, materials.gold, 0.08, 0.26, 0.04);
    box(0.16, 0.28, 0.16, materials.navy, 0.28, 0.29, 0.04);
  } else {
    return null;
  }

  return root;
}
