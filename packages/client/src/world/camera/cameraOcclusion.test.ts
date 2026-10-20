import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { CameraOcclusion } from "./cameraOcclusion";
import type { CameraPose } from "./cameraPose";
import { cacheLocalMatrix, cacheStaticModelLocalMatrices } from "../staticModelTransforms";
import { StaticSceneGroup } from "../staticSceneGroup";

const STEP_SEC = 1 / 60;
const RAY_LENGTH_M = 8;
const WALL_CENTER_Z_M = 4;
const WALL_THICKNESS_M = 0.2;
const WALL_LENGTH_M = 10;
const WALL_HEIGHT_M = 3;
const TARGET_HEIGHT_M = 1;
const DOOR_WIDTH_M = 2;
const DOOR_SIDE_RAY_X_M = 3;
const TEST_FOV_DEG = 38;
const FADE_STEPS_COUNT = 120;
const BASE_OPACITY_RATIO = 0.6;
const CLEAR_POSITION_X_M = 20;
const HALF_TURN_RAD = Math.PI / 2;
const HALF_STEP_SEC = STEP_SEC / 2;
const OPACITY_TOLERANCE_RATIO = 1e-9;

function rayPose(x = 0, targetZ = 0): CameraPose {
  return { lookAt: new Vector3(x, TARGET_HEIGHT_M, targetZ), position: new Vector3(x, TARGET_HEIGHT_M, targetZ + RAY_LENGTH_M), fov: TEST_FOV_DEG };
}

function fixture(t: TestContext) {
  const occlusion = new CameraOcclusion();
  const walls: Mesh<BoxGeometry, MeshBasicMaterial>[] = [];
  const originalMaterial = new MeshBasicMaterial();
  const makeWall = (widthM = WALL_LENGTH_M, xM = 0, zM = WALL_CENTER_Z_M) => {
    const wall = new Mesh(new BoxGeometry(widthM, WALL_HEIGHT_M, WALL_THICKNESS_M), originalMaterial);
    wall.position.set(xM, WALL_HEIGHT_M / 2, zM);
    wall.castShadow = true;
    walls.push(wall);
    return wall;
  };
  t.after(() => {
    occlusion.dispose();
    walls.forEach((wall) => wall.geometry.dispose());
    originalMaterial.dispose();
  });
  return { occlusion, makeWall, originalMaterial };
}

function doorway(t: TestContext) {
  const setup = fixture(t);
  const segmentLengthM = (WALL_LENGTH_M - DOOR_WIDTH_M) / 2;
  const centerXM = (DOOR_WIDTH_M + segmentLengthM) / 2;
  const walls = [-centerXM, centerXM].map((xM) => setup.makeWall(segmentLengthM, xM));
  walls.forEach((wall) => setup.occlusion.register(wall));
  return { ...setup, walls };
}

test("walking across a doorway keeps the chosen camera distance and lens", (t) => {
  const { occlusion, walls } = doorway(t);
  for (const x of [0, DOOR_WIDTH_M / 2 + WALL_THICKNESS_M, DOOR_SIDE_RAY_X_M, 0]) {
    const pose = rayPose(x);
    const visible = occlusion.apply(pose, "tpp", STEP_SEC, false);
    assert.equal(visible.position.distanceTo(visible.lookAt), RAY_LENGTH_M);
    assert.equal(visible.fov, TEST_FOV_DEG);
  }
  assert.ok(walls[1]!.material.opacity < 1);
});

test("only wall segments blocking the sightline fade; a doorway stays clear", (t) => {
  const { occlusion, walls } = doorway(t);
  occlusion.apply(rayPose(), "tpp", STEP_SEC, true);
  walls.forEach((wall) => assert.equal(wall.material.opacity, 1));
  occlusion.apply(rayPose(DOOR_SIDE_RAY_X_M), "tpp", STEP_SEC, true);
  assert.equal(walls[0]!.material.opacity, 1);
  assert.ok(walls[1]!.material.opacity > 0 && walls[1]!.material.opacity < 1);
  assert.equal(walls[1]!.material.transparent, true);
  assert.equal(walls[1]!.material.depthWrite, false);
  assert.equal(walls[1]!.castShadow, false);
});

