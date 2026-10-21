import * as THREE from "three";
import type { RoomLayout } from "@gammyverse/shared";

const PARK_GRASS_COLOR = 0x78b76b;
const PARK_GROUND_Y_M = 0.003;

/** The generated civic strip gets a distinct lawn between its two cross streets. */
export function makeCivicParkGround(layout: RoomLayout, dimensions: { width: number; depth: number }): THREE.Group | null {
  const north = layout.roadways?.find((road) => road.id === "road-major-team--1");
  const south = layout.roadways?.find((road) => road.id === "road-major-team-1");
  const west = layout.roadways?.find((road) => road.id === "road-loop-side--1");
  const east = layout.roadways?.find((road) => road.id === "road-loop-side-1");
  if (!north || !south || !west || !east) return null;

  const leftM = west.x + west.width / 2;
  const rightM = east.x - east.width / 2;
  const topM = north.z + north.depth / 2;
  const bottomM = south.z - south.depth / 2;
  if (rightM <= leftM || bottomM <= topM) return null;

  const park = new THREE.Group();
  park.name = "Civic park ground";
  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(rightM - leftM, bottomM - topM),
    new THREE.MeshStandardMaterial({ color: PARK_GRASS_COLOR, roughness: 0.98 }),
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(dimensions.width / 2 + (leftM + rightM) / 2, PARK_GROUND_Y_M, dimensions.depth / 2 + (topM + bottomM) / 2);
  lawn.receiveShadow = true;
  park.add(lawn);
  return park;
}

/**
 * A dependable visual for the broad west civic block in the compact five-team
 * campus. The block's saved props still provide collision and editing data,
 * but this geometry makes the park visible immediately instead of waiting for
 * a large set of individual model requests.
 */
export function makeWestPublicParkVisual(layout: RoomLayout, dimensions: { width: number; depth: number }): THREE.Group | null {
  const hasWestBlock = dimensions.width <= 410 && dimensions.depth <= 314
    && layout.roadways?.some((road) => road.id === "road-loop-side--1")
    && layout.roadways?.some((road) => road.id === "road-major-civic--84")
    && layout.roadways?.some((road) => road.id === "road-major-team--1")
    && layout.roadways?.some((road) => road.id === "road-major-team-1");
  if (!hasWestBlock) return null;

  const park = new THREE.Group();
  park.name = "West public park visual";
  const x = (value: number) => dimensions.width / 2 - value;
  const z = (value: number) => dimensions.depth / 2 + value;
  const grass = new THREE.MeshStandardMaterial({ color: 0x64a85d, roughness: 0.96 });
  const path = new THREE.MeshStandardMaterial({ color: 0xe7d9bd, roughness: 0.92 });
  const water = new THREE.MeshPhysicalMaterial({ color: 0x249cc4, roughness: 0.16, clearcoat: 0.82, clearcoatRoughness: 0.14 });
  const shore = new THREE.MeshStandardMaterial({ color: 0xb9c9a0, roughness: 0.9 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x9b6b43, roughness: 0.78 });
  const trunk = new THREE.MeshStandardMaterial({ color: 0x704225, roughness: 0.92 });
  const foliage = [0x2f7c4d, 0x438e58, 0x689e4e, 0x276d45].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  const stone = new THREE.MeshStandardMaterial({ color: 0x7e8a7d, roughness: 0.96 });
  const addBox = (width: number, height: number, depth: number, material: THREE.Material, px: number, py: number, pz: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x(px), py, z(pz));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    park.add(mesh);
  };

  // Paths form a clear loop around the water garden rather than a blank lawn.
  addBox(78, 0.04, 2.4, path, 132, 0.042, -28);
  addBox(78, 0.04, 2.4, path, 132, 0.042, 28);
  addBox(2.4, 0.04, 58, path, 170, 0.042, 0);
  addBox(2.4, 0.04, 58, path, 94, 0.042, 0);
  addBox(22, 0.04, 2.2, path, 160, 0.042, 0);

  // Split pond leaves a timber crossing in the centre, matching saved water collision.
  for (const pondX of [145, 155]) {
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(5.15, 5.15, 0.07, 40), water);
    pond.scale.z = 0.78;
    pond.position.set(x(pondX), 0.06, z(0));
    pond.receiveShadow = true;
    park.add(pond);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(5.22, 0.19, 8, 40), shore);
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = 0.78;
    rim.position.set(x(pondX), 0.065, z(0));
    park.add(rim);
  }
  addBox(2.25, 0.16, 10.2, wood, 150, 0.14, 0);
  for (const railX of [149.1, 150.9]) addBox(0.11, 0.34, 10.2, wood, railX, 0.29, 0);

  const treeAt = (px: number, pz: number, index: number) => {
    const tree = new THREE.Group();
    const height = 2.8 + (index % 3) * 0.45;
    const treeTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.23, height * 0.42, 8), trunk);
    treeTrunk.position.y = height * 0.21;
    tree.add(treeTrunk);
    const crown = new THREE.Mesh(index % 2
      ? new THREE.ConeGeometry(1.15 + (index % 3) * 0.12, height * 0.9, 9)
      : new THREE.DodecahedronGeometry(1.05 + (index % 3) * 0.12, 1), foliage[index % foliage.length]!);
    crown.position.y = height * 0.65;
    crown.scale.z = index % 2 ? 0.82 : 0.9;
    tree.add(crown);
    tree.position.set(x(px), 0.03, z(pz));
    tree.traverse((part) => { if (part instanceof THREE.Mesh) { part.castShadow = true; part.receiveShadow = true; } });
    park.add(tree);
  };
  const trees = [[164, -22], [164, -11], [164, 11], [164, 22], [140, -22], [140, 22], [129, -22], [129, -11], [129, 11], [129, 22], [116, -22], [116, 22], [104, -17], [104, 17]] as const;
  trees.forEach(([px, pz], index) => treeAt(px, pz, index));

  for (const [index, [px, pz]] of ([[164, -16], [164, 16], [140, -16], [140, 16], [122, -16], [122, 16]] as const).entries()) {
    addBox(1.7, 0.13, 0.48, wood, px, 0.5, pz);
    addBox(1.7, 0.56, 0.12, wood, px, 0.76, pz + (index % 2 ? -0.18 : 0.18));
    for (const offset of [-0.58, 0.58]) addBox(0.12, 0.55, 0.12, wood, px + offset, 0.28, pz);
  }
  for (const [index, [px, pz]] of ([[160, -7], [160, 7], [140, -7], [140, 7], [130, -6], [130, 6], [116, -6], [116, 6]] as const).entries()) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45 + (index % 3) * 0.12, 0), stone);
    rock.scale.set(1.3, 0.72, 0.92);
    rock.position.set(x(px), 0.34, z(pz));
    rock.rotation.y = index * 0.62;
    rock.castShadow = true;
    rock.receiveShadow = true;
    park.add(rock);
  }
  // A darker lawn island behind the pond makes the water garden legible from the overview camera.
  addBox(35, 0.018, 18, grass, 150, 0.028, 0);
  return park;
}