test("walking through and away from a wall keeps framing while fading every intervening wall", (t) => {
  const { occlusion, makeWall } = fixture(t);
  const walls = [WALL_CENTER_Z_M, WALL_CENTER_Z_M * 2].map((zM) => makeWall(WALL_LENGTH_M, 0, zM));
  walls.forEach((wall) => occlusion.register(wall));
  for (const targetZ of [0, WALL_CENTER_Z_M - WALL_THICKNESS_M, WALL_CENTER_Z_M, WALL_CENTER_Z_M + WALL_THICKNESS_M]) {
    const pose = rayPose(0, targetZ);
    assert.equal(occlusion.apply(pose, "tpp", STEP_SEC, true), pose);
    assert.ok(walls[1]!.material.opacity < 1);
  }
});

test("fades restore monotonically and preserve shared materials and original render flags", (t) => {
  const { occlusion, makeWall, originalMaterial } = fixture(t);
  originalMaterial.opacity = BASE_OPACITY_RATIO;
  originalMaterial.transparent = true;
  originalMaterial.depthWrite = false;
  const wall = makeWall();
  const sibling = makeWall(WALL_LENGTH_M, CLEAR_POSITION_X_M);
  occlusion.register(wall);
  occlusion.apply(rayPose(), "tpp", STEP_SEC, true);
  assert.equal(sibling.material.opacity, BASE_OPACITY_RATIO);
  let previous = wall.material.opacity;
  for (let step = 0; step < FADE_STEPS_COUNT; step += 1) {
    occlusion.apply(rayPose(CLEAR_POSITION_X_M), "tpp", STEP_SEC, false);
    assert.ok(wall.material.opacity >= previous && wall.material.opacity <= BASE_OPACITY_RATIO);
    previous = wall.material.opacity;
  }
  assert.equal(wall.material.opacity, BASE_OPACITY_RATIO);
  assert.equal(wall.material.transparent, true);
  assert.equal(wall.material.depthWrite, false);
  assert.equal(wall.castShadow, true);
  occlusion.dispose();
  assert.equal(wall.material, originalMaterial);
});

test("FPP, free/edit and 2D views immediately restore opaque walls", (t) => {
  const { occlusion, makeWall } = fixture(t);
  const wall = makeWall();
  occlusion.register(wall);
  for (const mode of ["fpp", "free", "map2d"] as const) {
    occlusion.apply(rayPose(), "tpp", STEP_SEC, true);
    occlusion.apply(rayPose(), mode, STEP_SEC, false);
    assert.equal(wall.material.opacity, 1);
    assert.equal(wall.material.transparent, false);
    assert.equal(wall.material.depthWrite, true);
    assert.equal(wall.castShadow, true);
  }
});

test("moving and swinging door roots refresh their world bounds", (t) => {
  const { occlusion, makeWall } = fixture(t);
  const hinge = new Group();
  const wall = makeWall();
  hinge.add(wall);
  occlusion.register(hinge);
  occlusion.apply(rayPose(), "tpp", STEP_SEC, true);
  assert.ok(wall.material.opacity < 1);
  hinge.rotation.y = HALF_TURN_RAD;
  occlusion.apply(rayPose(), "tpp", STEP_SEC, true);
  assert.equal(wall.material.opacity, 1);
  hinge.rotation.y = 0;
  occlusion.apply(rayPose(), "tpp", STEP_SEC, true);
  assert.ok(wall.material.opacity < 1);
  hinge.position.x = CLEAR_POSITION_X_M;
  occlusion.apply(rayPose(), "tpp", STEP_SEC, true);
  assert.equal(wall.material.opacity, 1);
});

test("hidden ancestors and geometry behind the camera do not fade", (t) => {
  const { occlusion, makeWall } = fixture(t);
  const parent = new Group();
  const wall = makeWall();
  parent.add(wall);
  parent.visible = false;
  occlusion.register(wall);
  occlusion.apply(rayPose(), "tpp", STEP_SEC, true);
  assert.equal(wall.material.opacity, 1);
  parent.visible = true;
  parent.position.z = RAY_LENGTH_M;
  occlusion.apply(rayPose(), "tpp", STEP_SEC, true);
  assert.equal(wall.material.opacity, 1);
});

test("fade speed is independent of frame rate", (t) => {
  const first = fixture(t);
  const second = fixture(t);
  const whole = first.makeWall();
  const half = second.makeWall();
  first.occlusion.register(whole);
  second.occlusion.register(half);
  first.occlusion.apply(rayPose(), "tpp", STEP_SEC, false);
  second.occlusion.apply(rayPose(), "tpp", HALF_STEP_SEC, false);
  second.occlusion.apply(rayPose(), "tpp", HALF_STEP_SEC, false);
  assert.ok(Math.abs(whole.material.opacity - half.material.opacity) < OPACITY_TOLERANCE_RATIO);
});

test("settled fades avoid redundant render-property writes but reflect source material changes", (t) => {
  const { occlusion, makeWall, originalMaterial } = fixture(t);
  const wall = makeWall();
  occlusion.register(wall);
  const faded = wall.material;
  let writes = 0;
  for (const key of ["opacity", "transparent", "depthWrite"] as const) {
    let value = faded[key];
    Object.defineProperty(faded, key, {
      configurable: true,
      get: () => value,
      set: next => { writes++; value = next; },
    });
  }
  for (const blocked of [false, true, false]) {
    const pose = rayPose(blocked ? 0 : CLEAR_POSITION_X_M);
    occlusion.apply(pose, "tpp", STEP_SEC, true);
    writes = 0;
    const version = faded.version;
    for (let frame = 0; frame < 10; frame++) occlusion.apply(pose, "tpp", STEP_SEC, false);
    assert.equal(writes, 0);
    assert.equal(faded.version, version);
  }
  originalMaterial.opacity = BASE_OPACITY_RATIO;
  originalMaterial.transparent = true;
  originalMaterial.depthWrite = false;
  occlusion.apply(rayPose(CLEAR_POSITION_X_M), "tpp", STEP_SEC, false);
  assert.equal(faded.opacity, BASE_OPACITY_RATIO);
  assert.equal(faded.transparent, true);
  assert.equal(faded.depthWrite, false);
  assert.equal(writes, 3);
});

test("one frame computes fade blending once for multiple occluders", (t) => {
  const { occlusion, makeWall } = fixture(t);
  for (let index = 0; index < 12; index++) occlusion.register(makeWall());
  const original = Math.expm1;
  let evaluations = 0;
  Math.expm1 = value => { evaluations++; return original(value); };
  try {
    occlusion.apply(rayPose(), "tpp", STEP_SEC, false);
    assert.equal(evaluations, 1);
    occlusion.apply(rayPose(), "fpp", STEP_SEC, false);
    assert.equal(evaluations, 1);
  } finally {
    Math.expm1 = original;
  }
});

test("cached static prop bounds and render matrices both follow an editor pivot move", (t) => {
  const { occlusion, makeWall } = fixture(t);
  const parent = new Group();
  const pivot = new StaticSceneGroup();
  const wall = makeWall();
  pivot.add(wall);
  parent.add(pivot);
  cacheLocalMatrix(parent);
  cacheStaticModelLocalMatrices(pivot);
  occlusion.register(pivot);
  parent.updateMatrixWorld();
  occlusion.apply(rayPose(), "tpp", STEP_SEC, true);
  assert.ok(wall.material.opacity < 1);
  pivot.position.x = CLEAR_POSITION_X_M;
  pivot.updateMatrix();
  // Occlusion updates the pivot's world matrix before the renderer visits it.
  occlusion.apply(rayPose(), "tpp", STEP_SEC, true);
  parent.updateMatrixWorld();
  assert.equal(wall.material.opacity, 1);
  assert.equal(wall.matrixWorld.elements[12], CLEAR_POSITION_X_M);
  pivot.position.x = 0;
  pivot.updateMatrix();
  occlusion.apply(rayPose(), "tpp", STEP_SEC, true);
  parent.updateMatrixWorld();
  assert.ok(wall.material.opacity < 1);
  assert.equal(wall.matrixWorld.elements[12], 0);
});