/** A compact football pitch and running track fill the formerly empty east civic block. */
export function makeEastFootballFieldVisual(layout: RoomLayout, dimensions: { width: number; depth: number }): THREE.Group | null {
  const isCompactCampus = dimensions.width <= 410 && dimensions.depth <= 314
    && layout.roadways?.some((road) => road.id === "road-loop-side-1")
    && layout.roadways?.some((road) => road.id === "road-major-civic-84");
  if (!isCompactCampus) return null;

  const field = new THREE.Group();
  field.name = "East football field and running track";
  const x = (value: number) => dimensions.width / 2 + value;
  const z = (value: number) => dimensions.depth / 2 + value;
  const addBox = (width: number, height: number, depth: number, color: number, px: number, py: number, pz: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color, roughness: 0.88 }));
    mesh.position.set(x(px), py, z(pz));
    mesh.receiveShadow = true;
    field.add(mesh);
  };
  const turf = 0x3f9a54;
  const track = 0xb95f4d;
  const line = 0xf7f5e9;
  const trunk = new THREE.MeshStandardMaterial({ color: 0x6d4429, roughness: 0.92 });
  const foliage = [0x1f6d43, 0x367f47, 0x5a984f, 0x2d8056].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  const flower = [0xf4c95d, 0xe97379, 0xa785d6].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.82 }));
  const wood = new THREE.MeshStandardMaterial({ color: 0x9c7047, roughness: 0.84 });
  // Four track bars create a rounded-stadium silhouette from the overview camera.
  addBox(72, 0.035, 5, track, 140, 0.045, -28);
  addBox(72, 0.035, 5, track, 140, 0.045, 28);
  addBox(5, 0.035, 51, track, 106.5, 0.045, 0);
  addBox(5, 0.035, 51, track, 173.5, 0.045, 0);
  addBox(60, 0.045, 38, turf, 140, 0.058, 0);
  // Pitch boundary, halfway line and penalty areas.
  addBox(60, 0.025, 0.36, line, 140, 0.095, -19);
  addBox(60, 0.025, 0.36, line, 140, 0.095, 19);
  addBox(0.36, 0.025, 38, line, 110, 0.095, 0);
  addBox(0.36, 0.025, 38, line, 170, 0.095, 0);
  addBox(0.28, 0.025, 38, line, 140, 0.095, 0);
  for (const side of [-1, 1]) {
    const goalX = 140 + side * 30;
    const boxX = 140 + side * 24;
    addBox(0.3, 0.025, 16, line, boxX, 0.095, 0);
    addBox(6, 0.025, 0.3, line, 140 + side * 27, 0.095, -8);
    addBox(6, 0.025, 0.3, line, 140 + side * 27, 0.095, 8);
    const goalMaterial = new THREE.MeshStandardMaterial({ color: 0xfaf7eb, roughness: 0.7 });
    const goal = new THREE.Group();
    for (const [gx, gy, gz, width, height, depth] of [[goalX, 0.9, -2.2, 0.15, 1.8, 0.15], [goalX, 0.9, 2.2, 0.15, 1.8, 0.15], [goalX, 1.8, 0, 0.15, 0.15, 4.55]] as const) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), goalMaterial);
      post.position.set(x(gx), gy, z(gz));
      goal.add(post);
    }
    field.add(goal);
  }
  const centreCircle = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.18, 6, 28), new THREE.MeshStandardMaterial({ color: line, roughness: 0.76 }));
  centreCircle.rotation.x = Math.PI / 2;
  centreCircle.position.set(x(140), 0.1, z(0));
  field.add(centreCircle);
  // Lane dividers keep the outer loop recognisable as a running track.
  for (const laneZ of [-26.2, -24.4, 24.4, 26.2]) addBox(58, 0.012, 0.12, 0xf5d8cb, 140, 0.075, laneZ);

  // A varied tree belt makes the track feel like a city park while retaining
  // the clear sight-lines across the pitch.
  const treeAt = (px: number, pz: number, index: number, scale = 1) => {
    const tree = new THREE.Group();
    const height = (2.75 + (index % 3) * 0.36) * scale;
    const treeTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.22 * scale, height * 0.45, 8), trunk);
    treeTrunk.position.y = height * 0.225;
    tree.add(treeTrunk);
    const crown = new THREE.Mesh(index % 3 === 1
      ? new THREE.ConeGeometry(1.05 * scale, height * 0.9, 9)
      : new THREE.DodecahedronGeometry(1.05 * scale + (index % 2) * 0.13, 1), foliage[index % foliage.length]!);
    crown.position.y = height * 0.67;
    crown.scale.z = index % 3 === 1 ? 0.82 : 0.9;
    tree.add(crown);
    tree.position.set(x(px), 0.03, z(pz));
    tree.traverse((part) => { if (part instanceof THREE.Mesh) { part.castShadow = true; part.receiveShadow = true; } });
    field.add(tree);
  };
  const treeBelt = [
    [108, -32], [122, -32], [138, -32], [154, -32], [168, -32],
    [108, 32], [122, 32], [138, 32], [154, 32], [168, 32],
    [98, -18], [98, 0], [98, 18], [182, -18], [182, 0], [182, 18],
  ] as const;
  treeBelt.forEach(([px, pz], index) => treeAt(px, pz, index, index % 5 === 0 ? 1.14 : 1));
  for (const [index, [px, pz]] of ([[115, -33], [130, -33], [150, -33], [165, -33], [115, 33], [130, 33], [150, 33], [165, 33]] as const).entries()) {
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.18, 0.12, 14), new THREE.MeshStandardMaterial({ color: 0x5f914b, roughness: 0.96 }));
    bed.position.set(x(px), 0.08, z(pz));
    field.add(bed);
    for (let petal = 0; petal < 4; petal++) {
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), flower[(index + petal) % flower.length]!);
      const angle = petal * Math.PI / 2;
      bloom.position.set(x(px + Math.cos(angle) * 0.44), 0.22, z(pz + Math.sin(angle) * 0.44));
      field.add(bloom);
    }
  }
  // Spectator benches on the long sides turn the pitch into an active campus amenity.
  for (const [index, px] of [120, 140, 160].entries()) for (const pz of [-30.5, 30.5]) {
    addBox(2.8, 0.13, 0.52, wood.color.getHex(), px, 0.43, pz);
    addBox(2.8, 0.55, 0.13, wood.color.getHex(), px, 0.7, pz + (pz < 0 ? -0.18 : 0.18));
    for (const offset of [-0.95, 0.95]) addBox(0.14, 0.46, 0.14, wood.color.getHex(), px + offset, 0.24, pz);
    // Low bollard lights beside each seating bay.
    const light = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.72, 8), new THREE.MeshStandardMaterial({ color: 0x425f65, roughness: 0.7 }));
    light.position.set(x(px + (index % 2 ? 3 : -3)), 0.36, z(pz));
    field.add(light);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffecb5, emissive: 0xd9a83c, emissiveIntensity: 0.35 }));
    lamp.position.set(x(px + (index % 2 ? 3 : -3)), 0.75, z(pz));
    field.add(lamp);
  }
  return field;
}
