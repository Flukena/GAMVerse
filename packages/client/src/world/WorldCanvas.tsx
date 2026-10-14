import { CAMPUS_LAYOUT, CAMPUS_WORLD, CAMERA, lerpAngle, DEFAULT_CHARACTER_ID, JUMP_DURATION_MS, jumpHeightAt, KENNEY_BLASTER_IDS, KENNEY_VEHICLE_IDS, WORLD, ROOM_PROP_CATALOG, TEMPLATE_PRIVATE_WALL_ASSETS, templatePrivateWallAsset, parseRoomPropSeatReference, roomPropCollisionClearanceRadius, roomPropCollisionFootprint, roomWallSolidSegments, roomBoundaryWalls, roomPropPlacementSupport, roomPropSeatAnchors, campusPropPlacements, type CampusRoom, type KenneyBlasterId, type KenneyCharacterId, type KenneyVehicleId, type RoomLayout, type RoomLayoutProp, type RoomLayoutZone } from "@gammyverse/shared";
import type { MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { loadCharacterAsset, type LoadedCharacterAsset } from "../assets/characterAssets";
import { loadGltfAsset, loadRoomPropAsset } from "../assets/loaders";
import { roomPropAssetPaths } from "../assets/roomPropPaths";
import { createOfficePropGeometry } from "./officePropGeometry";
import { fitWallAssetModel } from "./wallAssetTransform";
import { cameraReducer, createCameraState, isBehindCharacterLocked, type CameraEvent } from "./camera/cameraState";
import { computeCameraFrame, applyCameraProjection, campusOverviewDistance } from "./camera/cameraFrame";
import { rotateFirstPersonAim, panCameraTarget, cameraWheelEvent, panEditorCamera, hasCameraMovement } from "./camera/cameraInput";
import { CameraOcclusion } from "./camera/cameraOcclusion";
import { smoothCameraPose, type CameraPose } from "./camera/cameraPose";
import { CAMERA_MOVEMENT_KEY_CODES, CAMERA_FAR_MIN_M, CAMERA_NEAR_MAX_M, CAMPUS_2D_ZOOM_THRESHOLD_RATIO, CAMPUS_BOUNDARY_WALL_HEIGHT_M, CAMERA_ZOOM_BUTTON_RATIO, FOLLOW_FACING_RESPONSE_PER_SECOND, FPP_INITIAL_PITCH_DEG, FPP_POINTER_SENSITIVITY_RAD_PER_PIXEL, TPP_FOV_DEG } from "./camera/constants";

type CharacterModelId = KenneyCharacterId | `custom-${string}`;
type PlayerStatus = "available" | "do-not-disturb" | "in-meeting" | "toilet" | "lunch" | "coffee-break";
type PlayerSnapshot = { x: number; z: number; rotation: number; username: string; displayName: string; characterId: CharacterModelId; petId?: string; weaponId?: KenneyBlasterId | ""; vehicleId?: string; vehicleMode?: "" | "manual" | "auto"; vehiclePropId?: string; vehiclePropX?: number; vehiclePropZ?: number; vehiclePropRotation?: number; sittingPropId?: string; dancing?: boolean; status?: PlayerStatus };
type RoomPortalVisual = { roomKey: string; name: string; x: number; z: number; isLocked: boolean };
type BlasterVector = { x: number; y: number; z: number };
type BlasterShotEvent = { shooterSessionId: string; start: BlasterVector; end: BlasterVector };

const ROOM_LABEL_RADIUS_BLOCKS = 50;
const ROAD_SURFACE_COLOR = "#45484a";
const ROAD_JOIN_OVERLAP_M = 0.08;

interface Props {
  activeRoomKey: string;
  cameraRoomKey?: string;
  playersRef: MutableRefObject<Map<string, PlayerSnapshot>>;
  localSessionIdRef: MutableRefObject<string | null>;
  speakingUsernamesRef?: MutableRefObject<Set<string>>;
  heldKeysRef?: MutableRefObject<Set<string>>;
  cameraYawRef: MutableRefObject<number>;
  cameraBehindCharacterRef: MutableRefObject<boolean>;
  firstPersonViewRef: MutableRefObject<boolean>;
  roomPortals?: RoomPortalVisual[];
  roomLayout: RoomLayout | null;
  personalDeskZone?: RoomLayoutZone | null;
  currentPrivateZoneId?: string | null;
  inboundAudioMuted?: boolean;
  appPaused?: boolean;
  idleAnimationsEnabled?: boolean;
  ghostSessionIds?: ReadonlySet<string>;
  mapEditMode?: boolean;
  spawnPlacementMode?: boolean;
  onMoveSpawnPoint?: (position: { x: number; z: number }) => void;
  buildMode?: boolean;
  buildTool?: "select" | "place" | "zone";
  selectedAsset?: RoomLayoutProp["asset"] | null;
  onPlaceProp?: (asset: RoomLayoutProp["asset"], position: { x: number; z: number; elevation?: number }) => void;
  onPlacementComplete?: () => void;
  onMoveProp?: (id: string, position: { x: number; z: number; elevation?: number }) => void;
  onRotateProp?: (id: string) => void;
  onDeleteProp?: (id: string) => void;
  onSelectMapItem?: (id: string | null) => void;
  selectedMapItemId?: string | null;
  onDrawPrivateZone?: (first: { x: number; z: number }, second: { x: number; z: number }) => void;
  zoneDrawing?: boolean;
  onZoneAreaDrawn?: (area: { x: number; z: number; width: number; depth: number }) => void;
  onSelectDeskZone?: (zoneId: string | null) => void;
  onSelectMapZone?: (zoneId: string | null) => void;
  selectedMapZoneId?: string | null;
  lockedZoneIds?: string[];
  onClaimDeskZone?: (zoneId: string) => void;
  canClaimDesk?: boolean;
  deskClaimingZoneId?: string | null;
  onAutoMove?: (destination: { x: number; z: number }, randomVehicle: boolean) => void;
  onSelectPlayer?: (sessionId: string, screenX: number, screenY: number) => void;
  onGhostModeChange?: (enabled: boolean) => void;
  onBlasterShot?: (shot: { start: BlasterVector; end: BlasterVector; targetSessionId?: string }) => void;
  onWeaponEquip?: (weaponId: KenneyBlasterId | "") => void;
  blasterEventsRef?: MutableRefObject<BlasterShotEvent[]>;
  jumpStartedAtRef?: MutableRefObject<Map<string, number>>;
  onJump?: () => void;
  onVehicleInteract?: (vehicleId: KenneyVehicleId | "", propId?: string) => void;
  canEditMap?: boolean;
  mapEditorUsername?: string | null;
  mapEditLockPending?: boolean;
  onEditMap?: () => void;
  onModifyProps?: () => void;
}

const ghostMaterialOverrides = new WeakMap<THREE.Mesh, { original: THREE.Material | THREE.Material[]; faded: THREE.Material[] }>();
const ghostModelOpacity = new WeakMap<THREE.Object3D, boolean>();

function setGhostModelOpacity(model: THREE.Object3D, enabled: boolean) {
  if (ghostModelOpacity.get(model) === enabled) return;
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    let override = ghostMaterialOverrides.get(object);
    if (enabled) {
      if (!override) {
        const original = object.material;
        const originals = Array.isArray(original) ? original : [original];
        const faded = originals.map((material) => material.clone());
        override = { original, faded };
        ghostMaterialOverrides.set(object, override);
        object.material = Array.isArray(original) ? faded : faded[0]!;
      }
      for (const material of override.faded) {
        material.transparent = true;
        material.opacity = 0.4;
        material.depthWrite = false;
      }
    } else if (override) {
      object.material = override.original;
      for (const material of override.faded) material.dispose();
      ghostMaterialOverrides.delete(object);
    }
  });
  ghostModelOpacity.set(model, enabled);
}

type CampusFloorId = 0;
// Keep imported props at the same normalized scale as the playable office scene.
const CAMPUS_FURNITURE_SCALE = 1;

function makeCampusRoom(room: CampusRoom, floor: CampusFloorId) {
  const palette: Record<CampusRoom["kind"], number> = {
    "private-office": 0xdde8dc,
    "daily-meeting": 0xc9dfd1,
    townhall: 0xd8d8ed,
    cafeteria: 0xf0dfc9,
    restroom: 0xc9e4e7,
    gym: 0xd5e6d4,
    lobby: 0xe7ebdf,
    corridor: 0xd8dfd9,
  };
  const group = new THREE.Group();
  group.position.set(room.x, 0, room.z);
  // A continuous campus slab is built by makeCampusFloor below. These subtle
  // room inlays make each private suite readable without turning it into a
  // floating box with four closed walls.
  const floorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.4, room.width - 0.24), 0.035, Math.max(0.4, room.depth - 0.24)),
    new THREE.MeshStandardMaterial({ color: palette[room.kind], roughness: 0.9 }),
  );
  floorMesh.position.y = 0.008;
  floorMesh.receiveShadow = true;
  group.add(floorMesh);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xe7e9e3, roughness: 0.9 });
  const wallHeight = room.kind === "townhall" ? 2.2 : room.kind === "private-office" ? 1.55 : 1.7;
  const wallThickness = 0.18;
  const makeWall = (w: number, d: number, x: number, z: number) => ({ w, d, x, z });
  const halfW = room.width / 2;
  const halfD = room.depth / 2;
  const doorWidth = Math.min(1.6, room.width * 0.3);
  const frontSegment = Math.max(0, (room.width - doorWidth) / 2);
  // Every room connects to the shared hall through a visible doorway.
  const walls = [
    makeWall(room.width, wallThickness, 0, -halfD),
    makeWall(wallThickness, room.depth, -halfW, 0),
    makeWall(wallThickness, room.depth, halfW, 0),
    ...(frontSegment > 0.15
      ? [
          makeWall(frontSegment, wallThickness, -(doorWidth + frontSegment) / 2, halfD),
          makeWall(frontSegment, wallThickness, (doorWidth + frontSegment) / 2, halfD),
        ]
      : []),
  ];
  for (const wall of walls) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.w, wallHeight, wall.d), wallMaterial);
    mesh.position.set(wall.x, wallHeight / 2, wall.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const markerGeometry = new THREE.BoxGeometry(0.36, 0.08, 0.36);
  const markerMaterial = new THREE.MeshStandardMaterial({ color: room.kind === "private-office" ? 0x638b72 : 0x527963, roughness: 0.7 });
  const furnitureFallback = new THREE.Group();
  furnitureFallback.name = "campus-furniture-fallback";
  if (room.kind === "private-office") {
    // A small desk/chair footprint stands in for the detailed OBJ assets in the overview.
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.55), markerMaterial);
    desk.position.set(0, 0.46, -0.55);
    desk.castShadow = true;
    furnitureFallback.add(desk);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), new THREE.MeshStandardMaterial({ color: 0x9d795e, roughness: 0.8 }));
    seat.position.set(0, 0.28, 0.35);
    furnitureFallback.add(seat);
  } else if (room.kind === "daily-meeting") {
    const table = new THREE.Mesh(new THREE.BoxGeometry(Math.min(room.width * 0.62, 6), 0.16, 1.8), markerMaterial);
    table.position.y = 0.52;
    table.castShadow = true;
    furnitureFallback.add(table);
    for (let i = 0; i < 7; i += 1) {
      const chair = new THREE.Mesh(markerGeometry, new THREE.MeshStandardMaterial({ color: 0x9d795e }));
      chair.position.set(-3.2 + i * 1.07, 0.22, -1.45);
      furnitureFallback.add(chair);
    }
    for (let i = 0; i < 6; i += 1) {
        const chair = new THREE.Mesh(markerGeometry, new THREE.MeshStandardMaterial({ color: 0x9d795e }));
        chair.position.set(-2.675 + i * 1.07, 0.22, 1.45);
        furnitureFallback.add(chair);
    }
    for (const side of [-1, 1]) {
      const chair = new THREE.Mesh(markerGeometry, new THREE.MeshStandardMaterial({ color: 0x9d795e }));
      chair.position.set(side * 3.4, 0.22, 0);
      furnitureFallback.add(chair);
    }
  } else if (room.kind === "townhall") {
    const stage = new THREE.Mesh(new THREE.BoxGeometry(room.width * 0.58, 0.42, 2.4), new THREE.MeshStandardMaterial({ color: 0x5c7968, roughness: 0.82 }));
    stage.position.set(0, 0.25, -room.depth * 0.32);
    stage.castShadow = true;
    furnitureFallback.add(stage);
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 15; col += 1) {
        const seat = new THREE.Mesh(markerGeometry, new THREE.MeshStandardMaterial({ color: 0x877e9a }));
        seat.scale.set(0.7, 1, 0.7);
        seat.position.set(-7.7 + col * 1.1, 0.14, -3 + row * 1.12);
        furnitureFallback.add(seat);
      }
    }
  } else if (room.kind === "cafeteria") {
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const table = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, 0.8), markerMaterial);
        table.position.set(-6 + col * 2.9, 0.5, -4.2 + row * 2.7);
        furnitureFallback.add(table);
        for (const side of [-1, 1]) {
          const chair = new THREE.Mesh(markerGeometry, new THREE.MeshStandardMaterial({ color: 0x9d795e }));
          chair.position.set(-6 + col * 2.9 + side * 0.9, 0.2, -4.2 + row * 2.7);
          furnitureFallback.add(chair);
        }
      }
    }
  } else if (room.kind === "restroom") {
    for (let stall = 0; stall < 4; stall += 1) {
      const cubicle = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.4, 1.55), new THREE.MeshStandardMaterial({ color: 0xf6f8f5, roughness: 0.9 }));
      cubicle.position.set(-2.4 + stall * 1.6, 0.7, 0.1);
      furnitureFallback.add(cubicle);
      const toilet = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }));
      toilet.position.set(-2.4 + stall * 1.6, 0.16, 0.25);
      furnitureFallback.add(toilet);
    }
  } else if (room.kind === "gym") {
    for (let i = 0; i < 3; i += 1) {
      const mat = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.09, 1.2), new THREE.MeshStandardMaterial({ color: 0x6c9d84, roughness: 0.95 }));
      mat.position.set(-4.2 + i * 4.2, 0.08, 2.3);
      furnitureFallback.add(mat);
    }
    for (let i = 0; i < 3; i += 1) {
      const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.25, 12), new THREE.MeshStandardMaterial({ color: 0x52615a, metalness: 0.2, roughness: 0.6 }));
      weight.rotation.z = Math.PI / 2;
      weight.position.set(-3.8 + i * 3.8, 0.7, -2.2);
      furnitureFallback.add(weight);
    }
  }

  group.add(furnitureFallback);
  const label = makeNameTag(room.name);
  label.userData.campusRoomNameLabel = true;
  label.position.set(0, wallHeight + 0.35, 0);
  label.scale.set(Math.min(Math.max(room.width * 0.25, 1.5), 4.8), 0.36, 1);
  group.add(label);
  group.userData.floor = floor;
  return group;
}

function makeCampusFloor(floor: { id: number; name: string; width: number; depth: number }) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(floor.width, 0.22, floor.depth),
    new THREE.MeshStandardMaterial({ color: 0xe9e8df, roughness: 0.92 }),
  );
  base.position.set(floor.width / 2, -0.12, floor.depth / 2);
  base.receiveShadow = true;
  group.add(base);

  const edge = new THREE.MeshStandardMaterial({ color: 0xd7d8d0, roughness: 0.86 });
  const boundaryWalls: THREE.Mesh[] = [];
  for (const footprint of roomBoundaryWalls(floor.width, floor.depth)) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(footprint.width, CAMPUS_BOUNDARY_WALL_HEIGHT_M, footprint.depth), edge);
    wall.position.set(footprint.x + floor.width / 2, CAMPUS_BOUNDARY_WALL_HEIGHT_M / 2, footprint.z + floor.depth / 2);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
    boundaryWalls.push(wall);
  }
  return { group, boundaryWalls };
}

interface AvatarAnimationState {
  model: THREE.Group;
  proceduralMotion: boolean;
  rotationOffset: number;
  phase: number;
  mixer?: THREE.AnimationMixer;
  idleAction?: THREE.AnimationAction;
  walkAction?: THREE.AnimationAction;
  runAction?: THREE.AnimationAction;
  sitAction?: THREE.AnimationAction;
  danceAction?: THREE.AnimationAction;
  currentAction?: THREE.AnimationAction;
  danceBasePosition?: THREE.Vector3;
  danceBaseRotation?: THREE.Euler;
  proceduralDanceActive?: boolean;
}

function disposeAvatar(avatar: THREE.Group) {
  avatar.traverse((object) => {
    if (object instanceof THREE.Sprite) {
      object.material.map?.dispose();
      object.material.dispose();
    } else if (object instanceof THREE.Mesh) {
      const ghostOverride = ghostMaterialOverrides.get(object);
      if (ghostOverride) {
        object.material = ghostOverride.original;
        ghostOverride.faded.forEach((material) => material.dispose());
        ghostMaterialOverrides.delete(object);
      }
      if (object.userData.sharedKenneyAvatarResources) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose();
        material.dispose();
      });
    }
  });
}

function disposeObjectResources(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      if (!object.userData.sharedRoomPropGeometry) object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (!object.userData.sharedRoomPropMaterials) materials.forEach((material) => {
        if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose();
        material.dispose();
      });
    }
  });
}

function makeNameTag(name: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "rgba(17, 24, 39, 0.86)";
  context.beginPath();
  context.roundRect(12, 18, 488, 92, 36);
  context.fill();
  context.fillStyle = "#f8fafc";
  context.font = "600 42px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(name, 256, 64, 440);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(1.8, 0.45, 1);
  sprite.position.y = 1.85;
  return sprite;
}

function makeSpeakingBubble() {
  const canvas = document.createElement("canvas");
  canvas.width = 144;
  canvas.height = 104;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "rgba(8, 48, 67, 0.16)";
  context.beginPath();
  context.roundRect(13, 8, 118, 68, 28);
  context.fill();
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#d9f3f6";
  context.lineWidth = 4;
  context.beginPath();
  context.roundRect(8, 3, 118, 68, 28);
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(81, 67);
  context.lineTo(95, 67);
  context.lineTo(84, 83);
  context.closePath();
  context.fill();
  context.fillStyle = "#12839a";
  context.font = "800 38px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("···", 67, 37);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
  sprite.scale.set(0.64, 0.46, 1);
  sprite.position.set(0, 2.8, 0);
  sprite.renderOrder = 12;
  sprite.visible = false;
  return sprite;
}

function makeZoneLockIcon() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#dc2626";
  context.beginPath();
  context.arc(32, 32, 30, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#fff";
  context.lineWidth = 6;
  context.lineCap = "round";
  context.beginPath();
  context.arc(32, 26, 10, Math.PI, 0);
  context.stroke();
  context.fillStyle = "#fff";
  context.beginPath();
  context.roundRect(19, 27, 26, 20, 5);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  icon.scale.set(0.62, 0.62, 1);
  icon.renderOrder = 10;
  return icon;
}

function makeUserStatusBadge(status: PlayerStatus) {
  const colors: Record<PlayerStatus, string> = {
    available: "#2f9e62",
    "do-not-disturb": "#dc3545",
    "in-meeting": "#7950c7",
    toilet: "#168aad",
    lunch: "#e08b22",
    "coffee-break": "#8a5a35",
  };
  const symbols: Record<PlayerStatus, string> = {
    available: "✓",
    "do-not-disturb": "−",
    "in-meeting": "▣",
    toilet: "WC",
    lunch: "♨",
    "coffee-break": "☕",
  };
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.fillStyle = colors[status];
  context.beginPath();
  context.arc(48, 48, 43, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#fff";
  context.lineWidth = 6;
  context.stroke();
  context.fillStyle = "#fff";
  context.font = `800 ${status === "toilet" ? 29 : status === "coffee-break" ? 43 : 52}px Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(symbols[status], 48, 50);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
  sprite.scale.set(0.43, 0.43, 1);
  sprite.position.set(0, 2.35, 0);
  sprite.renderOrder = 11;
  sprite.userData.playerStatus = status;
  return sprite;
}

function makeAvatar(color: number, name: string) {
  const group = new THREE.Group();
  const proceduralRig = new THREE.Group();
  group.add(proceduralRig);
  const bodyPivot = new THREE.Group();
  // Keep the feet on the shared floor plane; the body parts are authored around
  // a compact center and previously extended below y=0.
  bodyPivot.position.y = 0.58;
  proceduralRig.add(bodyPivot);

  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.82 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0c7a6, roughness: 0.86 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x493d3b, roughness: 0.72 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x59635d, roughness: 0.82 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xf2c66d, roughness: 0.68 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x332b2a, roughness: 0.55 });
  const addEllipsoid = (parent: THREE.Object3D, material: THREE.Material, position: [number, number, number], scale: [number, number, number]) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Short, rounded legs and shoes establish a compact chibi silhouette.
  const leftLeg = addEllipsoid(bodyPivot, pants, [-0.14, -0.36, -0.08], [0.115, 0.22, 0.14]);
  const rightLeg = addEllipsoid(bodyPivot, pants, [0.14, -0.36, -0.08], [0.115, 0.22, 0.14]);
  addEllipsoid(bodyPivot, dark, [-0.15, -0.5, -0.15], [0.14, 0.075, 0.19]);
  addEllipsoid(bodyPivot, dark, [0.15, -0.5, -0.15], [0.14, 0.075, 0.19]);

  const torso = addEllipsoid(bodyPivot, cloth, [0, 0.07, 0], [0.29, 0.34, 0.205]);
  // A small collar and centered badge give each palette a readable focal detail.
  addEllipsoid(bodyPivot, accent, [0, 0.32, -0.012], [0.13, 0.055, 0.17]);
  addEllipsoid(bodyPivot, accent, [0, 0.06, -0.205], [0.075, 0.075, 0.027]);
  // A short neck joins the separated torso and head without burying either mesh.
  addEllipsoid(bodyPivot, skin, [0, 0.3, -0.12], [0.12, 0.22, 0.12]);

  const leftArm = addEllipsoid(bodyPivot, cloth, [-0.34, 0.09, 0], [0.105, 0.27, 0.12]);
  const rightArm = addEllipsoid(bodyPivot, cloth, [0.34, 0.09, 0], [0.105, 0.27, 0.12]);
  leftArm.rotation.z = -0.16;
  rightArm.rotation.z = 0.16;
  addEllipsoid(bodyPivot, skin, [-0.36, -0.13, -0.015], [0.09, 0.09, 0.095]);
  addEllipsoid(bodyPivot, skin, [0.36, -0.13, -0.015], [0.09, 0.09, 0.095]);

  const head = new THREE.Group();
  head.position.set(0, 0.95, 0);
  proceduralRig.add(head);
  addEllipsoid(head, skin, [0, 0, 0], [0.36, 0.34, 0.31]);
  // Side-swept hair cap and fringe frame the face while leaving the eyes clear.
  addEllipsoid(head, dark, [0, 0.2, 0.015], [0.355, 0.19, 0.31]);
  addEllipsoid(head, dark, [0.06, 0.15, -0.245], [0.22, 0.07, 0.065]);
  addEllipsoid(head, eye, [-0.13, -0.035, -0.291], [0.032, 0.052, 0.025]);
  addEllipsoid(head, eye, [0.13, -0.035, -0.291], [0.032, 0.052, 0.025]);
  addEllipsoid(head, skin, [0, -0.12, -0.302], [0.045, 0.018, 0.018]);
  // Signature hair clip, visible from the default isometric camera.
  const clip = addEllipsoid(head, accent, [0.23, 0.2, -0.21], [0.075, 0.03, 0.022]);
  clip.rotation.z = -0.45;

  const label = makeNameTag(name);
  label.position.y = 1.85;
  group.add(label);
  return { group, proceduralRig, body: torso, head, bodyPivot, leftLeg, rightLeg, leftArm, rightArm };
}

function loadObjModel(name: string, onLoad: (object: THREE.Group) => void, onError: (error: unknown) => void) {
  const catalog = ROOM_PROP_CATALOG.find((item) => item.asset === name);
  if (catalog?.geometry) {
    const model = createOfficePropGeometry(catalog.geometry);
    if (model) { onLoad(model); return; }
  }
  const paths = roomPropAssetPaths(catalog ?? { asset: name });
  void loadRoomPropAsset(paths).then(onLoad, onError);
}

function normalizeProp(object: THREE.Object3D, height: number) {
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const scale = height / Math.max(size.y, 0.001);
  object.scale.setScalar(scale);
  object.position.set(-((bounds.min.x + bounds.max.x) / 2) * scale, -bounds.min.y * scale, -((bounds.min.z + bounds.max.z) / 2) * scale);
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

/** Aspect-fit the rendered model inside the X/Z collision footprint. */
function fitPropToFootprint(object: THREE.Object3D, width: number, depth: number) {
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const fitX = size.x > 0.001 ? width / size.x : Number.POSITIVE_INFINITY;
  const fitZ = size.z > 0.001 ? depth / size.z : Number.POSITIVE_INFINITY;
  // Keep the model's proportions. The catalog footprint may have been raised
  // to the 1 × 1 m minimum while the source model is naturally much narrower;
  // stretching each axis independently made tables and other props look wrong.
  // A promoted minimum collision footprint must not enlarge a small model.
  // For example, a Kenney chair is only ~0.38 m wide but its editable hitbox
  // is 1 × 1 m; scaling it up to fill that hitbox makes the chair taller than
  // the avatar. Keep the authored model size and only shrink when it exceeds
  // its footprint.
  const fitScale = Math.min(1, fitX, fitZ);
  if (Number.isFinite(fitScale) && fitScale > 0) {
    // Scale all axes together. Scaling only X/Z preserves the footprint but
    // distorts tall/narrow assets such as chairs and screens.
    object.scale.multiplyScalar(fitScale);
  }

  // Asset roots can carry an off-center pivot (especially GLTF scenes with
  // nested transforms). Fit the rendered geometry first, then place its actual
  // bounds around the same origin used by the saved collision footprint.
  const fittedBounds = new THREE.Box3().setFromObject(object);
  const fittedCenter = fittedBounds.getCenter(new THREE.Vector3());
  object.position.x -= fittedCenter.x;
  object.position.z -= fittedCenter.z;
  object.position.y -= fittedBounds.min.y;
  return fitScale;
}

/** Match the rendered size used by an occupied vehicle (2.2 m longest side). */
function fitVehicleToDriveScale(object: THREE.Object3D) {
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 2.2 / Math.max(size.x, size.z, 0.001);
  object.scale.setScalar(scale);
  object.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
}

type RoadSurfaceRect = { left: number; right: number; top: number; bottom: number };

/** Union axis-aligned roadway rectangles into non-overlapping surface patches. */
function mergeRoadwayRectangles(roadways: NonNullable<RoomLayout["roadways"]>): RoadSurfaceRect[] {
  const halfJoin = ROAD_JOIN_OVERLAP_M / 2;
  const source = roadways.map((road) => ({
    left: road.x - road.width / 2 - halfJoin,
    right: road.x + road.width / 2 + halfJoin,
    top: road.z - road.depth / 2 - halfJoin,
    bottom: road.z + road.depth / 2 + halfJoin,
  }));
  const xEdges = [...new Set(source.flatMap(({ left, right }) => [left, right].map((value) => Math.round(value * 10_000) / 10_000)))].sort((a, b) => a - b);
  const active = new Map<string, RoadSurfaceRect>();
  const merged: RoadSurfaceRect[] = [];
  for (let index = 0; index < xEdges.length - 1; index += 1) {
    const left = xEdges[index]!;
    const right = xEdges[index + 1]!;
    if (right - left < 0.0001) continue;
    const midX = (left + right) / 2;
    const intervals = source.filter((rect) => midX > rect.left - 0.0001 && midX < rect.right + 0.0001)
      .map((rect) => [rect.top, rect.bottom] as const)
      .sort((a, b) => a[0] - b[0]);
    const union: Array<[number, number]> = [];
    for (const [top, bottom] of intervals) {
      const last = union[union.length - 1];
      if (last && top <= last[1] + 0.0001) last[1] = Math.max(last[1], bottom);
      else union.push([top, bottom]);
    }
    const keys = new Set(union.map(([top, bottom]) => `${top.toFixed(4)}:${bottom.toFixed(4)}`));
    for (const [key, rect] of active) {
      if (keys.has(key)) continue;
      merged.push(rect);
      active.delete(key);
    }
    for (const [top, bottom] of union) {
      const key = `${top.toFixed(4)}:${bottom.toFixed(4)}`;
      const rect = active.get(key);
      if (rect) rect.right = right;
      else active.set(key, { left, right, top, bottom });
    }
  }
  merged.push(...active.values());
  return merged;
}

/** Keep road paint out of crossings so each junction is drawn only once. */
function visibleRoadRanges(road: NonNullable<RoomLayout["roadways"]>[number], roadways: NonNullable<RoomLayout["roadways"]>) {
  const horizontal = road.width >= road.depth;
  const length = horizontal ? road.width : road.depth;
  const blocked = roadways.flatMap((crossing) => {
    if (crossing === road || (crossing.width >= crossing.depth) === horizontal) return [];
    // Major roads own crossings. For equal priority, stable array order wins.
    const crossingWins = crossing.kind === "major" && road.kind === "small"
      || crossing.kind === road.kind && roadways.indexOf(crossing) < roadways.indexOf(road);
    if (!crossingWins) return [];
    if (horizontal) {
      if (road.z < crossing.z - crossing.depth / 2 || road.z > crossing.z + crossing.depth / 2) return [];
      return [[crossing.x - crossing.width / 2 - 0.12 - road.x, crossing.x + crossing.width / 2 + 0.12 - road.x] as const];
    }
    if (road.x < crossing.x - crossing.width / 2 || road.x > crossing.x + crossing.width / 2) return [];
    return [[crossing.z - crossing.depth / 2 - 0.12 - road.z, crossing.z + crossing.depth / 2 + 0.12 - road.z] as const];
  }).map(([start, end]) => [Math.max(-length / 2, start), Math.min(length / 2, end)] as const)
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  const visible: Array<readonly [number, number]> = [];
  let cursor = -length / 2;
  for (const [start, end] of blocked) {
    if (start > cursor) visible.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < length / 2) visible.push([cursor, length / 2]);
  return visible;
}

/** Draw the same 2D road artwork to one texture for a single 3D ground plane. */
function makeRoadSurfaceTexture(roadways: NonNullable<RoomLayout["roadways"]>, mapWidth: number, mapDepth: number) {
  const canvas = document.createElement("canvas");
  // Supersample the 2D artwork so lane paint stays crisp when viewed obliquely
  // in 3D, while bounding the GPU texture to a predictable memory budget.
  const pixelsPerMeter = Math.min(8, 4096 / Math.max(mapWidth, mapDepth), Math.sqrt(8_000_000 / (mapWidth * mapDepth)));
  canvas.width = Math.max(1, Math.ceil(mapWidth * pixelsPerMeter));
  canvas.height = Math.max(1, Math.ceil(mapDepth * pixelsPerMeter));
  const context = canvas.getContext("2d");
  if (context) {
    const sx = canvas.width / mapWidth;
    const sz = canvas.height / mapDepth;
    const drawRect = (x: number, z: number, width: number, depth: number, color: string) => {
      context.fillStyle = color;
      context.fillRect((x - width / 2 + mapWidth / 2) * sx, (z - depth / 2 + mapDepth / 2) * sz, width * sx, depth * sz);
    };
    for (const rect of mergeRoadwayRectangles(roadways)) {
      drawRect((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2, rect.right - rect.left, rect.bottom - rect.top, ROAD_SURFACE_COLOR);
    }
    for (const road of roadways) {
      const horizontal = road.width >= road.depth;
      const length = horizontal ? road.width : road.depth;
      const width = horizontal ? road.depth : road.width;
      const major = road.kind === "major";
      const acrossPixelsPerMeter = (horizontal ? sz : sx);
      const paintWidth = Math.max(major ? 0.14 : 0.1, 1.4 / acrossPixelsPerMeter);
      const ranges = visibleRoadRanges(road, roadways);
      for (const [start, end] of ranges) {
        for (const side of [-1, 1]) {
          const offset = side * (width / 2 - 0.28);
          if (horizontal) drawRect(road.x + (start + end) / 2, road.z + offset, end - start, paintWidth, "#e9eeee");
          else drawRect(road.x + offset, road.z + (start + end) / 2, paintWidth, end - start, "#e9eeee");
        }
        const dashLength = major ? 2.8 : 1.5;
        const dashGap = major ? 2.4 : 2.5;
        const phaseStart = -length / 2 + 1.5;
        const firstDash = phaseStart + Math.max(0, Math.ceil((start - phaseStart) / (dashLength + dashGap))) * (dashLength + dashGap);
        for (let along = firstDash; along < end - 0.5; along += dashLength + dashGap) {
          const segment = Math.min(dashLength, end - 0.5 - along);
          if (segment <= 0) continue;
          const color = major ? "#f5c842" : "#e9eeee";
          if (horizontal) drawRect(road.x + along + segment / 2, road.z, segment, paintWidth, color);
          else drawRect(road.x, road.z + along + segment / 2, paintWidth, segment, color);
        }
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Snap the prop's footprint edges to the 1 m office grid. Snapping its center
 * to an integer put 1 × 1 props on grid intersections, straddling four cells.
 */
function snapCampusPropPoint(point: { x: number; z: number }, width: number, depth: number, rotation = 0, bounds: { width: number; depth: number } = { width: CAMPUS_WORLD.width, depth: CAMPUS_WORLD.depth }) {
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));
  const footprintWidth = Math.max(0, width) * cos + Math.max(0, depth) * sin;
  const footprintDepth = Math.max(0, depth) * cos + Math.max(0, width) * sin;
  const halfWidth = footprintWidth / 2;
  const halfDepth = footprintDepth / 2;
  // The footprint's lower edge is an integer grid coordinate. Clamp that edge
  // to the last whole grid coordinate that keeps the footprint in the office.
  const maxCellX = Math.max(0, Math.floor(bounds.width - footprintWidth));
  const maxCellZ = Math.max(0, Math.floor(bounds.depth - footprintDepth));
  return {
    x: THREE.MathUtils.clamp(Math.round(point.x - halfWidth), 0, maxCellX) + halfWidth,
    z: THREE.MathUtils.clamp(Math.round(point.z - halfDepth), 0, maxCellZ) + halfDepth,
  };
}

export function WorldCanvas({ activeRoomKey, cameraRoomKey = activeRoomKey, playersRef, localSessionIdRef, speakingUsernamesRef, heldKeysRef, cameraYawRef, cameraBehindCharacterRef, firstPersonViewRef, roomPortals = [], roomLayout, personalDeskZone = null, currentPrivateZoneId = null, inboundAudioMuted = false, appPaused = false, idleAnimationsEnabled = true, ghostSessionIds = new Set<string>(), mapEditMode = false, spawnPlacementMode = false, onMoveSpawnPoint, zoneDrawing = false, onZoneAreaDrawn, onSelectDeskZone, onSelectMapZone, selectedMapZoneId = null, lockedZoneIds = [], onClaimDeskZone, canClaimDesk = true, deskClaimingZoneId = null, buildMode = false, buildTool = "select", selectedAsset = null, onPlaceProp, onPlacementComplete, onMoveProp, onRotateProp, onDeleteProp, onSelectMapItem, selectedMapItemId = null, onDrawPrivateZone, onAutoMove, onSelectPlayer, onGhostModeChange, onBlasterShot, onWeaponEquip, blasterEventsRef, jumpStartedAtRef, onJump, onVehicleInteract, canEditMap = false, mapEditorUsername = null, mapEditLockPending = false, onEditMap, onModifyProps }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const compassRoseRef = useRef<HTMLDivElement>(null);
  const [propActionMenu, setPropActionMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const propActionMenuRef = useRef(propActionMenu);
  propActionMenuRef.current = propActionMenu;
  const propActionMenuElementRef = useRef<HTMLDivElement>(null);
  const movePropArmedIdRef = useRef<string | null>(null);
  const [movePropArmedId, setMovePropArmedId] = useState<string | null>(null);
  const [nearbyVehicle, setNearbyVehicle] = useState<{ vehicleId: KenneyVehicleId; propId: string } | null>(null);
  const nearbyVehicleRef = useRef<{ vehicleId: KenneyVehicleId; propId: string } | null>(null);
  const [isDriving, setIsDriving] = useState(false);
  const [firstPersonView, setFirstPersonView] = useState(false);
  const inboundAudioMutedRef = useRef(inboundAudioMuted);
  inboundAudioMutedRef.current = inboundAudioMuted;
  const idleAnimationsEnabledRef = useRef(idleAnimationsEnabled);
  idleAnimationsEnabledRef.current = idleAnimationsEnabled;
  const [activeFloatingGroup, setActiveFloatingGroup] = useState<"edit" | "view" | "zoom" | null>(null);
  const [tppTransitionDistanceM, setTppTransitionDistanceM] = useState<number>(CAMERA.maxZoom);
  const tppTransitionDistanceMRef = useRef<number>(CAMERA.maxZoom);
  const [selectedBlasterId, setSelectedBlasterId] = useState<KenneyBlasterId>(KENNEY_BLASTER_IDS[0]);
  const selectedBlasterIdRef = useRef<KenneyBlasterId>(KENNEY_BLASTER_IDS[0]);
  const [weaponInventoryOpen, setWeaponInventoryOpen] = useState(false);
  const weaponInventoryOpenRef = useRef(false);
  weaponInventoryOpenRef.current = weaponInventoryOpen;
  firstPersonViewRef.current = firstPersonView;
  useEffect(() => () => { firstPersonViewRef.current = false; }, [firstPersonViewRef]);
  const previousRoomKeyRef = useRef(cameraRoomKey);
  const previousWorldKeyRef = useRef(activeRoomKey);
  const cameraStateRef = useRef(createCameraState(activeRoomKey === "lobby"));
  const [cameraState, setCameraState] = useState(cameraStateRef.current);
  const dispatchCamera = (event: CameraEvent) => {
    const nextState = cameraReducer(cameraStateRef.current, event);
    if (nextState === cameraStateRef.current) return;
    cameraStateRef.current = nextState;
    cameraBehindCharacterRef.current = isBehindCharacterLocked(nextState);
    setCameraState(nextState);
  };
  const toggleCameraView = () => {
    dispatchCamera({ type: "toggle-fpp" });
    const enteringFirstPerson = cameraStateRef.current.mode === "fpp";
    setActiveFloatingGroup(null);
    setFirstPersonView(enteringFirstPerson);
    firstPersonViewRef.current = enteringFirstPerson;
    buildCallbacksRef.current.onWeaponEquip?.(enteringFirstPerson ? selectedBlasterIdRef.current : "");
    setWeaponInventoryOpen(false);
    if (document.pointerLockElement) document.exitPointerLock();
  };
  const toggleCameraViewRef = useRef(toggleCameraView);
  toggleCameraViewRef.current = toggleCameraView;
  const drivingRef = useRef(false);
  const vehicleInteractRef = useRef(onVehicleInteract);
  vehicleInteractRef.current = onVehicleInteract;
  const campusOverview = activeRoomKey === "lobby";
  const tppZoomMaxDistanceM = campusOverview ? tppTransitionDistanceM : CAMERA.maxZoom;
  const campusOverviewRef = useRef(true);
  campusOverviewRef.current = campusOverview;

  const map2dCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraPanTargetRef = useRef<THREE.Vector3 | null>(null);
  const cameraLookTargetRef = useRef<THREE.Vector3 | null>(null);
  const cameraPositionRef = useRef<THREE.Vector3 | null>(null);
  const mapEditModeRef = useRef(mapEditMode);
  mapEditModeRef.current = mapEditMode;
  const roomPortalsRef = useRef(roomPortals);
  roomPortalsRef.current = roomPortals;
  const cameraRoomKeyRef = useRef(cameraRoomKey);
  cameraRoomKeyRef.current = cameraRoomKey;
  const buildModeRef = useRef(buildMode); buildModeRef.current = buildMode;
  const selectedMapItemIdRef = useRef(selectedMapItemId); selectedMapItemIdRef.current = selectedMapItemId;
  const selectedMapZoneIdRef = useRef(selectedMapZoneId); selectedMapZoneIdRef.current = selectedMapZoneId;
  const buildToolRef = useRef(buildTool); buildToolRef.current = buildTool;
  const selectedAssetRef = useRef(selectedAsset); selectedAssetRef.current = selectedAsset;
  const spawnPlacementModeRef = useRef(spawnPlacementMode); spawnPlacementModeRef.current = spawnPlacementMode;
  const ghostSessionIdsRef = useRef(ghostSessionIds); ghostSessionIdsRef.current = ghostSessionIds;
  const buildCallbacksRef = useRef({ onPlaceProp, onPlacementComplete, onMoveProp, onSelectMapItem, onDrawPrivateZone, onZoneAreaDrawn, onSelectDeskZone, onSelectMapZone, onMoveSpawnPoint, onClaimDeskZone, onAutoMove, onSelectPlayer, onGhostModeChange, onBlasterShot, onWeaponEquip, onJump });
  buildCallbacksRef.current = { onPlaceProp, onPlacementComplete, onMoveProp, onSelectMapItem, onDrawPrivateZone, onZoneAreaDrawn, onSelectDeskZone, onSelectMapZone, onMoveSpawnPoint, onClaimDeskZone, onAutoMove, onSelectPlayer, onGhostModeChange, onBlasterShot, onWeaponEquip, onJump };
  const canClaimDeskRef = useRef(canClaimDesk);
  canClaimDeskRef.current = canClaimDesk;
  const deskClaimingZoneIdRef = useRef(deskClaimingZoneId);
  deskClaimingZoneIdRef.current = deskClaimingZoneId;
  const zoneDrawingRef = useRef(zoneDrawing);
  zoneDrawingRef.current = zoneDrawing;
  const zoneStartRef = useRef<{ x: number; z: number } | null>(null);
  const zoneLockIconsRef = useRef(new Map<string, THREE.Sprite>());
  useEffect(() => {
    for (const [zoneId, icon] of zoneLockIconsRef.current) icon.visible = lockedZoneIds.includes(zoneId);
  }, [lockedZoneIds]);
  useEffect(() => { zoneStartRef.current = null; }, [buildTool]);
  useEffect(() => { const canvas = hostRef.current?.querySelector("canvas"); if (canvas) canvas.style.cursor = zoneDrawing ? "crosshair" : buildMode ? (buildTool === "place" ? "copy" : "crosshair") : "grab"; }, [buildMode, buildTool, zoneDrawing]);
  useEffect(() => {
    const lookTarget = cameraLookTargetRef.current;
    if ((buildMode || mapEditMode) && cameraStateRef.current.following && lookTarget) cameraPanTargetRef.current?.copy(lookTarget);
    dispatchCamera({ type: "edit", active: buildMode || mapEditMode });
    if (!buildMode && !mapEditMode) return;
    setFirstPersonView(false);
    firstPersonViewRef.current = false;
    setWeaponInventoryOpen(false);
    if (document.pointerLockElement) document.exitPointerLock();
  }, [buildMode, mapEditMode, firstPersonViewRef]);
  useEffect(() => { if (buildMode) return; movePropArmedIdRef.current = null; setMovePropArmedId(null); setPropActionMenu(null); }, [buildMode]);
  useEffect(() => {
    if (previousRoomKeyRef.current === cameraRoomKey && previousWorldKeyRef.current === activeRoomKey) return;
    const worldChanged = previousWorldKeyRef.current !== activeRoomKey;
    previousRoomKeyRef.current = cameraRoomKey;
    previousWorldKeyRef.current = activeRoomKey;
    // Keep yaw while walking into another world so the movement basis cannot reverse.
    const walking = Boolean(heldKeysRef?.current && hasCameraMovement(heldKeysRef.current));
    dispatchCamera({ type: "room-change", campus: activeRoomKey === "lobby", alignBehind: !walking, preserveFraming: !worldChanged });
    // Media zones share the same world. Only entering another world resets framing.
    if (!worldChanged) return;
    firstPersonViewRef.current = false;
    setFirstPersonView(false);
    setWeaponInventoryOpen(false);
    if (document.pointerLockElement) document.exitPointerLock();
    cameraPositionRef.current = null;
  }, [activeRoomKey, cameraRoomKey, firstPersonViewRef]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const dimensions = roomLayout?.dimensions ?? CAMPUS_LAYOUT.floors[0]!;
    const mapWorld = { ...CAMPUS_WORLD, ...dimensions };
    const activeFloor = { ...CAMPUS_LAYOUT.floors[0]!, ...dimensions };

    const cameraOcclusion = new CameraOcclusion();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#d8e5df");
    scene.fog = null;
    const camera = new THREE.PerspectiveCamera(TPP_FOV_DEG, 1, CAMERA_NEAR_MAX_M, CAMERA_FAR_MIN_M);
    if (cameraPositionRef.current) camera.position.copy(cameraPositionRef.current);
    scene.add(camera);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);
    const map2dCanvas = document.createElement("canvas");
    map2dCanvas.setAttribute("aria-hidden", "true");
    Object.assign(map2dCanvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none", display: "none" });
    host.appendChild(map2dCanvas);
    map2dCanvasRef.current = map2dCanvas;
    const map2dCameraState = new Float64Array(32);
    const map2dPlayerState = new Map<string, { x: number; z: number; displayName: string; local: boolean; speaking: boolean }>();
    let map2dWasVisible = false;
    // Compact shooter-style first-person viewmodel. The arms are simple
    // stylized shapes; the blaster itself is Kenney's CC0 model.
    const firstPersonViewModel = new THREE.Group();
    const firstPersonWeapon = new THREE.Group();
    firstPersonViewModel.add(firstPersonWeapon);
    camera.add(firstPersonViewModel);
    firstPersonViewModel.visible = false;
    const sleeveMaterial = new THREE.MeshStandardMaterial({ color: 0x219ebc, roughness: 0.8 });
    const handMaterial = new THREE.MeshStandardMaterial({ color: 0xf2bd91, roughness: 0.9 });
    const armGeometry = new THREE.CapsuleGeometry(0.055, 0.3, 4, 8);
    const handGeometry = new THREE.SphereGeometry(0.075, 12, 8);
    const addForearm = (start: THREE.Vector3, end: THREE.Vector3, palm: THREE.Vector3) => {
      const arm = new THREE.Mesh(armGeometry, sleeveMaterial);
      const direction = end.clone().sub(start);
      arm.position.copy(start).add(end).multiplyScalar(0.5);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
      firstPersonViewModel.add(arm);
      const hand = new THREE.Mesh(handGeometry, handMaterial);
      hand.position.copy(palm);
      firstPersonViewModel.add(hand);
    };
    addForearm(new THREE.Vector3(-0.52, -0.62, -0.38), new THREE.Vector3(-0.2, -0.38, -0.65), new THREE.Vector3(-0.17, -0.36, -0.68));
    addForearm(new THREE.Vector3(0.62, -0.67, -0.28), new THREE.Vector3(0.28, -0.42, -0.58), new THREE.Vector3(0.27, -0.4, -0.61));
    const gunMuzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb703, transparent: true, opacity: 0.95 }),
    );
    gunMuzzleFlash.position.set(0.28, -0.2, -1.12);
    gunMuzzleFlash.scale.set(1.2, 0.8, 1.8);
    gunMuzzleFlash.visible = false;
    firstPersonViewModel.add(gunMuzzleFlash);
    let weaponRecoilUntil = 0;
    let muzzleFlashUntil = 0;
    let blasterAudio: AudioContext | null = null;
    let lastBlasterSoundAt = 0;
    const firstPersonEffects: Array<{ group: THREE.Group; createdAt: number; duration: number; beam?: THREE.Group; beamOnly?: boolean }> = [];
    const heldWeaponBySessionId = new Map<string, THREE.Group>();
    const blasterTemplates = new Map<KenneyBlasterId, Promise<THREE.Group>>();
    const loadBlasterTemplate = (id: KenneyBlasterId) => {
      let pending = blasterTemplates.get(id);
      if (!pending) {
        pending = loadGltfAsset(`/assets/kenney/blaster-kit/${id}.glb`).then(({ scene: model }) => {
          if (disposed) { disposeObjectResources(model); throw new Error("World was disposed while loading the blaster."); }
          const bounds = new THREE.Box3().setFromObject(model);
          model.position.sub(bounds.getCenter(new THREE.Vector3()));
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.userData.sharedKenneyAvatarResources = true;
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              for (const material of materials) material.side = THREE.DoubleSide;
            }
          });
          return model;
        });
        blasterTemplates.set(id, pending);
      }
      return pending;
    };
    let mountedFirstPersonBlaster: KenneyBlasterId | "" = "";
    let requestedFirstPersonBlaster: KenneyBlasterId | "" = "";
    const equipFirstPersonBlaster = (id: KenneyBlasterId) => {
      if (requestedFirstPersonBlaster === id) return;
      requestedFirstPersonBlaster = id;
      // Remove the previously equipped model as soon as selection changes.
      // Waiting for the next GLTF to finish left the old weapon visible while
      // the inventory already showed the new selection.
      firstPersonWeapon.clear();
      mountedFirstPersonBlaster = "";
      void loadBlasterTemplate(id).then((template) => {
        if (disposed || requestedFirstPersonBlaster !== id || selectedBlasterIdRef.current !== id) return;
        const model = SkeletonUtils.clone(template) as THREE.Group;
        model.scale.setScalar(0.9);
        model.position.set(0.27, -0.25, -0.76);
        model.rotation.y = Math.PI;
        firstPersonWeapon.add(model);
        mountedFirstPersonBlaster = id;
      }).catch((error: unknown) => { if (requestedFirstPersonBlaster === id) requestedFirstPersonBlaster = ""; console.warn(`Could not load Kenney ${id}.`, error); });
    };
    const makeLaserBeam = (start: THREE.Vector3, end: THREE.Vector3) => {
      const beam = new THREE.Group();
      const direction = end.clone().sub(start);
      const length = Math.max(direction.length(), 0.02);
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      beam.position.copy(midpoint);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      const layers = [
        { radius: 0.065, color: 0xfb8500, opacity: 0.9 },
        { radius: 0.026, color: 0xfffbe8, opacity: 1 },
      ];
      for (const layer of layers) {
        const material = new THREE.MeshBasicMaterial({ color: layer.color, transparent: true, opacity: layer.opacity, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false });
        const ray = new THREE.Mesh(new THREE.CylinderGeometry(layer.radius, layer.radius, length, 10, 1, true), material);
        ray.renderOrder = 20;
        beam.add(ray);
      }
      return beam;
    };
    const playBlasterShotSound = () => {
      if (inboundAudioMutedRef.current) return;
      const now = performance.now();
      if (now - lastBlasterSoundAt < 180) return;
      lastBlasterSoundAt = now;
      try {
        blasterAudio ??= new AudioContext();
        if (blasterAudio.state === "suspended") void blasterAudio.resume();
        const oscillator = blasterAudio.createOscillator();
        const gain = blasterAudio.createGain();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(760, blasterAudio.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(240, blasterAudio.currentTime + 0.11);
        gain.gain.setValueAtTime(0.12, blasterAudio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, blasterAudio.currentTime + 0.12);
        oscillator.connect(gain);
        gain.connect(blasterAudio.destination);
        oscillator.start();
        oscillator.stop(blasterAudio.currentTime + 0.13);
      } catch { /* Audio can be unavailable in a muted or restricted browser. */ }
    };
    const primeBlasterAudio = () => {
      try {
        blasterAudio ??= new AudioContext();
        if (blasterAudio.state === "suspended") void blasterAudio.resume();
      } catch { /* Audio can be unavailable in a muted or restricted browser. */ }
    };
    const deskClaimLayer = document.createElement("div");
    deskClaimLayer.className = "desk-map-claim-layer";
    deskClaimLayer.setAttribute("role", "group");
    deskClaimLayer.setAttribute("aria-label", "Available desks");
    host.appendChild(deskClaimLayer);
    const deskClaimButtons: Array<{ zoneId: string; zoneName: string; zoneWidth: number; zoneDepth: number; zoneLabel: THREE.Sprite; anchor: THREE.Vector3; button: HTMLButtonElement }> = [];
    let hoveredClaimZoneId: string | null = null;
    const animatedDoors: Array<{
      x: number;
      z: number;
      hinges: Array<{ group: THREE.Group; openAngle: number }>;
      openUntil: number;
    }> = [];
    // Prop definitions do not change during this canvas lifetime. Resolve the
    // driveable catalog once instead of rebuilding this list every animation frame.
    const driveableProps = (roomLayout?.props ?? []).flatMap((placed) => {
      const definition = ROOM_PROP_CATALOG.find((item) => item.asset === placed.asset);
      return definition?.vehicleId && KENNEY_VEHICLE_IDS.includes(definition.vehicleId as KenneyVehicleId)
        ? [{ id: placed.id, vehicleId: definition.vehicleId as KenneyVehicleId, x: placed.x, z: placed.z, rotation: placed.rotation }]
        : [];
    });
    const mapRaycaster = new THREE.Raycaster();
    const mapPointerNdc = new THREE.Vector2();
    const mapGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const mapGroundHit = new THREE.Vector3();
    let fireFirstPerson: () => void = () => undefined;
    let lastFirstPersonShotAt = 0;
    let draggingMapProp: { id: string; pointerId: number; last: { x: number; z: number }; startPointer: { x: number; z: number }; offset: { x: number; z: number }; center: { x: number; z: number }; moved: boolean; elevation: number; preview: THREE.Group; hiddenVisuals: Array<{ object: THREE.Object3D; visible: boolean }> } | null = null;
    let zoneAreaDrag: { pointerId: number; start: { x: number; z: number } } | null = null;
    const mapPositionFromPointer = (event: { clientX: number; clientY: number }) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      mapPointerNdc.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      mapRaycaster.setFromCamera(mapPointerNdc, camera);
      if (!mapRaycaster.ray.intersectPlane(mapGroundPlane, mapGroundHit)) return null;
      return { x: THREE.MathUtils.clamp(mapGroundHit.x, 0, mapWorld.width), z: THREE.MathUtils.clamp(mapGroundHit.z, 0, mapWorld.depth) };
    };
    const placementPositionFromPointer = (event: { clientX: number; clientY: number }, item: (typeof ROOM_PROP_CATALOG)[number]) => {
      const groundPoint = mapPositionFromPointer(event);
      const canUseSurfaces = item.placementClass === "small" || item.placementClass === "shelf";
      if (!canUseSurfaces || !groundPoint) return groundPoint;
      const bounds = renderer.domElement.getBoundingClientRect();
      mapPointerNdc.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      mapRaycaster.setFromCamera(mapPointerNdc, camera);
      const topHit = mapRaycaster.intersectObjects(campusMapProps.children, true).find((hit) => {
        if (hit.object.userData.mapCollisionOverlay || hit.object.userData.mapPropDragHitTarget) return false;
        let node: THREE.Object3D | null = hit.object;
        while (node && node !== campusMapProps && typeof node.userData.officeMapPropId !== "string") node = node.parent;
        const prop = roomLayout?.props.find((entry) => entry.id === node?.userData.officeMapPropId);
        const definition = prop && ROOM_PROP_CATALOG.find((entry) => entry.asset === prop.asset);
        if (!prop || !definition) return false;
        const compatible = item.placementClass === "small"
          ? definition.supportsPlacement === "tabletop" || definition.supportsPlacement === "shelf-top"
          : definition.placementClass === "shelf";
        const topY = (prop.elevation ?? 0) + definition.height;
        return compatible && Math.abs(hit.point.y - topY) <= Math.max(0.18, definition.height * 0.12);
      });
      if (!topHit) return groundPoint;

      // The clicked point is where the cursor landed, not the center of the
      // new prop. Clamp that center into the support's usable top footprint so
      // edge clicks cannot make a small item fall to floor level or overhang.
      let supportNode: THREE.Object3D | null = topHit.object;
      while (supportNode && supportNode !== campusMapProps && typeof supportNode.userData.officeMapPropId !== "string") supportNode = supportNode.parent;
      const supportProp = roomLayout?.props.find((entry) => entry.id === supportNode?.userData.officeMapPropId);
      const supportDefinition = supportProp && ROOM_PROP_CATALOG.find((entry) => entry.asset === supportProp.asset);
      if (!supportProp || !supportDefinition) return groundPoint;

      const supportCenterX = supportProp.x + mapWorld.width / 2;
      const supportCenterZ = supportProp.z + mapWorld.depth / 2;
      const dx = topHit.point.x - supportCenterX;
      const dz = topHit.point.z - supportCenterZ;
      const cos = Math.cos(supportProp.rotation);
      const sin = Math.sin(supportProp.rotation);
      const localX = dx * cos + dz * sin;
      const localZ = -dx * sin + dz * cos;
      const relativeRotation = -supportProp.rotation;
      const itemWidth = item.width * Math.abs(Math.cos(relativeRotation)) + item.depth * Math.abs(Math.sin(relativeRotation));
      const itemDepth = item.depth * Math.abs(Math.cos(relativeRotation)) + item.width * Math.abs(Math.sin(relativeRotation));
      const maxLocalX = Math.max(0, (supportProp.width - itemWidth) / 2 - 0.015);
      const maxLocalZ = Math.max(0, (supportProp.depth - itemDepth) / 2 - 0.015);
      const clampedLocalX = THREE.MathUtils.clamp(localX, -maxLocalX, maxLocalX);
      const clampedLocalZ = THREE.MathUtils.clamp(localZ, -maxLocalZ, maxLocalZ);
      const center = {
        x: supportCenterX + clampedLocalX * cos - clampedLocalZ * sin,
        z: supportCenterZ + clampedLocalX * sin + clampedLocalZ * cos,
      };

      // Keep the 1 m map grid while choosing a nearby grid point that still
      // fits entirely on the same support. The bounded search is small and is
      // only run while the placement cursor is over a supporting surface.
      const snapped = snapCampusPropPoint(center, item.width, item.depth, 0, mapWorld);
      const nearbyGridPoints = [{ ...snapped }];
      for (let radius = 1; radius <= 3; radius += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          for (let offsetZ = -radius; offsetZ <= radius; offsetZ += 1) {
            if (Math.max(Math.abs(offsetX), Math.abs(offsetZ)) !== radius) continue;
            nearbyGridPoints.push(snapCampusPropPoint({ x: snapped.x + offsetX, z: snapped.z + offsetZ }, item.width, item.depth, 0, mapWorld));
          }
        }
      }
      const validGridPoints = nearbyGridPoints.filter((point, index, all) =>
        all.findIndex((candidate) => candidate.x === point.x && candidate.z === point.z) === index &&
        roomPropPlacementSupport(roomLayout?.props ?? [], item.asset, point.x - mapWorld.width / 2, point.z - mapWorld.depth / 2) !== null,
      );
      return validGridPoints.sort((a, b) =>
        Math.hypot(a.x - topHit.point.x, a.z - topHit.point.z) - Math.hypot(b.x - topHit.point.x, b.z - topHit.point.z),
      )[0] ?? groundPoint;
    };
    const zonePositionFromPointer = (event: { clientX: number; clientY: number }) => {
      // Let zone drawing reach the real map perimeter. The zone creation
      // validation accounts for wall thickness, so geometry still cannot be
      // saved when it would extend beyond the campus bounds.
      return mapPositionFromPointer(event);
    };

    scene.add(new THREE.HemisphereLight(0xe9f5ff, 0x8b7964, 2.1));
    const sunlight = new THREE.DirectionalLight(0xfff4df, 2.4);
    sunlight.position.set(-7, 14, 8);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(1024, 1024);
    scene.add(sunlight);

    let disposed = false;

    // One clean 200 × 250 shared floor with no placed room content.
    const campusRoot = new THREE.Group();
    const campusMapProps = new THREE.Group();
    const mapEditOverlay = new THREE.Group();
    mapEditOverlay.name = "In-world map edit dimensions and grid";
    mapEditOverlay.visible = false;
    campusRoot.add(mapEditOverlay);
    const zoneDraftPreview = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: "#219ebc", transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }),
    );
    zoneDraftPreview.rotation.x = -Math.PI / 2;
    zoneDraftPreview.position.y = 0.045;
    zoneDraftPreview.visible = false;
    zoneDraftPreview.renderOrder = 4;
    campusRoot.add(zoneDraftPreview);
    const mapCollisionOverlays: THREE.Object3D[] = [];
    const mapPropSelectionHighlights = new Map<string, THREE.Group>();
    const mapZoneSelectionHighlights = new Map<string, THREE.Group>();
    const campusRoomNameLabels: THREE.Sprite[] = [];
    const zoneNameLabels = new Map<string, { label: THREE.Sprite; owned: boolean; x: number; z: number }>();
    campusMapProps.name = "Office map props and private zones";
    campusRoot.add(campusMapProps);
    // New props are previewed directly on the shared 3D map while the editor
    // palette is collapsed. The footprint uses the same dimensions as the
    // server collision blocker so placement feedback stays trustworthy.
    const placementGhost = new THREE.Group();
    placementGhost.name = "Office prop placement preview";
    placementGhost.visible = false;
    campusRoot.add(placementGhost);
    const placementGhostModel = new THREE.Group();
    placementGhost.add(placementGhostModel);
    const placementFootprint = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.025, 1),
      new THREE.MeshBasicMaterial({ color: "#ffb703", transparent: true, opacity: 0.24, depthWrite: false }),
    );
    placementFootprint.position.y = 0.035;
    placementFootprint.renderOrder = 5;
    placementGhost.add(placementFootprint);
    const placementOutline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.03, 1)),
      new THREE.LineBasicMaterial({ color: "#fb8500", depthTest: false }),
    );
    placementOutline.position.y = 0.055;
    placementOutline.renderOrder = 6;
    placementGhost.add(placementOutline);
    let placementGhostAsset: string | null = null;
    let placementGhostLoadId = 0;
    let placementGhostPosition = { x: mapWorld.width / 2, z: mapWorld.depth / 2 };
    let placementGhostElevation = 0;
    let hasPlacementPointer = false;
    const campusFloorGroups = new Map<number, THREE.Group>();
    for (const floor of [activeFloor]) {
      const floorGroup = new THREE.Group();
      floorGroup.name = `Campus floor ${floor.id}`;
      floorGroup.userData.blasterSurface = "floor";
      floorGroup.visible = true;
      campusFloorGroups.set(floor.id, floorGroup);
      campusRoot.add(floorGroup);
      const campusFloor = makeCampusFloor(floor);
      floorGroup.add(campusFloor.group);
      campusFloor.boundaryWalls.forEach((wall) => cameraOcclusion.register(wall));
    }
    const roadwayGroup = new THREE.Group();
    roadwayGroup.name = "Generated office roads";
    const roads = roomLayout?.roadways ?? [];
    if (roads.length) {
      const texture = makeRoadSurfaceTexture(roads, mapWorld.width, mapWorld.depth);
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const surface = new THREE.Mesh(
        new THREE.PlaneGeometry(mapWorld.width, mapWorld.depth),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
      );
      surface.rotation.x = -Math.PI / 2;
      surface.position.set(mapWorld.width / 2, 0.026, mapWorld.depth / 2);
      surface.name = "Unified 2D-painted roadway texture";
      surface.renderOrder = 1;
      surface.receiveShadow = false;
      surface.userData.blasterSurface = "floor";
      roadwayGroup.add(surface);
    }
    campusRoot.add(roadwayGroup);
    const mapFineLines: number[] = [];
    const mapMajorLines: number[] = [];
    const gridY = 0.005;
    for (let x = 0; x <= mapWorld.width; x += 1) {
      const target = x % 10 === 0 ? mapMajorLines : mapFineLines;
      target.push(x, gridY, 0, x, gridY, mapWorld.depth);
    }
    for (let z = 0; z <= mapWorld.depth; z += 1) {
      const target = z % 10 === 0 ? mapMajorLines : mapFineLines;
      target.push(0, gridY, z, mapWorld.width, gridY, z);
    }
    const makeGridLines = (positions: number[], color: number, opacity: number) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
      lines.renderOrder = 2;
      mapEditOverlay.add(lines);
    };
    makeGridLines(mapFineLines, 0x688b8a, 0.24);
    makeGridLines(mapMajorLines, 0x219ebc, 0.48);
    const mapBoundary = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.035, 0), new THREE.Vector3(mapWorld.width, 0.035, 0),
        new THREE.Vector3(mapWorld.width, 0.035, mapWorld.depth), new THREE.Vector3(0, 0.035, mapWorld.depth),
      ]),
      // Keep the dimension outline behind walls and props. Disabling depth
      // testing drew this edge across any room built against the map boundary.
      new THREE.LineBasicMaterial({ color: 0x023047, depthTest: true, depthWrite: false }),
    );
    mapBoundary.renderOrder = 2;
    mapEditOverlay.add(mapBoundary);
    const widthLabel = makeNameTag(`${mapWorld.width} m`);
    widthLabel.scale.set(7, 1.75, 1);
    widthLabel.position.set(mapWorld.width / 2, 0.7, 3.5);
    mapEditOverlay.add(widthLabel);
    const depthLabel = makeNameTag(`${mapWorld.depth} m`);
    depthLabel.scale.set(7, 1.75, 1);
    depthLabel.position.set(3.5, 0.7, mapWorld.depth / 2);
    mapEditOverlay.add(depthLabel);
    const spawnMarker = new THREE.Group();
    spawnMarker.name = "Default player spawn point";
    const spawnRing = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), new THREE.MeshBasicMaterial({ color: 0xfb8500, transparent: true, opacity: 0.26, depthTest: false }));
    spawnRing.rotation.x = -Math.PI / 2;
    spawnRing.position.y = 0.06;
    spawnMarker.add(spawnRing);
    const spawnPin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0xfb8500, roughness: 0.45 }));
    spawnPin.position.y = 0.52;
    spawnPin.castShadow = true;
    spawnMarker.add(spawnPin);
    const spawnHead = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffb703, roughness: 0.35 }));
    spawnHead.position.y = 1.08;
    spawnHead.castShadow = true;
    spawnMarker.add(spawnHead);
    const spawnLabel = makeNameTag("SPAWN");
    spawnLabel.scale.set(2.4, 0.6, 1);
    spawnLabel.position.y = 1.72;
    spawnMarker.add(spawnLabel);
    const spawnPoint = roomLayout?.spawnPoint ?? { x: 0, z: 0 };
    spawnMarker.position.set(spawnPoint.x + mapWorld.width / 2, 0, spawnPoint.z + mapWorld.depth / 2);
    mapEditOverlay.add(spawnMarker);
    const campusRoomViews = new Map<string, THREE.Group>();
    for (const room of CAMPUS_LAYOUT.rooms) {
      const floorGroup = campusFloorGroups.get(room.floor);
      if (floorGroup) {
        const view = makeCampusRoom(room, room.floor as CampusFloorId);
        view.traverse((object) => {
          if (object instanceof THREE.Sprite && object.userData.campusRoomNameLabel) {
            object.userData.roomLabelX = room.x + mapWorld.width / 2;
            object.userData.roomLabelZ = room.z + mapWorld.depth / 2;
            campusRoomNameLabels.push(object);
          }
        });
        floorGroup.add(view);
        campusRoomViews.set(room.id, view);
      }
    }
    const campusPropHeights: Record<string, number> = { desk: 1.05, chairDesk: 0.9, computerScreen: 0.55, table: 1.05, chair: 0.8, toilet: 0.62, bathroomSink: 0.88 };
    const campusPropTemplates = new Map<string, THREE.Group>();
    const campusPropPromises = Object.entries(campusPropHeights).map(([name, height]) => new Promise<[string, THREE.Group | null]>((resolve) => {
      loadObjModel(name, (object) => {
        if (disposed) { disposeObjectResources(object); resolve([name, null]); return; }
        normalizeProp(object, height);
        resolve([name, object]);
      }, () => resolve([name, null]));
    }));
    void Promise.all(campusPropPromises).then((entries) => {
      const templates = new Map(entries.filter((entry): entry is [string, THREE.Group] => entry[1] !== null));
      if (disposed) { templates.forEach(disposeObjectResources); return; }
      templates.forEach((template, name) => campusPropTemplates.set(name, template));
        const measuredPropFootprints = new Map<string, { width: number; depth: number }>();
        for (const [name, template] of templates) {
          const bounds = new THREE.Box3().setFromObject(template);
          const size = bounds.getSize(new THREE.Vector3());
          measuredPropFootprints.set(name, { width: size.x, depth: size.z });
        }
      for (const room of CAMPUS_LAYOUT.rooms) {
        const placements = campusPropPlacements(room);
        if (!placements.length || !placements.every((placement) => templates.has(placement.asset))) continue;
        const view = campusRoomViews.get(room.id);
        const fallback = view?.getObjectByName("campus-furniture-fallback");
        if (!view || !fallback) continue;
        const props = new THREE.Group();
        props.name = "Kenney room furnishings";
        for (const placement of placements) {
          const template = templates.get(placement.asset)!;
            const footprint = measuredPropFootprints.get(placement.asset)!;
          const prop = SkeletonUtils.clone(template);
          prop.scale.multiplyScalar(CAMPUS_FURNITURE_SCALE);
          prop.position.set(placement.x, placement.y * CAMPUS_FURNITURE_SCALE, placement.z);
            prop.userData.collision = placement.collision;
            prop.userData.collisionFootprint = {
              width: footprint.width * CAMPUS_FURNITURE_SCALE,
              depth: footprint.depth * CAMPUS_FURNITURE_SCALE,
            };
          prop.traverse((object) => {
            if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; }
          });
          props.add(prop);
        }
        fallback.visible = false;
        view.add(props);
      }
    });
    const campusSun = new THREE.DirectionalLight(0xfff0d5, 2.3);
    campusSun.position.set(-60, 100, 70);
    campusSun.castShadow = true;
    campusSun.shadow.mapSize.set(2048, 2048);
    campusSun.shadow.camera.left = -125;
    campusSun.shadow.camera.right = 125;
    campusSun.shadow.camera.top = 125;
    campusSun.shadow.camera.bottom = -125;
    campusSun.shadow.camera.far = 280;
    campusRoot.add(new THREE.HemisphereLight(0xf5fbff, 0x706757, 1.25), campusSun);
    scene.add(campusRoot);

    const kenneyFloor = new THREE.Group();
    scene.add(kenneyFloor);
    const fallbackFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.width, WORLD.depth),
      new THREE.MeshStandardMaterial({ color: "#e6e6d8", roughness: 0.88 }),
    );
    fallbackFloor.rotation.x = -Math.PI / 2;
    fallbackFloor.receiveShadow = true;
    scene.add(fallbackFloor);
    const buildingBase = "/assets/kenney/building/";
    let floorTemplate: THREE.Object3D | null = null;
    const floorTemplatePromise = loadGltfAsset(`${buildingBase}floor.glb`);
    floorTemplatePromise.then((gltf) => {
      if (disposed) { disposeObjectResources(gltf.scene); return; }
      floorTemplate = gltf.scene;
      for (let x = -6; x < 6; x += 2) {
        for (let z = -4; z < 6; z += 2) {
          const tile = SkeletonUtils.clone(gltf.scene);
          tile.position.set(x, -0.04, z);
          tile.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            object.receiveShadow = true;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => {
              if (material instanceof THREE.MeshStandardMaterial) material.color.set("#dedfd4");
            });
          });
          kenneyFloor.add(tile);
          fallbackFloor.visible = false;
        }
      }
    }).catch((error) => console.warn("Could not load the Kenney floor tile; keeping the procedural floor.", error));
    scene.add(kenneyFloor);
    floorTemplatePromise.catch((error) => console.warn("Could not load the Kenney floor tile; keeping the procedural floor.", error));

    const furniturePieces: THREE.Object3D[] = [];
    const renderedPropScales = new Map<string, number>();

    const grid = new THREE.GridHelper(WORLD.width, 24, "#c7d2c9", "#d5ddd3");
    grid.position.y = 0.012;
    scene.add(grid);

    const kenneyWalls = new THREE.Group();
    scene.add(kenneyWalls);
    const wallPlacements = [
      { x: 0, z: -4, rotation: Math.PI / 2, count: 6 },
      { x: -6, z: 1, rotation: 0, count: 5 },
    ];
    let wallTemplate: THREE.Object3D | null = null;
    const wallTemplatePromise = loadGltfAsset(`${buildingBase}wall-low.glb`);
    wallTemplatePromise.then((gltf) => {
      if (disposed) { disposeObjectResources(gltf.scene); return; }
      wallTemplate = gltf.scene;
      for (const wall of wallPlacements) {
        for (let i = 0; i < wall.count; i += 1) {
          const segment = SkeletonUtils.clone(gltf.scene);
          const offset = (i - (wall.count - 1) / 2) * 2;
          segment.position.set(wall.x + (wall.rotation ? offset : 0), 0, wall.z + (wall.rotation ? 0 : offset));
          segment.rotation.y = wall.rotation;
          segment.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            object.castShadow = true;
            object.receiveShadow = true;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => {
              if (material instanceof THREE.MeshStandardMaterial) material.color.set("#d8d4ca");
            });
          });
          kenneyWalls.add(segment);
          cameraOcclusion.register(segment);
        }
      }
    }).catch((error) => console.warn("Could not load Kenney wall segments.", error));

    const furniture = new THREE.Group();
    scene.add(furniture);
    if (!roomLayout) loadObjModel("desk", (desk) => {
      if (disposed) { disposeObjectResources(desk); return; }
      normalizeProp(desk, 1.05);
      desk.position.set(-2.4, 0, -2.4);
      furniture.add(desk);
      cameraOcclusion.register(desk);
      furniturePieces.push(desk);
    }, (error) => console.warn("Could not load the Kenney desk; keeping the procedural room furnishing.", error));
    if (!roomLayout) loadObjModel("chairDesk", (chair) => {
      if (disposed) { disposeObjectResources(chair); return; }
      normalizeProp(chair, 0.9);
      chair.position.set(-2.4, 0, -0.85);
      furniture.add(chair);
      cameraOcclusion.register(chair);
      furniturePieces.push(chair);
    }, (error) => console.warn("Could not load the Kenney chair.", error));
    if (!roomLayout) loadObjModel("computerScreen", (monitor) => {
      if (disposed) { disposeObjectResources(monitor); return; }
      normalizeProp(monitor, 0.65);
      monitor.position.set(-2.4, 1.03, -2.45);
      furniture.add(monitor);
      cameraOcclusion.register(monitor);
      furniturePieces.push(monitor);
    }, (error) => console.warn("Could not load the Kenney monitor.", error));
    if (!roomLayout) loadObjModel("pottedPlant", (plant) => {
      if (disposed) { disposeObjectResources(plant); return; }
      normalizeProp(plant, 1.1);
      plant.position.set(3.2, 0, -1.8);
      furniture.add(plant);
      cameraOcclusion.register(plant);
      furniturePieces.push(plant);
    }, (error) => console.warn("Could not load the Kenney plant.", error));
    if (roomLayout) {
      for (const zone of roomLayout.zones) {
        const zoneMesh = new THREE.Mesh(
          new THREE.BoxGeometry(zone.width, 0.018, zone.depth),
          new THREE.MeshStandardMaterial({ color: zone.color, transparent: true, opacity: 0.22, roughness: 1 }),
        );
        zoneMesh.position.set(zone.x + mapWorld.width / 2, 0.018, zone.z + mapWorld.depth / 2);
        zoneMesh.receiveShadow = true;
        zoneMesh.userData.roomZone = zone.id;
        zoneMesh.userData.officeMapZoneId = zone.id;
        campusMapProps.add(zoneMesh);
        const zoneSelection = new THREE.Group();
        zoneSelection.position.set(zone.x + mapWorld.width / 2, 0, zone.z + mapWorld.depth / 2);
        zoneSelection.visible = false;
        const zoneSelectionFill = new THREE.Mesh(
          new THREE.BoxGeometry(zone.width, 0.035, zone.depth),
          new THREE.MeshBasicMaterial({ color: "#8ecae6", transparent: true, opacity: 0.28, depthWrite: false }),
        );
        zoneSelectionFill.position.y = 0.055;
        zoneSelectionFill.renderOrder = 5;
        const zoneSelectionOutline = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(zone.width + 0.08, 0.07, zone.depth + 0.08)),
          new THREE.LineBasicMaterial({ color: "#023047", depthTest: false }),
        );
        zoneSelectionOutline.position.y = 0.07;
        zoneSelectionOutline.renderOrder = 6;
        zoneSelection.add(zoneSelectionFill, zoneSelectionOutline);
        campusMapProps.add(zoneSelection);
        mapZoneSelectionHighlights.set(zone.id, zoneSelection);
        const zoneBorder = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(zone.width, 0.02, zone.depth)), new THREE.LineBasicMaterial({ color: zone.color }));
        zoneBorder.position.set(zone.x + mapWorld.width / 2, 0.03, zone.z + mapWorld.depth / 2);
        zoneBorder.userData.officeMapZoneId = zone.id;
        campusMapProps.add(zoneBorder);
        const zoneLabelText = zone.kind === "private"
          ? zone.ownerUsername ? `${zone.ownerUsername}'s desk` : "Available desk"
          : zone.name;
        const zoneLabel = makeNameTag(zoneLabelText);
        zoneLabel.position.set(zone.x + mapWorld.width / 2, 0.8, zone.z + mapWorld.depth / 2);
        zoneLabel.scale.set(Math.max(2.8, Math.min(6, zone.width * 0.7)), 0.7, 1);
        zoneNameLabels.set(zone.id, {
          label: zoneLabel,
          owned: zone.kind === "private" && Boolean(zone.ownerUsername?.trim()),
          x: zoneLabel.position.x,
          z: zoneLabel.position.z,
        });
        campusMapProps.add(zoneLabel);
        const lockIcon = makeZoneLockIcon();
        lockIcon.position.set(zoneLabel.position.x + zoneLabel.scale.x * 0.34, zoneLabel.position.y + 0.04, zoneLabel.position.z + 0.02);
        lockIcon.visible = lockedZoneIds.includes(zone.id);
        campusMapProps.add(lockIcon);
        zoneLockIconsRef.current.set(zone.id, lockIcon);
        if (zone.kind === "private" && !zone.ownerUsername && !mapEditMode) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "desk-map-claim-chip";
          button.textContent = "Claim";
          button.setAttribute("aria-label", `Claim ${zone.name}`);
          button.title = `Claim ${zone.name}`;
          button.addEventListener("pointerdown", (event) => event.stopPropagation());
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            if (!canClaimDeskRef.current || deskClaimingZoneIdRef.current) return;
            buildCallbacksRef.current.onClaimDeskZone?.(zone.id);
          });
          deskClaimLayer.appendChild(button);
          deskClaimButtons.push({ zoneId: zone.id, zoneName: zoneLabelText, zoneWidth: zone.width, zoneDepth: zone.depth, zoneLabel, anchor: zoneLabel.position, button });
        }
      }
      const privateZoneIndices = new Map(roomLayout.zones.filter((zone) => zone.kind === "private").map((zone, index) => [zone.id, index]));
      for (const wall of roomLayout.walls) {
        const segments = roomWallSolidSegments(wall, roomLayout.doors);
        const owningZone = roomLayout.zones.find((zone) => wall.id.startsWith(`${zone.id}-wall-`));
        const privateRoomIndex = owningZone ? privateZoneIndices.get(owningZone.id) : undefined;
        const isPrivateWallAsset = owningZone?.kind === "private" && TEMPLATE_PRIVATE_WALL_ASSETS.some((asset) => asset === wall.asset);
        const privateAccentAsset = privateRoomIndex == null ? undefined : templatePrivateWallAsset(privateRoomIndex);
        const entranceWall = owningZone && roomLayout.doors.find((door) => door.id.startsWith(`${owningZone.id}-entrance-`))?.wallId;
        const entranceSide = entranceWall?.slice(entranceWall.lastIndexOf("-") + 1);
        const accentSide = entranceSide ? ({ n: "s", s: "n", e: "w", w: "e" } as const)[entranceSide as "n" | "s" | "e" | "w"] : undefined;
        const isAccentWall = Boolean(owningZone && wall.id === `${owningZone.id}-wall-${accentSide}`);
        const wallAsset = owningZone?.kind === "meeting"
          ? wall.asset
          : owningZone?.kind === "private" && isAccentWall
            ? (isPrivateWallAsset ? wall.asset : privateAccentAsset)
            : undefined;
        for (const segment of segments) {
          const segmentLength = segment.end - segment.start;
          const centerX = wall.x + (wall.axis === "horizontal" ? (segment.start + segment.end) / 2 : 0) + mapWorld.width / 2;
          const centerZ = wall.z + (wall.axis === "vertical" ? (segment.start + segment.end) / 2 : 0) + mapWorld.depth / 2;
          if (wallAsset) {
            const catalog = ROOM_PROP_CATALOG.find((item) => item.asset === wallAsset);
            if (!catalog) continue;
            // Private accent walls use their authored module size; tile them
            // along the span instead of stretching a 1–3 m model into an
            // oversized full-room panel.
            const moduleLength = owningZone?.kind === "private"
              ? Math.max(0.5, catalog.width * wall.height / Math.max(catalog.height, 0.01))
              : segmentLength;
            let tiledLength = 0;
            while (tiledLength < segmentLength - 0.001) {
              const fittedLength = Math.min(moduleLength, segmentLength - tiledLength);
              const offset = tiledLength + fittedLength / 2;
              const moduleCenterX = centerX + (wall.axis === "horizontal" ? offset - segmentLength / 2 : 0);
              const moduleCenterZ = centerZ + (wall.axis === "vertical" ? offset - segmentLength / 2 : 0);
              tiledLength += fittedLength;
              loadObjModel(wallAsset, (model) => {
              if (disposed) { disposeObjectResources(model); return; }
              fitWallAssetModel(model, { height: wall.height, length: fittedLength, wallAxis: catalog.wallAxis ?? "z", wallOrientation: wall.axis });
              // Keep the fit helper's local recentering and floor alignment.
              // Positioning the model directly here overwrote those offsets,
              // which made assets with non-centered origins drift into nearby rooms.
              const wallAnchor = new THREE.Group();
              wallAnchor.position.set(moduleCenterX, 0, moduleCenterZ);
              wallAnchor.userData.officeMapWallId = wall.id;
              model.userData.officeMapWallId = wall.id;
              model.traverse((child) => { if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; } });
              wallAnchor.add(model);
              campusMapProps.add(wallAnchor);
              cameraOcclusion.register(wallAnchor);
              furniturePieces.push(wallAnchor);
              }, (error) => console.warn(`Could not load wall model ${wallAsset}.`, error));
            }
          } else {
            const width = wall.axis === "horizontal" ? segmentLength : wall.thickness;
            const depth = wall.axis === "horizontal" ? wall.thickness : segmentLength;
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, wall.height, depth), new THREE.MeshStandardMaterial({ color: wall.color ?? "#63bbd0", roughness: 0.82 }));
            mesh.position.set(centerX, wall.height / 2, centerZ);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.officeMapWallId = wall.id;
            campusMapProps.add(mesh);
            cameraOcclusion.register(mesh);
          }
        }
      }
      for (const door of roomLayout.doors) {
        if (door.kind === "opening") continue;
        const wall = roomLayout.walls.find((candidate) => candidate.id === door.wallId);
        if (!wall) continue;
        const atX = wall.x + (wall.axis === "horizontal" ? door.offset : 0) + mapWorld.width / 2;
        const atZ = wall.z + (wall.axis === "vertical" ? door.offset : 0) + mapWorld.depth / 2;
        const doorZone = roomLayout.zones.find((zone) => door.id.startsWith(`${zone.id}-entrance-`));
        const inward = wall.axis === "horizontal" ? Math.sign((doorZone?.z ?? wall.z + 1) - wall.z) || 1 : Math.sign((doorZone?.x ?? wall.x + 1) - wall.x) || 1;
        const leaves = door.leaves ?? 1;
        const leafWidth = door.width / leaves;
        const hingeThickness = 0.075;
        const panelHeight = Math.min(wall.height - 0.15, 2.05);
        const doorAnimation: (typeof animatedDoors)[number] = { x: atX - mapWorld.width / 2, z: atZ - mapWorld.depth / 2, hinges: [], openUntil: 0 };
        for (let leaf = 0; leaf < leaves; leaf += 1) {
          // Each leaf has its own jamb pivot. Two leaf doors hinge at the outer
          // edges and swing independently toward the zone interior.
          const side = leaves === 1 ? -1 : (leaf === 0 ? -1 : 1);
          const hingeX = atX + (wall.axis === "horizontal" ? side * door.width / 2 : 0);
          const hingeZ = atZ + (wall.axis === "vertical" ? side * door.width / 2 : 0);
          const hinge = new THREE.Group();
          hinge.position.set(hingeX, 0, hingeZ);
          hinge.userData.officeMapDoorId = door.id;
          const panelWidth = Math.max(0.25, leafWidth - 0.025);
          const panel = new THREE.Mesh(
            wall.axis === "horizontal"
              ? new THREE.BoxGeometry(panelWidth, panelHeight, hingeThickness)
              : new THREE.BoxGeometry(hingeThickness, panelHeight, panelWidth),
            new THREE.MeshStandardMaterial({ color: "#98613f", roughness: 0.72 }),
          );
          const along = side < 0 ? 1 : -1;
          panel.position.set(
            wall.axis === "horizontal" ? along * leafWidth / 2 : inward * (wall.thickness / 2 + hingeThickness / 2),
            panelHeight / 2,
            wall.axis === "vertical" ? along * leafWidth / 2 : inward * (wall.thickness / 2 + hingeThickness / 2),
          );
          panel.castShadow = true;
          panel.receiveShadow = true;
          panel.userData.officeMapDoorId = door.id;
          hinge.add(panel);
          // A shallow inset gives the slab a recognizable front face while it swings.
          const inset = new THREE.Mesh(
            wall.axis === "horizontal"
              ? new THREE.BoxGeometry(Math.max(0.08, panelWidth - 0.18), Math.max(0.12, panelHeight - 0.28), 0.018)
              : new THREE.BoxGeometry(0.018, Math.max(0.12, panelHeight - 0.28), Math.max(0.08, panelWidth - 0.18)),
            new THREE.MeshStandardMaterial({ color: "#b98257", roughness: 0.78 }),
          );
          inset.position.copy(panel.position);
          inset.position.y += 0.01;
          inset.position.z += wall.axis === "horizontal" ? inward * (hingeThickness / 2 + 0.009) : 0;
          inset.position.x += wall.axis === "vertical" ? inward * (hingeThickness / 2 + 0.009) : 0;
          inset.castShadow = true;
          hinge.add(inset);
          const handle = new THREE.Mesh(
            new THREE.SphereGeometry(0.045, 8, 6),
            new THREE.MeshStandardMaterial({ color: "#ffb703", metalness: 0.35, roughness: 0.42 }),
          );
          handle.position.copy(panel.position);
          handle.position.y = panelHeight * 0.48;
          if (wall.axis === "horizontal") handle.position.x += along * (leafWidth / 2 - 0.16);
          else handle.position.z += along * (leafWidth / 2 - 0.16);
          handle.position.z += wall.axis === "horizontal" ? inward * (hingeThickness / 2 + 0.035) : 0;
          handle.position.x += wall.axis === "vertical" ? inward * (hingeThickness / 2 + 0.035) : 0;
          hinge.add(handle);
          const swing = THREE.MathUtils.degToRad(88) * (wall.axis === "horizontal" ? -inward : inward) * (side < 0 ? 1 : -1);
          doorAnimation.hinges.push({ group: hinge, openAngle: swing });
          campusMapProps.add(hinge);
          cameraOcclusion.register(hinge);
        }
        animatedDoors.push(doorAnimation);
        if (door.asset) {
          const catalog = ROOM_PROP_CATALOG.find((item) => item.asset === door.asset);
          if (catalog) loadObjModel(door.asset, (model) => {
            if (disposed) { disposeObjectResources(model); return; }
            normalizeProp(model, wall.height);
            model.scale.z *= door.width / Math.max(catalog.depth, 0.01);
            model.rotation.y = wall.axis === "horizontal" ? Math.PI / 2 : 0;
            model.position.set(atX, 0, atZ);
            model.userData.officeMapDoorId = door.id;
            model.traverse((child) => { if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; } });
            campusMapProps.add(model);
            cameraOcclusion.register(model);
            furniturePieces.push(model);
          }, (error) => console.warn(`Could not load doorway model ${door.asset}.`, error));
          continue;
        }
        const frameDepth = Math.max(0.12, wall.thickness * 1.5);
        const postHeight = Math.min(wall.height, 2.15);
        const postWidth = 0.1;
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(wall.axis === "horizontal" ? postWidth : frameDepth, postHeight, wall.axis === "vertical" ? postWidth : frameDepth), new THREE.MeshStandardMaterial({ color: "#fb8500", roughness: 0.7 }));
          post.position.set(atX + (wall.axis === "horizontal" ? side * door.width / 2 : 0), postHeight / 2, atZ + (wall.axis === "vertical" ? side * door.width / 2 : 0));
          post.castShadow = true;
          campusMapProps.add(post);
          cameraOcclusion.register(post);
        }
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(wall.axis === "horizontal" ? door.width + postWidth : frameDepth, 0.12, wall.axis === "vertical" ? door.width + postWidth : frameDepth), new THREE.MeshStandardMaterial({ color: "#fb8500", roughness: 0.7 }));
        lintel.position.set(atX, postHeight, atZ);
        lintel.castShadow = true;
        campusMapProps.add(lintel);
        cameraOcclusion.register(lintel);
      }
      for (const prop of roomLayout.props) {
        const catalog = ROOM_PROP_CATALOG.find((item) => item.asset === prop.asset);
        // Older saved maps may still contain individual road tiles. The
        // roadway network above is now the sole renderer for road surfaces;
        // drawing both causes coplanar z-fighting and striped intersections.
        if (roomLayout.roadways?.length && catalog?.group === "Roads · Tiles") continue;
        if (catalog) {
          // The saved collision shape is axis-aligned after rotating the prop.
          // Use that exact footprint for selection feedback so the orange frame
          // no longer turns with the mesh or disagrees with the green blocker.
          const collisionFootprint = roomPropCollisionFootprint(prop);
          const selection = new THREE.Group();
          selection.position.set(prop.x + mapWorld.width / 2, prop.elevation ?? 0, prop.z + mapWorld.depth / 2);
          selection.visible = false;
          selection.userData.officeMapPropId = prop.id;
          selection.userData.mapPropSelection = true;
          const selectedFootprint = new THREE.Mesh(
            new THREE.BoxGeometry(collisionFootprint.width, 0.035, collisionFootprint.depth),
            new THREE.MeshBasicMaterial({ color: "#ffb703", transparent: true, opacity: 0.22, depthWrite: false }),
          );
          selectedFootprint.position.y = 0.055;
          selectedFootprint.renderOrder = 5;
          const selectedBounds = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(collisionFootprint.width, Math.max(0.18, catalog.height), collisionFootprint.depth)),
            new THREE.LineBasicMaterial({ color: "#fb8500", depthTest: false }),
          );
          selectedBounds.position.y = Math.max(0.18, catalog.height) / 2;
          selectedBounds.renderOrder = 6;
          selection.add(selectedFootprint, selectedBounds);
          campusMapProps.add(selection);
          mapPropSelectionHighlights.set(prop.id, selection);
          // Give Move mode a generous, invisible hit target matching the
          // prop's actual footprint. Many models (chairs, screens, plants)
          // have sparse geometry, so raycasting only the visible mesh makes
          // it feel like the prop jumps or refuses to follow the cursor.
          const dragTarget = new THREE.Mesh(
            new THREE.BoxGeometry(collisionFootprint.width, Math.max(0.25, catalog.height), collisionFootprint.depth),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false }),
          );
          dragTarget.position.set(
            prop.x + mapWorld.width / 2,
            (prop.elevation ?? 0) + Math.max(0.25, catalog.height) / 2,
            prop.z + mapWorld.depth / 2,
          );
          dragTarget.userData.officeMapPropId = prop.id;
          dragTarget.userData.mapPropDragHitTarget = true;
          campusMapProps.add(dragTarget);
        }
        // Driveable props are rendered by the vehicle layer so they can be
        // hidden while occupied and reappear at their last parked position.
        if (!catalog?.vehicleId) loadObjModel(prop.asset, (object) => {
          if (disposed) { disposeObjectResources(object); return; }
          const catalog = ROOM_PROP_CATALOG.find((item) => item.asset === prop.asset);
          if (!catalog) { disposeObjectResources(object); return; }
          normalizeProp(object, catalog.height);
          renderedPropScales.set(prop.id, fitPropToFootprint(object, prop.width, prop.depth));
          // Keep the asset's centering offset local to a pivot at the saved prop
          // position. Applying rotation to the same object that carries the
          // offset rotates around its shifted origin and makes chairs/sofas
          // drift away from their collision footprint when rotated.
          const propPivot = new THREE.Group();
          propPivot.position.set(prop.x + mapWorld.width / 2, prop.elevation ?? 0, prop.z + mapWorld.depth / 2);
          propPivot.rotation.y = prop.rotation;
          propPivot.userData.roomPropId = prop.id;
          propPivot.userData.officeMapPropId = prop.id;
          propPivot.userData.collision = prop.collision;
          object.userData.roomPropId = prop.id;
          object.userData.officeMapPropId = prop.id;
          object.userData.collision = prop.collision;
          propPivot.add(object);
          campusMapProps.add(propPivot);
          if (prop.collision) cameraOcclusion.register(propPivot);
          furniturePieces.push(propPivot);
        }, (error) => console.warn(`Could not load room prop ${prop.asset}.`, error));
        if (prop.collision && !prop.elevation) {
          // Keep the in-world proxy identical to the server's axis-aligned blocker.
          const { width: blockerWidth, depth: blockerDepth } = roomPropCollisionFootprint(prop);
          const proxy = new THREE.Mesh(
            new THREE.BoxGeometry(blockerWidth, 0.018, blockerDepth),
            new THREE.MeshBasicMaterial({ color: "#42d982", transparent: true, opacity: 0.16, depthWrite: false }),
          );
          proxy.position.set(prop.x + mapWorld.width / 2, (prop.elevation ?? 0) + 0.025, prop.z + mapWorld.depth / 2);
          proxy.userData.roomPropId = prop.id;
          proxy.userData.officeMapPropId = prop.id;
          proxy.userData.mapCollisionOverlay = true;
          proxy.userData.collision = true;
          campusMapProps.add(proxy);
          mapCollisionOverlays.push(proxy);
          // The movement solver keeps the player's center one radius outside
          // the blocker. Show that clearance too, so the empty strip where a
          // player stops is visible while editing props.
          const clearance = roomPropCollisionClearanceRadius(prop, CAMPUS_WORLD.playerRadius);
          const clearanceOutline = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(blockerWidth + clearance * 2, 0.02, blockerDepth + clearance * 2)),
            new THREE.LineBasicMaterial({ color: "#ef476f", depthTest: false, transparent: true, opacity: 0.86 }),
          );
          clearanceOutline.position.set(prop.x + mapWorld.width / 2, (prop.elevation ?? 0) + 0.018, prop.z + mapWorld.depth / 2);
          clearanceOutline.userData.officeMapPropId = prop.id;
          clearanceOutline.userData.mapCollisionOverlay = true;
          campusMapProps.add(clearanceOutline);
          mapCollisionOverlays.push(clearanceOutline);
          const outline = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(blockerWidth, 0.02, blockerDepth)),
            new THREE.LineBasicMaterial({ color: "#26b866" }),
          );
          outline.position.set(prop.x + mapWorld.width / 2, (prop.elevation ?? 0) + 0.04, prop.z + mapWorld.depth / 2);
          outline.userData.officeMapPropId = prop.id;
          outline.userData.mapCollisionOverlay = true;
          campusMapProps.add(outline);
          mapCollisionOverlays.push(outline);
        }
      }
    }

    const meetingRug = new THREE.Mesh(
      new THREE.CircleGeometry(CAMPUS_WORLD.meetingZone.radius, 48),
      new THREE.MeshStandardMaterial({ color: "#c3d8cb", roughness: 1, transparent: true, opacity: 0.24 }),
    );
    meetingRug.rotation.x = -Math.PI / 2;
    meetingRug.position.set(CAMPUS_WORLD.meetingZone.x + mapWorld.width / 2, 0.025, CAMPUS_WORLD.meetingZone.z + mapWorld.depth / 2);
    campusRoot.add(meetingRug);

    const avatarColors = [0x668c7a, 0x7291bd, 0xd18c6b, 0x9a81b3, 0xd1ae63, 0x6fa9a0, 0xb97691];
    const roomPortalMeshes = new Map<string, { root: THREE.Group; label: THREE.Sprite; signature: string }>();
    const avatars = new Map<string, THREE.Group>();
    const avatarStatusBadges = new Map<string, THREE.Sprite>();
    const avatarSpeakingBubbles = new Map<string, THREE.Sprite>();
    const localFireRaycaster = new THREE.Raycaster();
    fireFirstPerson = () => {
      if (!firstPersonViewRef.current || !campusOverviewRef.current || mapEditModeRef.current || buildModeRef.current) return;
      const now = performance.now();
      // Visual-only firing is deliberately rate limited so rapid clicks do
      // not create an unbounded number of transient effects/audio nodes.
      if (now - lastFirstPersonShotAt < 240) return;
      lastFirstPersonShotAt = now;
      weaponRecoilUntil = now + 110;
      muzzleFlashUntil = now + 65;
      gunMuzzleFlash.visible = true;

      // Update the camera orientation from the live mouse-look values first.
      // A pointer event can arrive between render frames, so relying on the
      // previous matrixWorld can make shots drift away from the reticle.
      const aimYaw = cameraYawRef.current;
      const aimPitch = firstPersonPitch;
      const aimForward = new THREE.Vector3(
        -Math.sin(aimYaw) * Math.cos(aimPitch),
        Math.sin(aimPitch),
        -Math.cos(aimYaw) * Math.cos(aimPitch),
      ).normalize();
      const muzzle = new THREE.Vector3();
      camera.lookAt(camera.position.clone().add(aimForward));
      camera.updateMatrixWorld(true);
      gunMuzzleFlash.getWorldPosition(muzzle);
      // Aim from the screen center, where the reticle is. Starting the query
      // at the offset muzzle causes parallax, especially for nearby floor hits.
      // Avatar nameplates and other billboard sprites live under the campus
      // scene. Raycaster requires the active camera when a recursive query
      // reaches a Sprite; without it Three.js throws before the tracer is
      // created, making every shot appear to vanish in the browser.
      localFireRaycaster.camera = camera;
      localFireRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const aimOrigin = localFireRaycaster.ray.origin.clone();
      const direction = localFireRaycaster.ray.direction.clone().normalize();
      localFireRaycaster.near = 0.05;
      localFireRaycaster.far = 10;
      const localId = localSessionIdRef.current;
      const targets = [...avatars.entries()].filter(([id]) => id !== localId).map(([, avatar]) => avatar);
      const hits = localFireRaycaster.intersectObjects([campusRoot, ...targets], true);
      const hit = hits.find((entry) => {
        if (entry.distance < localFireRaycaster.near || entry.distance > localFireRaycaster.far) return false;
        // A small downward aim should not make the laser terminate on the
        // office floor. Invisible editor overlays are also excluded because
        // Three.js raycasting still visits their children recursively.
        let ancestor: THREE.Object3D | null = entry.object;
        while (ancestor && ancestor !== campusRoot) {
          if (!ancestor.visible) return false;
          if (ancestor.userData.blasterSurface === "floor") return false;
          ancestor = ancestor.parent;
        }
        return true;
      });
      const aimedPoint = hit?.point.clone() ?? aimOrigin.clone().addScaledVector(direction, localFireRaycaster.far);
      // Tracers and server validation are measured from the muzzle and capped
      // below the 10-unit server maximum. A distant camera-ray hit is capped,
      // and must not count as a player hit if the visible trace stops short.
      const muzzleToAim = aimedPoint.clone().sub(muzzle);
      const exceedsMuzzleRange = muzzleToAim.length() > 9.95;
      const impact = exceedsMuzzleRange
        ? muzzle.clone().add(muzzleToAim.normalize().multiplyScalar(9.95))
        : aimedPoint;
      let hitSessionId: string | undefined;
      if (hit && !exceedsMuzzleRange) {
        for (const [sessionId, avatar] of avatars) {
          if (sessionId === localId) continue;
          let ancestor: THREE.Object3D | null = hit.object;
          while (ancestor && ancestor !== avatar) ancestor = ancestor.parent;
          if (ancestor === avatar) { hitSessionId = sessionId; break; }
        }
      }
      const effect = hit ? new THREE.Group() : null;
      if (effect && hit) {
        const splatColors = [0xfb8500, 0x219ebc, 0xffb703, 0x8ecae6];
        const splatColor = splatColors[Math.floor(Math.random() * splatColors.length)];
        if (hit.face) {
          const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
          effect.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
          effect.position.copy(impact).addScaledVector(normal, 0.012);
        } else {
          effect.quaternion.copy(camera.quaternion);
          effect.position.copy(impact);
        }
        const splatMaterial = new THREE.MeshBasicMaterial({ color: splatColor, transparent: true, opacity: 0.9, depthWrite: false });
        effect.add(new THREE.Mesh(new THREE.CircleGeometry(0.11, 12), splatMaterial));
        for (let i = 0; i < 7; i += 1) {
          const angle = Math.PI * 2 * i / 7;
          const dot = new THREE.Mesh(new THREE.CircleGeometry(0.045 + Math.random() * 0.025, 7), splatMaterial);
          dot.position.set(Math.cos(angle) * (0.12 + Math.random() * 0.08), Math.sin(angle) * (0.12 + Math.random() * 0.08), 0.006);
          effect.add(dot);
        }
        const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2ad, transparent: true, opacity: 0.95, depthWrite: false });
        for (let i = 0; i < 4; i += 1) {
          const spark = new THREE.Mesh(new THREE.TetrahedronGeometry(0.055, 0), sparkMaterial);
          const angle = Math.PI * 2 * (i + 0.5) / 4;
          spark.position.set(Math.cos(angle) * 0.28, Math.sin(angle) * 0.28, 0.01);
          effect.add(spark);
        }
      }
      buildCallbacksRef.current.onBlasterShot?.({
        start: { x: muzzle.x, y: muzzle.y, z: muzzle.z },
        end: { x: impact.x, y: impact.y, z: impact.z },
        ...(hitSessionId ? { targetSessionId: hitSessionId } : {}),
      });
      const beam = makeLaserBeam(muzzle, impact);
      scene.add(beam);
      if (effect) {
        scene.add(effect);
        firstPersonEffects.push({ group: effect, beam, createdAt: now, duration: 700 });
      } else {
        firstPersonEffects.push({ group: beam, createdAt: now, duration: 500, beamOnly: true });
      }
      playBlasterShotSound();
    };
    const avatarCharacterIds = new Map<string, CharacterModelId>();
    const avatarAnimations = new Map<string, AvatarAnimationState>();
    let avatarLoadFailureLogged = false;
    const characterModels = new Map<CharacterModelId, Promise<LoadedCharacterAsset>>();
    const petModels = new Map<string, Promise<GLTF>>();
    const vehicleModels = new Map<string, Promise<GLTF>>();
    const petGroups = new Map<string, THREE.Group>();
    const petIds = new Map<string, string>();
    const petSides = new Map<string, number>();
    const petMixers = new Map<string, { mixer: THREE.AnimationMixer; idle?: THREE.AnimationAction; walk?: THREE.AnimationAction; current?: THREE.AnimationAction }>();
    const petPositions = new Map<string, THREE.Vector3>();
    const vehicleGroups = new Map<string, THREE.Group>();
    const vehicleIds = new Map<string, string>();
    const vehiclePositions = new Map<string, THREE.Vector3>();
    const parkedVehicleGroups = new Map<string, THREE.Group>();
    const loadKenneyModel = (cache: Map<string, Promise<GLTF>>, id: string, path: string) => {
      let model = cache.get(id);
      if (!model) {
        model = loadGltfAsset(path);
        cache.set(id, model);
        void model.catch(() => undefined);
      }
      return model;
    };
    const getPetModel = (petId: string) => loadKenneyModel(petModels, petId, `/assets/kenney/cube-pets/Models/${petId}.glb`);
    const getVehicleModel = (vehicleId: string) => {
      const models: Record<string, string> = {
        "vehicle-speedster": "/assets/kenney/toy-car-kit/Models/GLB format/vehicle-speedster.glb",
        "vehicle-racer": "/assets/kenney/toy-car-kit/Models/GLB format/vehicle-racer.glb",
        "vehicle-suv": "/assets/kenney/toy-car-kit/Models/GLB format/vehicle-suv.glb",
        "vehicle-monster-truck": "/assets/kenney/toy-car-kit/Models/GLB format/vehicle-monster-truck.glb",
        "vehicle-truck": "/assets/kenney/toy-car-kit/Models/GLB format/vehicle-truck.glb",
        "car-sedan": "/assets/kenney/car-kit/Models/GLB format/sedan.glb",
        "car-hatchback-sports": "/assets/kenney/car-kit/Models/GLB format/hatchback-sports.glb",
        "car-taxi": "/assets/kenney/car-kit/Models/GLB format/taxi.glb",
        "car-kart-oopi": "/assets/kenney/toy-car-kit/Models/GLB format/vehicle-racer-low.glb",
      };
      return loadKenneyModel(vehicleModels, vehicleId, models[vehicleId] ?? models["car-sedan"]!);
    };
    const getCharacterModel = (characterId: CharacterModelId) => {
      let model = characterModels.get(characterId);
      if (!model) {
        const endpoint = import.meta.env.VITE_REALTIME_URL ?? (import.meta.env.PROD ? window.location.origin : "http://localhost:2567");
        model = loadCharacterAsset(characterId, endpoint);
        characterModels.set(characterId, model);
        void model.catch(() => undefined);
      }
      return model;
    };
    const fallbackParts = new Map<string, {
      body: THREE.Mesh;
      head: THREE.Group;
      leftLeg: THREE.Mesh;
      rightLeg: THREE.Mesh;
      leftArm: THREE.Mesh;
      rightArm: THREE.Mesh;
    }>();
    const positions = new Map<string, THREE.Vector3>();
    let animationFrame = 0;
    let previousFrame = performance.now();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motionScale = reduceMotion ? 0 : 1;
    let previousCameraPose: CameraPose | null = null;
    let previousCameraMode = cameraStateRef.current.mode;
    let previousCameraWorldKey = previousWorldKeyRef.current;
    let campusFitDistanceM = 0;
    const cameraPanTarget = cameraPanTargetRef.current ?? new THREE.Vector3(activeFloor.width / 2, 0, activeFloor.depth / 2);
    cameraPanTargetRef.current = cameraPanTarget;
    const currentLookTarget = cameraPanTarget.clone();
    cameraLookTargetRef.current = currentLookTarget;
    let cameraDrag: { pointerId: number; mode: "pan" | "rotate"; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
    let suppressNextContextMenu = false;
    let deskZonePress: { pointerId: number; zoneId: string | null } | null = null;
    // A slight upward neutral pitch keeps the center reticle at the horizon
    // on the default office spawn instead of pointing into the near floor.
    let firstPersonPitch = THREE.MathUtils.degToRad(FPP_INITIAL_PITCH_DEG);
    const lookFirstPerson = (deltaXPixel: number, deltaYPixel: number, sensitivityRadPerPixel: number) => {
      const aim = rotateFirstPersonAim(cameraYawRef.current, firstPersonPitch, deltaXPixel, deltaYPixel, sensitivityRadPerPixel);
      cameraYawRef.current = aim.yawRad;
      firstPersonPitch = aim.pitchRad;
    };
    let lastMapEditMode = false;
    const mapEditMovementKeys = new Set<string>();
    const mapEditMovementCodes = new Set<string>(CAMERA_MOVEMENT_KEY_CODES);
    const getOfficePropIdAt = (clientX: number, clientY: number) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      mapPointerNdc.set((clientX - bounds.left) / bounds.width * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
      mapRaycaster.setFromCamera(mapPointerNdc, camera);
      const hit = mapRaycaster.intersectObjects(campusMapProps.children, true).find((entry) => {
        let node: THREE.Object3D | null = entry.object;
        let hasPropId = false;
        while (node && node !== campusMapProps) {
          if (node.userData.mapPropDragHitTarget) return true;
          if (node.userData.mapCollisionOverlay || node.userData.mapPropSelection) return false;
          if (typeof node.userData.officeMapPropId === "string") hasPropId = true;
          node = node.parent;
        }
        return hasPropId;
      });
      let node: THREE.Object3D | null = hit?.object ?? null;
      while (node && node !== campusMapProps && typeof node.userData.officeMapPropId !== "string") node = node.parent;
      return node && node !== campusMapProps ? String(node.userData.officeMapPropId) : null;
    };
    const getOfficePropActionPosition = (id: string, fallbackX: number, fallbackY: number) => {
      const propObject = campusMapProps.children.find((child) => child.userData.officeMapPropId === id);
      if (!propObject) return { x: Math.min(fallbackX + 12, window.innerWidth - 174), y: Math.min(fallbackY + 12, window.innerHeight - 142) };
      const prop = roomLayout?.props.find((item) => item.id === id);
      const definition = prop && ROOM_PROP_CATALOG.find((item) => item.asset === prop.asset);
      const anchor = propObject.getWorldPosition(new THREE.Vector3());
      anchor.y += (definition?.height ?? 0.5) + 0.18;
      anchor.project(camera);
      const bounds = renderer.domElement.getBoundingClientRect();
      const x = bounds.left + (anchor.x + 1) * bounds.width / 2;
      const y = bounds.top + (1 - anchor.y) * bounds.height / 2;
      return { x: Math.min(Math.max(8, x + 12), window.innerWidth - 174), y: Math.min(Math.max(8, y), window.innerHeight - 142) };
    };
    const beginMapPropDrag = (id: string, pointerId: number, point: { x: number; z: number }, prop: RoomLayoutProp) => {
      const center = { x: prop.x + mapWorld.width / 2, z: prop.z + mapWorld.depth / 2 };
      const preview = new THREE.Group();
      preview.name = `Drag preview ${id}`;
      const hiddenVisuals: Array<{ object: THREE.Object3D; visible: boolean }> = [];
      const visualRoots = campusMapProps.children.filter((object) =>
        object.userData.officeMapPropId === id &&
        !object.userData.mapCollisionOverlay &&
        !object.userData.mapPropSelection &&
        !object.userData.mapPropDragHitTarget,
      );
      const parkedVehicle = parkedVehicleGroups.get(id);
      if (parkedVehicle && !visualRoots.includes(parkedVehicle)) visualRoots.push(parkedVehicle);
      for (const object of visualRoots) {
        hiddenVisuals.push({ object, visible: object.visible });
        object.visible = false;
        const clone = SkeletonUtils.clone(object) as THREE.Object3D;
        clone.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = Array.isArray(child.material) ? child.material.map((material) => material.clone()) : child.material.clone();
          }
        });
        preview.add(clone);
      }
      scene.add(preview);
      draggingMapProp = {
        id,
        pointerId,
        last: point,
        startPointer: point,
        offset: { x: center.x - point.x, z: center.z - point.z },
        center,
        moved: false,
        elevation: prop.elevation ?? 0,
        preview,
        hiddenVisuals,
      };
    };
    const endMapPropDrag = (drag: NonNullable<typeof draggingMapProp>) => {
      scene.remove(drag.preview);
      drag.preview.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
        }
      });
      for (const entry of drag.hiddenVisuals) entry.object.visible = entry.visible;
    };
    const onCanvasContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (suppressNextContextMenu) { suppressNextContextMenu = false; return; }
      if (!buildModeRef.current || !campusOverviewRef.current) { setPropActionMenu(null); return; }
      const propId = getOfficePropIdAt(event.clientX, event.clientY);
      if (!propId) { setPropActionMenu(null); return; }
      buildCallbacksRef.current.onSelectMapItem?.(propId);
      setPropActionMenu({ id: propId, ...getOfficePropActionPosition(propId, event.clientX, event.clientY) });
    };
    const onDoubleClick = (event: MouseEvent) => {
      // In first person, the left mouse button is reserved for firing. Never
      // interpret a double click as an auto-move request in this camera mode.
      if (appPaused || !campusOverviewRef.current || firstPersonViewRef.current || buildModeRef.current || mapEditModeRef.current) return;
      const point = mapPositionFromPointer(event);
      if (!point) return;
      event.preventDefault();
      cameraDrag = null;
      renderer.domElement.style.cursor = "grab";
      // Double-click travel automatically selects a random car, then routes
      // around the same server-authoritative collision map used by movement.
      buildCallbacksRef.current.onAutoMove?.({ x: point.x - mapWorld.width / 2, z: point.z - mapWorld.depth / 2 }, true);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (appPaused && event.button !== 2) { event.preventDefault(); return; }
      primeBlasterAudio();
      if (event.button === 0 && campusOverviewRef.current && firstPersonViewRef.current && !mapEditModeRef.current && !buildModeRef.current) {
        event.preventDefault();
        if (weaponInventoryOpenRef.current) return;
        // Pointer lock gives the first-person camera continuous mouse look.
        // The click still fires immediately; browsers may grant pointer lock
        // only after this user gesture.
        if (document.pointerLockElement !== renderer.domElement) {
          try {
            const lockRequest = renderer.domElement.requestPointerLock();
            if (lockRequest && typeof lockRequest.catch === "function") void lockRequest.catch(() => undefined);
          } catch { /* Pointer lock can be unavailable in embedded browsers. */ }
        }
        fireFirstPerson();
        return;
      }
      if (event.button === 0 && mapEditModeRef.current && spawnPlacementModeRef.current) {
        const point = mapPositionFromPointer(event);
        if (!point) return;
        buildCallbacksRef.current.onMoveSpawnPoint?.({
          x: Math.round(point.x - mapWorld.width / 2),
          z: Math.round(point.z - mapWorld.depth / 2),
        });
        event.preventDefault();
        renderer.domElement.style.cursor = "crosshair";
        return;
      }
      if (event.button === 0 && mapEditModeRef.current && zoneDrawingRef.current) {
        const point = zonePositionFromPointer(event);
        if (!point) return;
        const start = { x: Math.round(point.x), z: Math.round(point.z) };
        zoneAreaDrag = { pointerId: event.pointerId, start };
        zoneDraftPreview.visible = true;
        zoneDraftPreview.position.set(start.x, 0.045, start.z);
        zoneDraftPreview.scale.set(0.01, 0.01, 1);
        renderer.domElement.setPointerCapture(event.pointerId);
        renderer.domElement.style.cursor = "crosshair";
        event.preventDefault();
        return;
      }
      if (event.button === 0 && buildModeRef.current && campusOverviewRef.current) {
        setPropActionMenu(null);
        const armedMoveId = movePropArmedIdRef.current;
        if (armedMoveId) {
          const point = mapPositionFromPointer(event);
          const selectedProp = roomLayout?.props.find((item) => item.id === armedMoveId);
          if (point && selectedProp) {
            // Hide the placed model and show a dedicated preview attached to
            // the pointer. This keeps the held prop from appearing frozen at
            // its saved position while it is being moved.
            beginMapPropDrag(armedMoveId, event.pointerId, point, selectedProp);
            movePropArmedIdRef.current = null;
            setMovePropArmedId(null);
            renderer.domElement.setPointerCapture(event.pointerId);
            renderer.domElement.style.cursor = "grabbing";
            event.preventDefault();
            return;
          }
        }
        const asset = selectedAssetRef.current;
        const definition = asset ? ROOM_PROP_CATALOG.find((item) => item.asset === asset) : undefined;
        const point = definition ? placementPositionFromPointer(event, definition) : mapPositionFromPointer(event);
        if (!point) return;
        if (asset) {
          const snapped = snapCampusPropPoint(point, definition?.width ?? 1, definition?.depth ?? 1, 0, mapWorld);
          placementGhostPosition = snapped;
          placementGhostElevation = definition ? roomPropPlacementSupport(roomLayout?.props ?? [], definition.asset, snapped.x - mapWorld.width / 2, snapped.z - mapWorld.depth / 2)?.elevation ?? 0 : 0;
          hasPlacementPointer = true;
          buildCallbacksRef.current.onPlaceProp?.(asset as RoomLayoutProp["asset"], { x: snapped.x - mapWorld.width / 2, z: snapped.z - mapWorld.depth / 2, elevation: placementGhostElevation });
          // Keep floor and road tiles armed so a user can lay a continuous
          // surface by clicking multiple cells without reopening the catalog.
          const repeatPlacement = definition?.group === "Floor tiles" || definition?.group === "Roads · Tiles" || definition?.group === "Roads · Paths";
          if (!repeatPlacement) buildCallbacksRef.current.onPlacementComplete?.();
          event.preventDefault();
          return;
        }
        const propId = getOfficePropIdAt(event.clientX, event.clientY);
        buildCallbacksRef.current.onSelectMapItem?.(propId);
        if (propId) {
          setPropActionMenu({ id: propId, ...getOfficePropActionPosition(propId, event.clientX, event.clientY) });
        }
        if (propId && movePropArmedIdRef.current === propId) {
          const selectedProp = roomLayout?.props.find((item) => item.id === propId);
          if (selectedProp) beginMapPropDrag(propId, event.pointerId, point, selectedProp);
          movePropArmedIdRef.current = null;
          setMovePropArmedId(null);
          renderer.domElement.setPointerCapture(event.pointerId);
          renderer.domElement.style.cursor = "grabbing";
          event.preventDefault();
        } else if (propId) {
          renderer.domElement.style.cursor = "pointer";
        } else {
          // Empty space remains available for moving the map camera in editor mode.
          if (cameraStateRef.current.following) cameraPanTarget.copy(currentLookTarget);
          dispatchCamera({ type: "manual-drag" });
          cameraDrag = { pointerId: event.pointerId, mode: "pan", x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
          renderer.domElement.setPointerCapture(event.pointerId);
          renderer.domElement.style.cursor = "grabbing";
        }
        return;
      }
      if (event.button === 0 && campusOverviewRef.current && !buildModeRef.current) {
        const point = mapPositionFromPointer(event);
        const mapX = point ? point.x - mapWorld.width / 2 : Number.NaN;
        const mapZ = point ? point.z - mapWorld.depth / 2 : Number.NaN;
        const deskZone = roomLayout?.zones
          .filter((zone) => (mapEditModeRef.current || zone.kind === "private") && Math.abs(mapX - zone.x) <= zone.width / 2 && Math.abs(mapZ - zone.z) <= zone.depth / 2)
          .sort((first, second) => first.width * first.depth - second.width * second.depth)[0];
        // Save the potential zone click, but allow the same pointer gesture to
        // start a camera pan. Only a stationary pointer-up selects the zone.
        deskZonePress = { pointerId: event.pointerId, zoneId: deskZone?.id ?? null };
      }
      if (event.button === 0 && !buildModeRef.current) {
        cameraDrag = { pointerId: event.pointerId, mode: "pan", x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
      } else if (event.button === 2) {
        event.preventDefault();
        // A right-button drag is always a camera gesture. It must never inherit
        // an object drag left active by another pointer/button sequence.
        if (draggingMapProp) endMapPropDrag(draggingMapProp);
        draggingMapProp = null;
        // An orbit releases only the behind-character heading after the
        // pointer actually moves. A right click alone keeps the camera lock.
        if (mapEditModeRef.current) {
          if (cameraStateRef.current.following) cameraPanTarget.copy(currentLookTarget);
          dispatchCamera({ type: "manual-drag" });
        }
        // Right-drag orbits in the normal view and Modify props; map editing
        // keeps its established right-drag pan behavior.
        cameraDrag = { pointerId: event.pointerId, mode: mapEditModeRef.current ? "pan" : "rotate", x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
      }
      if (cameraDrag) {
        renderer.domElement.setPointerCapture(event.pointerId);
        renderer.domElement.style.cursor = "grabbing";
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (campusOverviewRef.current && !firstPersonViewRef.current && !mapEditModeRef.current && !buildModeRef.current && roomLayout) {
        const point = mapPositionFromPointer(event);
        const x = point ? point.x - mapWorld.width / 2 : Number.NaN;
        const z = point ? point.z - mapWorld.depth / 2 : Number.NaN;
        hoveredClaimZoneId = roomLayout.zones
          .filter((zone) => zone.kind === "private" && !zone.ownerUsername && Math.abs(x - zone.x) <= zone.width / 2 && Math.abs(z - zone.z) <= zone.depth / 2)
          .sort((a, b) => a.width * a.depth - b.width * b.depth)[0]?.id ?? null;
      } else {
        hoveredClaimZoneId = null;
      }
      if (buildModeRef.current && campusOverviewRef.current && selectedAssetRef.current && !draggingMapProp) {
        const definition = ROOM_PROP_CATALOG.find((item) => item.asset === selectedAssetRef.current);
        const point = definition ? placementPositionFromPointer(event, definition) : mapPositionFromPointer(event);
        if (point && definition) {
          placementGhostPosition = snapCampusPropPoint(point, definition.width, definition.depth, 0, mapWorld);
          placementGhostElevation = roomPropPlacementSupport(roomLayout?.props ?? [], definition.asset, placementGhostPosition.x - mapWorld.width / 2, placementGhostPosition.z - mapWorld.depth / 2)?.elevation ?? 0;
          hasPlacementPointer = true;
        }
        if (!cameraDrag) return;
      }
      if (campusOverviewRef.current && firstPersonViewRef.current && document.pointerLockElement === renderer.domElement && !weaponInventoryOpenRef.current) {
        lookFirstPerson(event.movementX, event.movementY, FPP_POINTER_SENSITIVITY_RAD_PER_PIXEL);
        return;
      }
      if (zoneAreaDrag?.pointerId === event.pointerId) {
        const point = zonePositionFromPointer(event);
        if (!point) return;
        const end = { x: Math.round(point.x), z: Math.round(point.z) };
        const left = Math.min(zoneAreaDrag.start.x, end.x);
        const top = Math.min(zoneAreaDrag.start.z, end.z);
        zoneDraftPreview.position.set(left + Math.abs(end.x - zoneAreaDrag.start.x) / 2, 0.045, top + Math.abs(end.z - zoneAreaDrag.start.z) / 2);
        zoneDraftPreview.scale.set(Math.max(1, Math.abs(end.x - zoneAreaDrag.start.x)), Math.max(1, Math.abs(end.z - zoneAreaDrag.start.z)), 1);
        return;
      }
      if (draggingMapProp?.pointerId === event.pointerId && buildModeRef.current) {
        const rawPoint = mapPositionFromPointer(event);
        if (!rawPoint) return;
        const prop = roomLayout?.props.find((item) => item.id === draggingMapProp!.id);
        const point = prop
          ? snapCampusPropPoint({ x: rawPoint.x + draggingMapProp.offset.x, z: rawPoint.z + draggingMapProp.offset.z }, prop.width, prop.depth, prop.rotation, mapWorld)
          : draggingMapProp.center;
        const dx = point.x - draggingMapProp.center.x;
        const dz = point.z - draggingMapProp.center.z;
        if (Math.hypot(rawPoint.x - draggingMapProp.startPointer.x, rawPoint.z - draggingMapProp.startPointer.z) > 0.08) draggingMapProp.moved = true;
        draggingMapProp.preview.position.x += dx;
        draggingMapProp.preview.position.z += dz;
        for (const child of campusMapProps.children) {
          if (child.userData.officeMapPropId === draggingMapProp.id) { child.position.x += dx; child.position.z += dz; }
        }
        const draggedVehicle = parkedVehicleGroups.get(draggingMapProp.id);
        if (draggedVehicle) {
          draggedVehicle.position.x = point.x;
          draggedVehicle.position.z = point.z;
        }
        if (prop) {
          const elevation = roomPropPlacementSupport(roomLayout?.props.filter((item) => item.id !== prop.id) ?? [], prop.asset, point.x - mapWorld.width / 2, point.z - mapWorld.depth / 2, prop.rotation)?.elevation ?? 0;
          const elevationDelta = elevation - draggingMapProp!.elevation;
          if (elevationDelta) for (const child of campusMapProps.children) if (child.userData.officeMapPropId === draggingMapProp!.id) child.position.y += elevationDelta;
          draggingMapProp!.elevation = elevation;
        }
        draggingMapProp.center = point;
        draggingMapProp.last = rawPoint;
        return;
      }
      if (event.pointerId !== cameraDrag?.pointerId) return;
      const deltaX = event.clientX - cameraDrag.x;
      const deltaY = event.clientY - cameraDrag.y;
      cameraDrag.x = event.clientX;
      cameraDrag.y = event.clientY;
      if (!cameraDrag.moved && Math.hypot(event.clientX - cameraDrag.startX, event.clientY - cameraDrag.startY) >= 4) {
        cameraDrag.moved = true;
        if (cameraDrag.mode === "rotate") dispatchCamera({ type: "manual-rotate" });
        else if (!mapEditModeRef.current && !buildModeRef.current) {
          if (cameraStateRef.current.following) cameraPanTarget.copy(currentLookTarget);
          dispatchCamera({ type: "manual-drag" });
        }
      }
      if (!cameraDrag.moved) return;
      if (cameraDrag.mode === "rotate") {
        if (firstPersonViewRef.current) {
          lookFirstPerson(deltaX, deltaY, CAMERA.dragSensitivity);
        } else {
          cameraYawRef.current -= deltaX * CAMERA.dragSensitivity;
          dispatchCamera({ type: "elevation", radians: cameraStateRef.current.elevationRad + deltaY * CAMERA.dragSensitivity });
        }
      } else {
        const distance = campusFitDistanceM * cameraStateRef.current.zoomRatio;
        cameraPanTarget.copy(panCameraTarget({
          target: cameraPanTarget, yawRad: cameraYawRef.current, distanceM: distance,
          fovDeg: camera.fov, viewportHeightPixel: renderer.domElement.clientHeight,
          deltaXPixel: deltaX, deltaYPixel: deltaY,
        }));
      }
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Some mice/trackpads emit wheel input during a right-button orbit
      // gesture. Keep that gesture dedicated to rotation instead of changing
      // the camera distance underneath it.
      if (cameraDrag?.mode === "rotate" || (event.buttons & 2) !== 0) return;
      dispatchCamera(cameraWheelEvent(cameraStateRef.current, event.deltaY, tppTransitionDistanceMRef.current));
      if (cameraStateRef.current.mode === "tpp" || cameraStateRef.current.mode === "free" && !cameraStateRef.current.editing) setActiveFloatingGroup("zoom");
    };
    const stopRotating = (event: PointerEvent) => {
      if (zoneAreaDrag?.pointerId === event.pointerId) {
        const point = zonePositionFromPointer(event);
        const end = point ? { x: Math.round(point.x), z: Math.round(point.z) } : zoneAreaDrag.start;
        const start = zoneAreaDrag.start;
        zoneAreaDrag = null;
        zoneDraftPreview.visible = false;
        renderer.domElement.style.cursor = "crosshair";
        buildCallbacksRef.current.onZoneAreaDrawn?.({
          x: (Math.min(start.x, end.x) + Math.abs(end.x - start.x) / 2) - mapWorld.width / 2,
          z: (Math.min(start.z, end.z) + Math.abs(end.z - start.z) / 2) - mapWorld.depth / 2,
          width: Math.max(1, Math.abs(end.x - start.x)),
          depth: Math.max(1, Math.abs(end.z - start.z)),
        });
        return;
      }
      if (draggingMapProp?.pointerId === event.pointerId) {
        const finishedDrag = draggingMapProp;
        const movedPropId = finishedDrag.id;
        if (finishedDrag.moved) {
          const prop = roomLayout?.props.find((item) => item.id === finishedDrag.id);
          const position = {
            x: finishedDrag.center.x - mapWorld.width / 2,
            z: finishedDrag.center.z - mapWorld.depth / 2,
          };
          buildCallbacksRef.current.onMoveProp?.(finishedDrag.id, { ...position, elevation: finishedDrag.elevation });
        }
        endMapPropDrag(finishedDrag);
        draggingMapProp = null;
        setMovePropArmedId(null);
        setPropActionMenu({ id: movedPropId, ...getOfficePropActionPosition(movedPropId, event.clientX, event.clientY) });
        renderer.domElement.style.cursor = buildModeRef.current ? "crosshair" : "grab";
        return;
      }
      if (event.pointerId !== cameraDrag?.pointerId) return;
      if (event.button === 2 && cameraDrag.moved) suppressNextContextMenu = true;
      if (!cameraDrag.moved && campusOverviewRef.current && !firstPersonViewRef.current && !mapEditModeRef.current && !buildModeRef.current) {
        const canvasBounds = renderer.domElement.getBoundingClientRect();
        const localId = localSessionIdRef.current;
        const isMap2d = cameraStateRef.current.mode === "map2d";
        let selectedPlayerId: string | null = null;
        let closestDistance = isMap2d ? 19 : 30;
        for (const [id, player] of playersRef.current) {
          if (id === localId) continue;
          const avatar = avatars.get(id);
          if (!avatar || (!isMap2d && !avatar.visible)) continue;
          // Project a point around the avatar's torso so the hit target stays
          // usable at different map zoom levels and camera angles.
          const projected = avatar.position.clone().add(new THREE.Vector3(0, isMap2d ? 0.18 : 0.85, 0)).project(camera);
          if (projected.z < -1 || projected.z > 1) continue;
          const screenX = canvasBounds.left + (projected.x * 0.5 + 0.5) * canvasBounds.width;
          const screenY = canvasBounds.top + (-projected.y * 0.5 + 0.5) * canvasBounds.height;
          const distance = Math.hypot(event.clientX - screenX, event.clientY - screenY);
          if (distance < closestDistance) {
            closestDistance = distance;
            selectedPlayerId = id;
          }
        }
        if (selectedPlayerId) {
          deskZonePress = null;
          cameraDrag = null;
          renderer.domElement.style.cursor = "grab";
          buildCallbacksRef.current.onSelectPlayer?.(selectedPlayerId, event.clientX, event.clientY);
          return;
        }
      }
      if (deskZonePress?.pointerId === event.pointerId) {
        if (!cameraDrag.moved) {
          if (mapEditModeRef.current) buildCallbacksRef.current.onSelectMapZone?.(deskZonePress.zoneId);
          else buildCallbacksRef.current.onSelectDeskZone?.(deskZonePress.zoneId);
        }
        deskZonePress = null;
      }
      cameraDrag = null;
      renderer.domElement.style.cursor = "grab";
    };
    const onVehicleKeyDown = (event: KeyboardEvent) => {
      if (appPaused || event.repeat || event.code !== "KeyE" || buildModeRef.current || mapEditModeRef.current) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))) return;
      const localId = localSessionIdRef.current;
      const localPlayer = localId ? playersRef.current.get(localId) : undefined;
      if (localPlayer?.vehicleId) {
        event.preventDefault();
        vehicleInteractRef.current?.("");
        return;
      }
      const nearby = nearbyVehicleRef.current;
      if (!nearby) return;
      event.preventDefault();
      vehicleInteractRef.current?.(nearby.vehicleId, nearby.propId);
    };
    let ghostKeyHeld = false;
    const onGhostModeKeyDown = (event: KeyboardEvent) => {
      if (appPaused || event.repeat || event.code !== "KeyG" || buildModeRef.current || mapEditModeRef.current || ghostKeyHeld) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      ghostKeyHeld = true;
      buildCallbacksRef.current.onGhostModeChange?.(true);
    };
    const stopGhostKey = () => {
      if (!ghostKeyHeld) return;
      ghostKeyHeld = false;
      buildCallbacksRef.current.onGhostModeChange?.(false);
    };
    const onGhostModeKeyUp = (event: KeyboardEvent) => { if (event.code === "KeyG") stopGhostKey(); };
    const onFirstPersonKeyDown = (event: KeyboardEvent) => {
      if (appPaused || (event.code !== "KeyB" && event.key.toLowerCase() !== "b") || event.repeat || !campusOverviewRef.current || !firstPersonViewRef.current || mapEditModeRef.current || buildModeRef.current) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      setWeaponInventoryOpen((open) => {
        const next = !open;
        if (next && document.pointerLockElement === renderer.domElement) document.exitPointerLock();
        return next;
      });
    };
    const onCameraViewKeyDown = (event: KeyboardEvent) => {
      if (appPaused || event.code !== "KeyV" || event.repeat || buildModeRef.current || mapEditModeRef.current) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      toggleCameraViewRef.current();
    };
    const onJumpKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.code !== "Space") return;
      const input = target instanceof HTMLInputElement ? target : null;
      const isTextEntry = target?.closest("textarea, [contenteditable='true']")
        || (input && ["text", "search", "url", "tel", "email", "password"].includes(input.type));
      if (isTextEntry) return;

      // Reserve Space for jumping. Prevent native button activation and any
      // lower-level toolbar handlers from turning it into a toggle/action.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat || appPaused || buildModeRef.current || mapEditModeRef.current || cameraStateRef.current.mode === "map2d" || target?.closest("[role='dialog']")) return;
      const localId = localSessionIdRef.current;
      const player = localId ? playersRef.current.get(localId) : undefined;
      if (!player || player.vehicleId || player.sittingPropId) return;
      buildCallbacksRef.current.onJump?.();
    };
    const onMapEditKeyDown = (event: KeyboardEvent) => {
      if (!mapEditModeRef.current || !mapEditMovementCodes.has(event.code)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      mapEditMovementKeys.add(event.code);
    };
    const onMapEditKeyUp = (event: KeyboardEvent) => {
      mapEditMovementKeys.delete(event.code);
    };
    const clearMapEditMovement = () => mapEditMovementKeys.clear();
    renderer.domElement.style.cursor = buildModeRef.current ? "crosshair" : "grab";
    renderer.domElement.addEventListener("contextmenu", onCanvasContextMenu);
    renderer.domElement.addEventListener("dblclick", onDoubleClick);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("pointerup", stopRotating);
    renderer.domElement.addEventListener("pointercancel", stopRotating);
    renderer.domElement.addEventListener("lostpointercapture", stopRotating);
    window.addEventListener("keydown", onVehicleKeyDown);
    window.addEventListener("keydown", onGhostModeKeyDown);
    window.addEventListener("keyup", onGhostModeKeyUp);
    window.addEventListener("blur", stopGhostKey);
    window.addEventListener("keydown", onFirstPersonKeyDown);
    window.addEventListener("keydown", onCameraViewKeyDown);
    window.addEventListener("keydown", onJumpKeyDown, true);
    window.addEventListener("pointerdown", primeBlasterAudio, { once: true, capture: true });
    window.addEventListener("keydown", primeBlasterAudio, { once: true });
    window.addEventListener("keydown", onMapEditKeyDown);
    window.addEventListener("keyup", onMapEditKeyUp);
    window.addEventListener("blur", clearMapEditMovement);

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      // Calculate the yaw-independent map fit once per viewport size and reuse
      // it during frames/rotation; this prevents camera orbit from changing zoom.
      campusFitDistanceM = campusOverviewDistance(activeFloor.width, activeFloor.depth, camera.aspect, cameraYawRef.current, cameraStateRef.current.elevationRad, TPP_FOV_DEG);
      const transitionDistance = Math.max(CAMERA.minZoom, campusFitDistanceM * CAMPUS_2D_ZOOM_THRESHOLD_RATIO);
      tppTransitionDistanceMRef.current = campusOverview ? transitionDistance : CAMERA.maxZoom;
      setTppTransitionDistanceM(tppTransitionDistanceMRef.current);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const render = (now: number) => {
      const remoteShots = blasterEventsRef?.current.splice(0, 12) ?? [];
      for (const shot of remoteShots) {
        const beam = makeLaserBeam(new THREE.Vector3(shot.start.x, shot.start.y, shot.start.z), new THREE.Vector3(shot.end.x, shot.end.y, shot.end.z));
        scene.add(beam);
        firstPersonEffects.push({ group: beam, createdAt: now, duration: 500, beamOnly: true });
        playBlasterShotSound();
      }
      if (mapEditModeRef.current !== lastMapEditMode) {
        lastMapEditMode = mapEditModeRef.current;
        if (lastMapEditMode) {
          mapEditMovementKeys.clear();
          if (cameraStateRef.current.following) cameraPanTarget.copy(currentLookTarget);
          dispatchCamera({ type: "manual-drag" });
        }
      }
      const delta = Math.min((now - previousFrame) / 1000, 0.05);
      previousFrame = now;
      if (mapEditModeRef.current && mapEditMovementKeys.size > 0) {
        cameraPanTarget.copy(panEditorCamera(cameraPanTarget, mapEditMovementKeys, cameraYawRef.current, delta, mapWorld.width, mapWorld.depth));
        dispatchCamera({ type: "manual-drag" });
      }
      const currentPortalIds = new Set<string>();
      for (const portal of roomPortalsRef.current) {
        currentPortalIds.add(portal.roomKey);
        const signature = `${portal.name}:${portal.isLocked}`;
        let entry = roomPortalMeshes.get(portal.roomKey);
        if (entry && entry.signature !== signature) {
          scene.remove(entry.root);
          entry.root.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              object.geometry.dispose();
              const materials = Array.isArray(object.material) ? object.material : [object.material];
              materials.forEach((material) => {
                if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose();
                material.dispose();
              });
            } else if (object instanceof THREE.Sprite) {
              object.material.map?.dispose(); object.material.dispose();
            }
          });
          roomPortalMeshes.delete(portal.roomKey);
          entry = undefined;
        }
        if (!entry) {
          const root = new THREE.Group();
          const tint = portal.isLocked ? 0xc58b55 : 0x4c9b7b;
          const frameMaterial = new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.22, roughness: 0.4 });
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.075, 10, 36), frameMaterial);
          ring.position.y = 1.05;
          root.add(ring);
          const postGeometry = new THREE.BoxGeometry(0.13, 2.1, 0.13);
          for (const side of [-0.82, 0.82]) {
            const post = new THREE.Mesh(postGeometry, frameMaterial);
            post.position.set(side, 1.02, 0);
            post.castShadow = true;
            root.add(post);
          }
          const threshold = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.055, 0.28), new THREE.MeshStandardMaterial({ color: tint, roughness: 0.45 }));
          threshold.position.y = 0.04;
          root.add(threshold);
          const label = makeNameTag(`${portal.isLocked ? "🔒 " : "↗ "}${portal.name}`);
          label.position.y = 2.48;
          label.scale.set(2.3, 0.58, 1);
          root.add(label);
          scene.add(root);
          entry = { root, label, signature };
          roomPortalMeshes.set(portal.roomKey, entry);
        }
        entry.label.visible = campusOverviewRef.current && cameraRoomKeyRef.current === "lobby" && !firstPersonViewRef.current;
        entry.root.position.set(
          portal.x + (campusOverviewRef.current ? mapWorld.width / 2 : 0),
          0,
          portal.z + (campusOverviewRef.current ? mapWorld.depth / 2 : 0),
        );
      }
      for (const [roomKey, entry] of roomPortalMeshes) {
        if (currentPortalIds.has(roomKey)) continue;
        scene.remove(entry.root);
        entry.root.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => {
              if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose();
              material.dispose();
            });
          } else if (object instanceof THREE.Sprite) {
            object.material.map?.dispose(); object.material.dispose();
          }
        });
        roomPortalMeshes.delete(roomKey);
      }
      const players = playersRef.current;
      const localId = localSessionIdRef.current;

      const localPlayer = localId ? players.get(localId) : undefined;
      // Proximity based opening is client side, so doors animate without any
      // extra realtime messages. Keep them open while someone is in the doorway
      // and briefly after they pass through.
      for (const door of animatedDoors) {
        let someoneNearby = false;
        for (const player of players.values()) {
          const dx = player.x - door.x;
          const dz = player.z - door.z;
          if (dx * dx + dz * dz < 1.65 * 1.65) { someoneNearby = true; break; }
        }
        if (someoneNearby) door.openUntil = now + 700;
        const shouldOpen = someoneNearby || now < door.openUntil;
        const easing = 1 - Math.exp(-delta * (shouldOpen ? 8 : 5));
        for (const leaf of door.hinges) {
          const targetAngle = shouldOpen ? leaf.openAngle : 0;
          leaf.group.rotation.y = THREE.MathUtils.lerp(leaf.group.rotation.y, targetAngle, easing);
        }
      }
      const nextIsDriving = Boolean(localPlayer?.vehicleId);
      if (drivingRef.current !== nextIsDriving) {
        drivingRef.current = nextIsDriving;
        setIsDriving(nextIsDriving);
      }
      let nearestVehicle: { vehicleId: KenneyVehicleId; propId: string } | null = null;
      let nearestDistance = 3.2;
      const occupiedVehicleIds = new Set<string>();
      const occupantsByProp = new Map<string, PlayerSnapshot>();
      const parkedByProp = new Map<string, PlayerSnapshot>();
      for (const player of players.values()) {
        if (player.vehicleId) occupiedVehicleIds.add(player.vehicleId);
        if (!player.vehiclePropId) continue;
        if (player.vehicleId) {
          if (!occupantsByProp.has(player.vehiclePropId)) occupantsByProp.set(player.vehiclePropId, player);
        } else if (!parkedByProp.has(player.vehiclePropId)) parkedByProp.set(player.vehiclePropId, player);
      }
      for (const prop of driveableProps) {
        const occupant = occupantsByProp.get(prop.id);
        const parkedAt = parkedByProp.get(prop.id);
        let parked = parkedVehicleGroups.get(prop.id);
        if (occupant || (occupiedVehicleIds.has(prop.vehicleId) && !parkedAt)) {
          if (parked) scene.remove(parked);
        } else {
          if (!parked) {
            const parkedRoot = new THREE.Group();
            parkedRoot.name = `Interactable parked vehicle ${prop.id}`;
            parked = parkedRoot;
            parkedVehicleGroups.set(prop.id, parkedRoot);
            void getVehicleModel(prop.vehicleId).then((gltf) => {
              if (disposed || parkedVehicleGroups.get(prop.id) !== parkedRoot) return;
              const model = SkeletonUtils.clone(gltf.scene) as THREE.Group;
              fitVehicleToDriveScale(model);
              model.traverse((child) => { if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; } });
              parkedRoot.add(model);
            }).catch((error: unknown) => console.warn(`Could not load parked vehicle ${prop.vehicleId}.`, error));
          }
          if (!parked) continue;
          if (campusOverviewRef.current && !parked.parent) scene.add(parked);
          parked.visible = campusOverviewRef.current && draggingMapProp?.id !== prop.id;
          // Keep the transient drag position while the pointer is held. The
          // normal frame sync uses the saved layout coordinates, which would
          // otherwise snap a parked vehicle back to its origin every frame.
          if (draggingMapProp?.id !== prop.id) {
            const worldX = parkedAt?.vehiclePropX ?? prop.x;
            const worldZ = parkedAt?.vehiclePropZ ?? prop.z;
            parked.position.set(worldX + (campusOverviewRef.current ? mapWorld.width / 2 : 0), 0, worldZ + (campusOverviewRef.current ? mapWorld.depth / 2 : 0));
            const parkedRotation = parkedAt?.vehiclePropRotation ?? prop.rotation;
            parked.rotation.y = parkedRotation + (prop.vehicleId.startsWith("vehicle-") ? Math.PI : 0);
          }
        }
        // A just-exited car is parked at its driver's position and remains usable there.
        const canInteract = !occupant && (!occupiedVehicleIds.has(prop.vehicleId) || Boolean(parkedAt));
        if (localPlayer && !localPlayer.vehicleId && canInteract) {
          const dx = localPlayer.x - (parkedAt?.vehiclePropX ?? prop.x);
          const dz = localPlayer.z - (parkedAt?.vehiclePropZ ?? prop.z);
          const distance = Math.hypot(dx, dz);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestVehicle = { vehicleId: prop.vehicleId, propId: prop.id };
          }
        }
      }
      const nextNearbyKey = nearestVehicle ? `${nearestVehicle.propId}:${nearestVehicle.vehicleId}` : "";
      const currentNearbyKey = nearbyVehicleRef.current ? `${nearbyVehicleRef.current.propId}:${nearbyVehicleRef.current.vehicleId}` : "";
      if (nextNearbyKey !== currentNearbyKey) {
        nearbyVehicleRef.current = nearestVehicle;
        setNearbyVehicle(nearestVehicle);
      }
      if (localPlayer?.vehicleId && nearbyVehicleRef.current) {
        nearbyVehicleRef.current = null;
        setNearbyVehicle(null);
      }

      for (const [id, player] of players) {
        const characterId = player.characterId || DEFAULT_CHARACTER_ID;
        const userStatus: PlayerStatus = player.status ?? "available";
        const vehicleId = player.vehicleId ?? "";
        const petId = player.petId ?? "";
        let avatar = avatars.get(id);
        if (avatar && avatarCharacterIds.get(id) !== characterId) {
          scene.remove(avatar);
          avatarAnimations.get(id)?.mixer?.stopAllAction();
          avatarAnimations.delete(id);
          disposeAvatar(avatar);
          avatars.delete(id);
          heldWeaponBySessionId.delete(id);
          avatarCharacterIds.delete(id);
          avatarStatusBadges.delete(id);
          avatarSpeakingBubbles.delete(id);
          fallbackParts.delete(id);
          avatar = undefined;
        }
        if (!avatar) {
          const color = avatarColors[avatars.size % avatarColors.length];
          const fallback = makeAvatar(color, id === localId ? "You" : player.displayName);
          avatar = fallback.group;
          avatarAnimations.set(id, { model: fallback.bodyPivot, proceduralMotion: true, rotationOffset: Math.PI, phase: 0 });
          fallbackParts.set(id, {
            body: fallback.body,
            head: fallback.head,
            leftLeg: fallback.leftLeg,
            rightLeg: fallback.rightLeg,
            leftArm: fallback.leftArm,
            rightArm: fallback.rightArm,
          });
          avatar.position.set(
            player.x + (campusOverviewRef.current ? mapWorld.width / 2 : 0),
            0,
            player.z + (campusOverviewRef.current ? mapWorld.depth / 2 : 0),
          );
          const statusBadge = makeUserStatusBadge(userStatus);
          avatar.add(statusBadge);
          avatarStatusBadges.set(id, statusBadge);
          const speakingBubble = makeSpeakingBubble();
          avatar.add(speakingBubble);
          avatarSpeakingBubbles.set(id, speakingBubble);
          scene.add(avatar);
          avatars.set(id, avatar);
          avatarCharacterIds.set(id, characterId);
          positions.set(id, avatar.position.clone());

          const avatarRoot = avatar;
          const fallbackRig = fallback.proceduralRig;
          void getCharacterModel(characterId).then((gltf) => {
            if (disposed || avatars.get(id) !== avatarRoot) return;
            const model = SkeletonUtils.clone(gltf.scene) as THREE.Group;
            const bounds = new THREE.Box3().setFromObject(model);
            const size = bounds.getSize(new THREE.Vector3());
            const center = bounds.getCenter(new THREE.Vector3());
            const scale = 1.55 / Math.max(size.y, 0.001);
            model.scale.setScalar(scale);
            model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
            model.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // Kenney geometry/materials/textures are shared by skeleton clones.
                // Keep the shared resources alive until the world effect is disposed.
                child.userData.sharedKenneyAvatarResources = true;
              }
            });
            avatarRoot.add(model);
            fallbackRig.visible = false;

            const mixer = new THREE.AnimationMixer(model);
            const idleClip = gltf.animations.find((clip) => clip.name.toLowerCase() === "idle");
            const walkClip = gltf.animations.find((clip) => clip.name.toLowerCase() === "walk");
            const runClip = gltf.animations.find((clip) => clip.name.toLowerCase() === "run");
            // Kenney's generic `sit` clip lowers the root by 0.2 m, as if the
            // character were sitting on the floor. Keep its leg pose but
            // remove that root drop so the hips remain at the chair seat.
            const sitClip = gltf.animations.find((clip) => clip.name.toLowerCase() === "sit");
            const chairSitClip = sitClip?.clone();
            chairSitClip?.tracks.forEach((track) => {
              if (!/^(?:root|armature|mixamorig:)?root\.position$/i.test(track.name)) return;
              const values = track.values as Float32Array;
              for (let index = 1; index < values.length; index += 3) values[index] = 0;
            });
            const idleAction = idleClip ? mixer.clipAction(idleClip) : undefined;
            const walkAction = walkClip ? mixer.clipAction(walkClip) : undefined;
            const runAction = runClip ? mixer.clipAction(runClip) : undefined;
            const sitAction = chairSitClip ? mixer.clipAction(chairSitClip) : undefined;
            const danceClip = gltf.animations.find((clip) => /dance/i.test(clip.name));
            const danceAction = danceClip ? mixer.clipAction(danceClip) : undefined;
            const currentAction = idleAction ?? walkAction;
            currentAction?.play();
            avatarAnimations.set(id, {
              model,
              proceduralMotion: false,
              rotationOffset: 0,
              phase: 0,
              mixer,
              idleAction,
              walkAction,
              runAction,
              sitAction,
              danceAction,
              currentAction,
              danceBasePosition: model.position.clone(),
              danceBaseRotation: model.rotation.clone(),
            });
            fallbackParts.delete(id);
          }).catch((error: unknown) => {
            if (!avatarLoadFailureLogged && !disposed) {
              avatarLoadFailureLogged = true;
              console.warn("Could not load the Kenney character; keeping the procedural avatar.", error);
            }
          });
        }

        let statusBadge = avatarStatusBadges.get(id);
        if (!statusBadge || statusBadge.userData.playerStatus !== userStatus) {
          if (statusBadge) {
            avatar.remove(statusBadge);
            statusBadge.material.map?.dispose();
            statusBadge.material.dispose();
          }
          statusBadge = makeUserStatusBadge(userStatus);
          avatar.add(statusBadge);
          avatarStatusBadges.set(id, statusBadge);
        }
        let speakingBubble = avatarSpeakingBubbles.get(id);
        if (!speakingBubble) {
          speakingBubble = makeSpeakingBubble();
          avatar.add(speakingBubble);
          avatarSpeakingBubbles.set(id, speakingBubble);
        }
          speakingBubble.visible = Boolean(speakingUsernamesRef?.current.has(player.username.trim().toLocaleLowerCase()));

        const requestedWeapon = player.weaponId && KENNEY_BLASTER_IDS.includes(player.weaponId) ? player.weaponId : "";
        let heldWeapon = heldWeaponBySessionId.get(id);
        if (heldWeapon && heldWeapon.userData.weaponId !== requestedWeapon) {
          avatar.remove(heldWeapon);
          heldWeaponBySessionId.delete(id);
          heldWeapon = undefined;
        }
        if (requestedWeapon && !heldWeapon) {
          const grip = new THREE.Group();
          grip.position.set(0.3, 0.68, -0.08);
          grip.userData.weaponId = requestedWeapon;
          avatar.add(grip);
          heldWeaponBySessionId.set(id, grip);
          void loadBlasterTemplate(requestedWeapon).then((template) => {
            if (disposed || heldWeaponBySessionId.get(id) !== grip) return;
            const model = SkeletonUtils.clone(template) as THREE.Group;
            model.scale.setScalar(0.34);
            model.rotation.y = Math.PI;
            grip.add(model);
          }).catch((error: unknown) => console.warn(`Could not load held Kenney ${requestedWeapon}.`, error));
        }

        const current = positions.get(id)!;
        const sittingReference = player.sittingPropId ? parseRoomPropSeatReference(player.sittingPropId) : undefined;
        const sittingProp = sittingReference ? roomLayout?.props.find((prop) => prop.id === sittingReference.propId) : undefined;
        const sittingDefinition = sittingProp ? ROOM_PROP_CATALOG.find((item) => item.asset === sittingProp.asset) : undefined;
        const sittingAnchor = sittingProp && sittingReference
          ? roomPropSeatAnchors(sittingProp, sittingDefinition, renderedPropScales.get(sittingProp.id) ?? 1).find((anchor) => anchor.index === sittingReference.seatIndex)
          : undefined;
        const campusOffset = campusOverviewRef.current ? mapWorld.width / 2 : 0;
        const renderX = sittingAnchor ? sittingAnchor.x + campusOffset : player.x + campusOffset;
        const renderZ = sittingAnchor ? sittingAnchor.z + (campusOverviewRef.current ? mapWorld.depth / 2 : 0) : player.z + (campusOverviewRef.current ? mapWorld.depth / 2 : 0);
        const moving = !sittingProp && Math.hypot(renderX - current.x, renderZ - current.z) > 0.008;
        const sprinting = id === localId && Boolean(heldKeysRef?.current.has("ShiftLeft") || heldKeysRef?.current.has("ShiftRight"));
        const animation = avatarAnimations.get(id);
        if (animation?.mixer) {
          const idleEnabled = idleAnimationsEnabledRef.current;
          const dancing = Boolean(player.dancing) && !moving && !sittingProp && !vehicleId;
          const targetAction = dancing && animation.danceAction
            ? animation.danceAction
            : sittingProp
            ? animation.sitAction ?? (idleEnabled ? animation.idleAction : undefined)
            : moving ? (sprinting ? animation.runAction ?? animation.walkAction : animation.walkAction) : idleEnabled ? animation.idleAction : undefined;
          if (targetAction !== animation.currentAction) {
            animation.currentAction?.fadeOut(0.18);
            targetAction?.reset().fadeIn(0.18).play();
            animation.currentAction = targetAction;
          }
          animation.mixer.update(delta * motionScale);
          if (dancing && !animation.danceAction) {
            const phase = performance.now() / 1000;
            animation.model.position.y = (animation.danceBasePosition?.y ?? 0) + Math.abs(Math.sin(phase * 7)) * 0.09;
            animation.model.rotation.y = (animation.danceBaseRotation?.y ?? 0) + Math.sin(phase * 3.5) * 0.22;
            animation.model.rotation.z = (animation.danceBaseRotation?.z ?? 0) + Math.sin(phase * 7) * 0.07;
            animation.proceduralDanceActive = true;
          } else if (animation.proceduralDanceActive && animation.danceBasePosition && animation.danceBaseRotation) {
            animation.model.position.copy(animation.danceBasePosition);
            animation.model.rotation.copy(animation.danceBaseRotation);
            animation.proceduralDanceActive = false;
          }
        } else if (animation?.proceduralMotion) {
          const dancing = Boolean(player.dancing) && !moving && !sittingProp && !vehicleId;
          const animateIdle = idleAnimationsEnabledRef.current;
          animation.phase += delta * (dancing ? 7 : moving ? (sprinting ? 12 : 8) : animateIdle ? 2.4 : 0) * motionScale;
          animation.model.position.y = dancing ? Math.abs(Math.sin(animation.phase)) * 0.09 : moving || animateIdle ? Math.sin(animation.phase) * 0.018 : 0;
          animation.model.rotation.z = dancing ? Math.sin(animation.phase * 0.5) * 0.12 : moving ? Math.sin(animation.phase * 0.5) * 0.06 : animateIdle ? Math.sin(animation.phase) * 0.012 : 0;
          animation.model.rotation.y = dancing ? Math.sin(animation.phase * 0.5) * 0.22 : 0;
          const fallback = fallbackParts.get(id);
          if (fallback) {
            const stride = moving ? Math.sin(animation.phase) : 0;
            fallback.body.position.y = 0.07 + (moving ? Math.max(0, Math.sin(animation.phase)) * 0.045 : animateIdle ? Math.max(0, Math.sin(animation.phase)) * 0.012 : 0);
            fallback.body.rotation.z = dancing ? Math.sin(animation.phase) * 0.14 : stride * 0.035;
            fallback.head.rotation.z = dancing ? -Math.sin(animation.phase) * 0.12 : moving ? -stride * 0.035 : animateIdle ? Math.sin(animation.phase) * 0.012 : 0;
            const strideAmount = sprinting ? 0.42 : 0.24;
            fallback.leftArm.rotation.x = dancing ? Math.sin(animation.phase) * 0.75 : moving ? stride * strideAmount : 0;
            fallback.rightArm.rotation.x = dancing ? -Math.sin(animation.phase) * 0.75 : moving ? -stride * strideAmount : 0;
            fallback.leftLeg.rotation.x = dancing ? Math.sin(animation.phase * 0.5) * 0.35 : moving ? -stride * strideAmount * 1.15 : 0;
            fallback.rightLeg.rotation.x = dancing ? -Math.sin(animation.phase * 0.5) * 0.35 : moving ? stride * strideAmount * 1.15 : 0;
          }
        }
        const responsiveness = id === localId ? 0.38 : 0.16;
        const blend = 1 - Math.pow(1 - responsiveness, delta * 60);
        current.x = THREE.MathUtils.lerp(current.x, renderX, blend);
        current.z = THREE.MathUtils.lerp(current.z, renderZ, blend);
        avatar.position.x = current.x;
        avatar.position.z = current.z;
        const jumpStartedAt = jumpStartedAtRef?.current.get(id);
        const jumpElapsedMs = jumpStartedAt === undefined ? JUMP_DURATION_MS : now - jumpStartedAt;
        if (jumpStartedAt !== undefined && jumpElapsedMs >= JUMP_DURATION_MS) jumpStartedAtRef?.current.delete(id);
        avatar.position.y = (sittingProp && sittingAnchor
          ? (sittingProp.elevation ?? 0) + sittingAnchor.y
          : 0) + (!sittingProp && !vehicleId ? jumpHeightAt(jumpElapsedMs) : 0);
        // Seat the rig at the chair's seat height and face the same direction
        // as the chair. Kenney's character packs include a native "sit" clip;
        // keep the model's proportions intact while that pose is active.
        avatar.scale.y = 1;
        const rotationOffset = animation?.rotationOffset ?? Math.PI;
        // Kenney's authored sit clip faces the opposite local direction from
        // the chair fronts in our office furniture assets.
        const targetRotation = sittingProp ? (sittingAnchor?.rotation ?? sittingProp.rotation) + rotationOffset + Math.PI : player.rotation + rotationOffset;
        avatar.rotation.y = lerpAngle(avatar.rotation.y, targetRotation, blend);
        // While mounted, keep the avatar hidden even when the vehicle is idle.
        avatar.visible = !vehicleId;
        const avatarModel = animation?.model;
        if (avatarModel) setGhostModelOpacity(avatarModel, ghostSessionIdsRef.current.has(id));

        if (petIds.get(id) !== petId) {
          const previousPet = petGroups.get(id);
          if (previousPet) scene.remove(previousPet);
          petMixers.get(id)?.mixer.stopAllAction();
          petGroups.delete(id); petMixers.delete(id); petPositions.delete(id); petIds.delete(id);
          petSides.delete(id);
          if (petId) {
            petIds.set(id, petId);
            // Keep the randomized side stable and consistent across clients.
            const sideSeed = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
            petSides.set(id, sideSeed % 2 === 0 ? -1 : 1);
            const petRoot = new THREE.Group();
            scene.add(petRoot);
            petGroups.set(id, petRoot);
            void getPetModel(petId).then((gltf) => {
              if (disposed || petGroups.get(id) !== petRoot) return;
              const model = SkeletonUtils.clone(gltf.scene) as THREE.Group;
              const bounds = new THREE.Box3().setFromObject(model);
              const size = bounds.getSize(new THREE.Vector3());
              const center = bounds.getCenter(new THREE.Vector3());
              const scale = 0.62 / Math.max(size.y, 0.001);
              model.scale.setScalar(scale);
              model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
              model.traverse((child) => { if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; } });
              petRoot.add(model);
              const mixer = new THREE.AnimationMixer(model);
              const idleClip = gltf.animations.find((clip) => clip.name.toLowerCase() === "idle") ?? gltf.animations.find((clip) => clip.name.toLowerCase() === "static");
              const walkClip = gltf.animations.find((clip) => clip.name.toLowerCase() === "walk") ?? gltf.animations.find((clip) => clip.name.toLowerCase() === "run");
              const idle = idleClip ? mixer.clipAction(idleClip) : undefined;
              const walk = walkClip ? mixer.clipAction(walkClip) : undefined;
              const current = idle ?? walk;
              current?.play();
              petMixers.set(id, { mixer, idle, walk, current });
            }).catch((error: unknown) => console.warn(`Could not load pet model ${petId}.`, error));
          }
        }
        const petRoot = petGroups.get(id);
        if (petRoot && petId) {
          const side = petSides.get(id) ?? 1;
          const besideX = renderX + Math.cos(player.rotation) * side * 1.2;
          const besideZ = renderZ - Math.sin(player.rotation) * side * 1.2;
          const petPosition = petPositions.get(id) ?? new THREE.Vector3(besideX, 0, besideZ);
          const petBlend = 1 - Math.pow(0.88, delta * 60);
          const oldPetX = petPosition.x, oldPetZ = petPosition.z;
          petPosition.x = THREE.MathUtils.lerp(petPosition.x, besideX, petBlend);
          petPosition.z = THREE.MathUtils.lerp(petPosition.z, besideZ, petBlend);
          petPositions.set(id, petPosition);
          petRoot.position.set(petPosition.x, 0, petPosition.z);
          petRoot.rotation.y = player.rotation;
          const petAnimation = petMixers.get(id);
          const petWalking = Math.hypot(petPosition.x - oldPetX, petPosition.z - oldPetZ) > 0.006;
          const nextPetAction = petWalking ? petAnimation?.walk : idleAnimationsEnabledRef.current ? petAnimation?.idle : undefined;
          if (petAnimation && nextPetAction !== petAnimation.current) {
            petAnimation.current?.fadeOut(0.18);
            nextPetAction?.reset().fadeIn(0.18).play();
            petAnimation.current = nextPetAction;
          }
          petAnimation?.mixer.update(delta * motionScale);
        }

        if (vehicleIds.get(id) !== vehicleId) {
          const previousVehicle = vehicleGroups.get(id);
          if (previousVehicle) scene.remove(previousVehicle);
          vehicleGroups.delete(id); vehiclePositions.delete(id); vehicleIds.delete(id);
          if (vehicleId) {
            vehicleIds.set(id, vehicleId);
            const vehicleRoot = new THREE.Group();
            scene.add(vehicleRoot);
            vehicleGroups.set(id, vehicleRoot);
            void getVehicleModel(vehicleId).then((gltf) => {
              if (disposed || vehicleGroups.get(id) !== vehicleRoot) return;
              const model = SkeletonUtils.clone(gltf.scene) as THREE.Group;
              fitVehicleToDriveScale(model);
              model.traverse((child) => { if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; } });
              vehicleRoot.add(model);
            }).catch((error: unknown) => console.warn(`Could not load vehicle model ${vehicleId}.`, error));
          } else {
          }
        }
        const vehicleRoot = vehicleGroups.get(id);
        if (vehicleRoot && vehicleId) {
          vehicleRoot.visible = true;
          const vehiclePosition = vehiclePositions.get(id) ?? new THREE.Vector3(renderX, 0, renderZ);
          vehiclePosition.x = THREE.MathUtils.lerp(vehiclePosition.x, renderX, blend);
          vehiclePosition.z = THREE.MathUtils.lerp(vehiclePosition.z, renderZ, blend);
          vehiclePositions.set(id, vehiclePosition);
          vehicleRoot.position.set(vehiclePosition.x, 0, vehiclePosition.z);
          // Toy Car Kit models face local -Z; Car Kit cars face local +Z.
          // Player movement rotation points along +Z at zero, so correct the
          // toy models by a half turn to keep their nose aligned with travel.
          vehicleRoot.rotation.y = player.rotation + (vehicleId.startsWith("vehicle-") ? Math.PI : 0);
        }
      }

      for (const [id, avatar] of avatars) {
        if (!players.has(id)) {
          scene.remove(avatar);
          avatarAnimations.get(id)?.mixer?.stopAllAction();
          avatarAnimations.delete(id);
          fallbackParts.delete(id);
          disposeAvatar(avatar);
          avatars.delete(id);
          heldWeaponBySessionId.delete(id);
          avatarCharacterIds.delete(id);
          avatarStatusBadges.delete(id);
          avatarSpeakingBubbles.delete(id);
          positions.delete(id);
          jumpStartedAtRef?.current.delete(id);
        }
      }
      for (const [id, petRoot] of petGroups) {
        if (players.has(id)) continue;
        scene.remove(petRoot); petMixers.get(id)?.mixer.stopAllAction();
        petGroups.delete(id); petMixers.delete(id); petPositions.delete(id); petIds.delete(id); petSides.delete(id);
      }
      for (const [id, vehicleRoot] of vehicleGroups) {
        if (players.has(id)) continue;
        scene.remove(vehicleRoot); vehicleGroups.delete(id); vehiclePositions.delete(id); vehicleIds.delete(id);
      }

      for (const floorGroup of campusFloorGroups.values()) floorGroup.visible = campusOverviewRef.current;
      const lobbyRoomNamesVisible = campusOverviewRef.current && cameraRoomKeyRef.current === "lobby" && !firstPersonViewRef.current;
      const labelObserver = localId ? playersRef.current.get(localId) : undefined;
      const isWithinRoomLabelRadius = (x: number, z: number) => Boolean(labelObserver
        && Math.hypot(x - (labelObserver.x + mapWorld.width / 2), z - (labelObserver.z + mapWorld.depth / 2)) <= ROOM_LABEL_RADIUS_BLOCKS);
      for (const label of campusRoomNameLabels) {
        label.visible = lobbyRoomNamesVisible && isWithinRoomLabelRadius(label.userData.roomLabelX, label.userData.roomLabelZ);
      }
      for (const [zoneId, entry] of zoneNameLabels) {
        entry.label.visible = lobbyRoomNamesVisible && !entry.owned && isWithinRoomLabelRadius(entry.x, entry.z);
      }
      for (const entry of roomPortalMeshes.values()) {
        entry.label.visible = lobbyRoomNamesVisible && isWithinRoomLabelRadius(entry.root.position.x, entry.root.position.z);
      }
      for (const overlay of mapCollisionOverlays) overlay.visible = buildModeRef.current;
      for (const [id, highlight] of mapPropSelectionHighlights) highlight.visible = buildModeRef.current && selectedMapItemIdRef.current === id;
      for (const [id, highlight] of mapZoneSelectionHighlights) highlight.visible = mapEditModeRef.current && selectedMapZoneIdRef.current === id;
      mapEditOverlay.visible = campusOverviewRef.current && (mapEditModeRef.current || buildModeRef.current);
      if (compassRoseRef.current) compassRoseRef.current.style.transform = `rotate(${THREE.MathUtils.radToDeg(cameraYawRef.current)}deg)`;
      // A lobby session renders and moves on the shared campus map; meeting/private
      // room sessions retain the smaller existing interior scene.
      const showLiveOffice = !campusOverviewRef.current;
      kenneyFloor.visible = showLiveOffice;
      fallbackFloor.visible = showLiveOffice && kenneyFloor.children.length === 0;
      kenneyWalls.visible = showLiveOffice;
      furniture.visible = showLiveOffice;
      meetingRug.visible = showLiveOffice && !roomLayout?.zones.some((zone) => zone.kind === "meeting");
      grid.visible = showLiveOffice;
      for (const avatar of avatars.values()) avatar.scale.setScalar(1);
      // Portal frames and their depth-independent labels otherwise sit directly
      // in front of the avatar while the focus camera tracks the local player.
      for (const entry of roomPortalMeshes.values()) {
        entry.root.visible = !cameraStateRef.current.following;
      }

      const local = localId ? avatars.get(localId) : undefined;
      const localPlayerState = localId ? playersRef.current.get(localId) : undefined;
      if (cameraStateRef.current.arrival === "awaiting-avatar" && local && localPlayerState) {
        if (cameraStateRef.current.alignBehind) cameraYawRef.current = localPlayerState.rotation + Math.PI;
        dispatchCamera({ type: "avatar-ready" });
        previousCameraPose = null;
      }
      const editing = mapEditModeRef.current || buildModeRef.current;
      if (cameraStateRef.current.editing !== editing) dispatchCamera({ type: "edit", active: editing });
      const heldKeys = heldKeysRef?.current;
      const walkingInput = Boolean(heldKeys && hasCameraMovement(heldKeys));
      if (walkingInput) dispatchCamera({ type: "walk-input" });
      const lockBehind = isBehindCharacterLocked(cameraStateRef.current);
      cameraBehindCharacterRef.current = lockBehind;
      if (lockBehind && localPlayerState) {
        const blend = 1 - Math.exp(-FOLLOW_FACING_RESPONSE_PER_SECOND * delta);
        cameraYawRef.current = lerpAngle(cameraYawRef.current, localPlayerState.rotation + Math.PI, blend);
      }
      const frame = computeCameraFrame({
        state: cameraStateRef.current, localPosition: local?.position, panTarget: cameraPanTarget,
        width: activeFloor.width, depth: activeFloor.depth, aspect: camera.aspect,
        yaw: cameraYawRef.current, pitch: firstPersonPitch, campusFitDistanceM,
      });
      currentLookTarget.copy(frame.focus);
      const firstPerson = frame.mode === "fpp";
      if (local) local.visible = !firstPerson && !localPlayerState?.vehicleId;
      firstPersonViewModel.visible = firstPerson && !mapEditModeRef.current && !buildModeRef.current && !localPlayerState?.vehicleId;
      if (firstPersonViewModel.visible) equipFirstPersonBlaster(selectedBlasterIdRef.current);
      applyCameraProjection(camera, frame, campusOverviewRef.current);
      const roomChanged = previousCameraWorldKey !== previousWorldKeyRef.current;
      const modeChanged = previousCameraMode !== frame.mode;
      const pose = smoothCameraPose(previousCameraPose, frame.pose, delta, { reduceMotion, modeChanged, roomChanged });
      const visiblePose = cameraOcclusion.apply(pose, frame.mode, delta, reduceMotion || modeChanged || roomChanged || !previousCameraPose);
      camera.position.copy(visiblePose.position);
      camera.lookAt(visiblePose.lookAt);
      camera.updateMatrixWorld(true);
      previousCameraPose = pose;
      previousCameraMode = frame.mode;
      previousCameraWorldKey = previousWorldKeyRef.current;
      const actionMenu = propActionMenuRef.current;
      const actionMenuElement = propActionMenuElementRef.current;
      if (actionMenuElement) {
        if (!buildModeRef.current || !campusOverviewRef.current || !actionMenu) {
          actionMenuElement.style.visibility = "hidden";
        } else {
          const propObject = campusMapProps.children.find((child) => child.userData.officeMapPropId === actionMenu.id);
          const prop = roomLayout?.props.find((item) => item.id === actionMenu.id);
          const definition = prop && ROOM_PROP_CATALOG.find((item) => item.asset === prop.asset);
          if (!propObject || !prop) {
            actionMenuElement.style.visibility = "hidden";
          } else {
            const anchor = propObject.getWorldPosition(new THREE.Vector3());
            anchor.y += (definition?.height ?? 0.5) + 0.18;
            anchor.project(camera);
            const rect = renderer.domElement.getBoundingClientRect();
            const inView = anchor.z >= -1 && anchor.z <= 1 && Math.abs(anchor.x) <= 1.15 && Math.abs(anchor.y) <= 1.15;
            if (!inView) {
              actionMenuElement.style.visibility = "hidden";
            } else {
              const anchorX = rect.left + (anchor.x + 1) * rect.width / 2;
              const anchorY = rect.top + (1 - anchor.y) * rect.height / 2;
              const halfWidth = actionMenuElement.offsetWidth / 2;
              const left = THREE.MathUtils.clamp(anchorX, rect.left + halfWidth + 8, rect.right - halfWidth - 8);
              const top = anchorY - actionMenuElement.offsetHeight - 12 >= rect.top + 8
                ? anchorY - actionMenuElement.offsetHeight - 12
                : Math.min(rect.bottom - actionMenuElement.offsetHeight - 8, anchorY + 14);
              actionMenuElement.style.left = `${left}px`;
              actionMenuElement.style.top = `${top}px`;
              actionMenuElement.style.visibility = "visible";
            }
          }
        }
      }
      const viewmodelProgress = weaponRecoilUntil > now ? (weaponRecoilUntil - now) / 110 : 0;
      firstPersonWeapon.position.z = viewmodelProgress * 0.075;
      gunMuzzleFlash.visible = firstPersonViewModel.visible && muzzleFlashUntil > now;
      for (let index = firstPersonEffects.length - 1; index >= 0; index -= 1) {
        const entry = firstPersonEffects[index];
        const elapsed = now - entry.createdAt;
        const progress = elapsed / entry.duration;
        const effect = entry.group;
        if (entry.beamOnly) {
          effect.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            const material = object.material as THREE.MeshBasicMaterial;
            const baseOpacity = material.color.getHex() === 0xfb8500 ? 0.72 : 1;
            material.opacity = Math.max(0, baseOpacity * (1 - progress));
          });
        } else {
          effect.scale.setScalar(0.72 + progress * 0.9);
          const impactMaterial = (effect.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
          impactMaterial.opacity = 0.9 * (1 - progress);
          if (entry.beam) {
            if (elapsed < 500) {
              entry.beam.traverse((object) => {
                if (!(object instanceof THREE.Mesh)) return;
                const material = object.material as THREE.MeshBasicMaterial;
              const baseOpacity = material.color.getHex() === 0xfb8500 ? 0.72 : 1;
              material.opacity = Math.max(0, baseOpacity * (1 - elapsed / 500));
              });
            } else {
              scene.remove(entry.beam);
              disposeObjectResources(entry.beam);
              entry.beam = undefined;
            }
          }
        }
        if (progress >= 1) {
          scene.remove(effect);
          disposeObjectResources(effect);
          if (entry.beam) { scene.remove(entry.beam); disposeObjectResources(entry.beam); }
          firstPersonEffects.splice(index, 1);
        }
      }
      if (deskClaimButtons.length) {
        const rect = renderer.domElement.getBoundingClientRect();
        const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
        for (const entry of deskClaimButtons) {
          const claiming = deskClaimingZoneIdRef.current === entry.zoneId;
          entry.button.disabled = !canClaimDeskRef.current || Boolean(deskClaimingZoneIdRef.current);
          entry.button.textContent = claiming ? "Claiming…" : "Claim";
          entry.button.title = canClaimDeskRef.current ? `Claim ${entry.zoneName}` : "You can claim one desk per office";
          const center = entry.anchor.clone().project(camera);
          const rightEdge = entry.anchor.clone().addScaledVector(cameraRight, entry.zoneLabel.scale.x * 0.5).project(camera);
          const isHovered = hoveredClaimZoneId === entry.zoneId;
          const visible = !firstPersonViewRef.current && isHovered && center.z >= -1 && center.z <= 1 && Math.abs(center.x) <= 1 && Math.abs(center.y) <= 1;
          entry.button.hidden = !visible;
          if (visible) {
            const x = (rightEdge.x + 1) * 0.5 * rect.width + 8;
            const y = (center.y * -0.5 + 0.5) * rect.height;
            entry.button.style.left = `${x}px`;
            entry.button.style.top = `${y}px`;
          }
        }
      }
      const activePlacementAsset = buildModeRef.current ? selectedAssetRef.current ?? null : null;
      if (activePlacementAsset !== placementGhostAsset) {
        placementGhostAsset = activePlacementAsset;
        placementGhostLoadId += 1;
        hasPlacementPointer = false;
        placementGhostModel.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        });
        placementGhostModel.clear();
        if (activePlacementAsset) {
          const loadId = placementGhostLoadId;
          const definition = ROOM_PROP_CATALOG.find((item) => item.asset === activePlacementAsset);
          if (definition) {
            const footprintWidth = definition.width;
            const footprintDepth = definition.depth;
            placementFootprint.geometry.dispose();
            placementFootprint.geometry = new THREE.BoxGeometry(footprintWidth, 0.025, footprintDepth);
            placementOutline.geometry.dispose();
            placementOutline.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(footprintWidth, 0.03, footprintDepth));
            const fill = placementFootprint.material as THREE.MeshBasicMaterial;
            fill.color.set(definition.collision ? "#ffb703" : "#219ebc");
            const outline = placementOutline.material as THREE.LineBasicMaterial;
            outline.color.set(definition.collision ? "#fb8500" : "#219ebc");
            const finishPlacementModel = (model: THREE.Object3D, isVehicle: boolean) => {
              if (disposed || loadId !== placementGhostLoadId || placementGhostAsset !== activePlacementAsset) {
                if (!isVehicle) disposeObjectResources(model);
                return;
              }
              if (isVehicle) fitVehicleToDriveScale(model);
              else {
                normalizeProp(model, definition.height);
                fitPropToFootprint(model, definition.width, definition.depth);
              }
              model.traverse((object) => {
                if (!(object instanceof THREE.Mesh)) return;
                object.castShadow = false;
                object.receiveShadow = false;
                const materials = Array.isArray(object.material) ? object.material : [object.material];
                object.material = materials.map((material) => {
                  const ghostMaterial = material.clone();
                  ghostMaterial.transparent = true;
                  ghostMaterial.opacity = 0.62;
                  ghostMaterial.depthWrite = false;
                  return ghostMaterial;
                });
                object.userData.sharedRoomPropMaterials = false;
              });
              placementGhostModel.add(model);
            };
            if (definition.vehicleId) {
              void getVehicleModel(definition.vehicleId).then((gltf) => finishPlacementModel(SkeletonUtils.clone(gltf.scene), true))
                .catch((error: unknown) => console.warn(`Could not load prop placement preview ${activePlacementAsset}.`, error));
            } else {
              loadObjModel(activePlacementAsset, (model) => finishPlacementModel(model, false), (error) => console.warn(`Could not load prop placement preview ${activePlacementAsset}.`, error));
            }
          }
        }
      }
      placementGhost.visible = Boolean(activePlacementAsset && hasPlacementPointer && campusOverviewRef.current && buildModeRef.current);
      if (placementGhost.visible) {
        placementGhost.position.set(placementGhostPosition.x, placementGhostElevation, placementGhostPosition.z);
      }
      const showMap2d = cameraStateRef.current.mode === "map2d";
      renderer.domElement.style.opacity = showMap2d ? "0" : "1";
      map2dCanvas.style.display = showMap2d ? "block" : "none";
      if (showMap2d) {
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(host.clientWidth * pixelRatio));
        const height = Math.max(1, Math.round(host.clientHeight * pixelRatio));
        const resized = map2dCanvas.width !== width || map2dCanvas.height !== height;
        if (resized) { map2dCanvas.width = width; map2dCanvas.height = height; }
        camera.updateMatrixWorld(true);
        let map2dDirty = !map2dWasVisible || resized;
        let cameraMatrixIndex = 0;
        for (const value of camera.matrixWorld.elements) {
          if (map2dCameraState[cameraMatrixIndex] !== value) map2dDirty = true;
          map2dCameraState[cameraMatrixIndex++] = value;
        }
        for (const value of camera.projectionMatrix.elements) {
          if (map2dCameraState[cameraMatrixIndex] !== value) map2dDirty = true;
          map2dCameraState[cameraMatrixIndex++] = value;
        }
        const overviewPlayers = playersRef.current;
        if (overviewPlayers.size !== map2dPlayerState.size) map2dDirty = true;
        for (const [id, player] of overviewPlayers) {
          const local = id === localId;
          const speaking = Boolean(speakingUsernamesRef?.current.has(player.username.trim().toLocaleLowerCase()));
          const cached = map2dPlayerState.get(id);
          if (!cached || cached.x !== player.x || cached.z !== player.z || cached.displayName !== player.displayName || cached.local !== local || cached.speaking !== speaking) map2dDirty = true;
          if (cached) { cached.x = player.x; cached.z = player.z; cached.displayName = player.displayName; cached.local = local; cached.speaking = speaking; }
          else map2dPlayerState.set(id, { x: player.x, z: player.z, displayName: player.displayName, local, speaking });
        }
        for (const id of map2dPlayerState.keys()) if (!overviewPlayers.has(id)) map2dPlayerState.delete(id);
        const ctx = map2dCanvas.getContext("2d");
        if (ctx && map2dDirty) {
          ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
          const w = host.clientWidth; const h = host.clientHeight;
          ctx.fillStyle = "#e9f0ed"; ctx.fillRect(0, 0, w, h);
          const projectMapPoint = (x: number, z: number, y = 0.04) => {
            const point = new THREE.Vector3(x + mapWorld.width / 2, y, z + mapWorld.depth / 2).project(camera);
            return { x: (point.x + 1) * w / 2, y: (1 - point.y) * h / 2 };
          };
          const drawMapRect = (x: number, z: number, width: number, depth: number, fill: string, stroke?: string) => {
            const corners = [projectMapPoint(x - width / 2, z - depth / 2), projectMapPoint(x + width / 2, z - depth / 2), projectMapPoint(x + width / 2, z + depth / 2), projectMapPoint(x - width / 2, z + depth / 2)];
            ctx.beginPath(); ctx.moveTo(corners[0]!.x, corners[0]!.y); corners.slice(1).forEach((point) => ctx.lineTo(point.x, point.y)); ctx.closePath();
            ctx.fillStyle = fill; ctx.fill();
            if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.4; ctx.stroke(); }
          };
          const floorCorners = [projectMapPoint(-mapWorld.width / 2, -mapWorld.depth / 2, 0), projectMapPoint(mapWorld.width / 2, -mapWorld.depth / 2, 0), projectMapPoint(mapWorld.width / 2, mapWorld.depth / 2, 0), projectMapPoint(-mapWorld.width / 2, mapWorld.depth / 2, 0)];
          ctx.beginPath(); ctx.moveTo(floorCorners[0]!.x, floorCorners[0]!.y); floorCorners.slice(1).forEach((point) => ctx.lineTo(point.x, point.y)); ctx.closePath(); ctx.fillStyle = "#f7f8f4"; ctx.fill(); ctx.strokeStyle = "#c7d3cf"; ctx.lineWidth = 1; ctx.stroke();
          for (const rect of mergeRoadwayRectangles(roomLayout?.roadways ?? [])) {
            drawMapRect((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2, rect.right - rect.left, rect.bottom - rect.top, ROAD_SURFACE_COLOR);
          }
          for (const road of roomLayout?.roadways ?? []) {
            const horizontal = road.width >= road.depth;
            const roadLength = horizontal ? road.width : road.depth;
            const roadWidth = horizontal ? road.depth : road.width;
            const major = road.kind === "major";
            const projectedCenter = projectMapPoint(road.x, road.z);
            const projectedX = projectMapPoint(road.x + 1, road.z);
            const projectedZ = projectMapPoint(road.x, road.z + 1);
            const pixelsPerMeterAlong = Math.max(0.001, Math.hypot(projectedX.x - projectedCenter.x, projectedX.y - projectedCenter.y) * (horizontal ? 1 : 0)
              + Math.hypot(projectedZ.x - projectedCenter.x, projectedZ.y - projectedCenter.y) * (horizontal ? 0 : 1));
            const pixelsPerMeterAcross = Math.max(0.001, Math.hypot(projectedX.x - projectedCenter.x, projectedX.y - projectedCenter.y) * (horizontal ? 0 : 1)
              + Math.hypot(projectedZ.x - projectedCenter.x, projectedZ.y - projectedCenter.y) * (horizontal ? 1 : 0));
            // World-sized paint becomes sub-pixel in 2D at campus zoom. Keep
            // markings legible in screen space without widening the asphalt.
            const markingWidth = Math.max(major ? 0.14 : 0.1, 1.25 / pixelsPerMeterAcross);
            const ranges = visibleRoadRanges(road, roomLayout?.roadways ?? []);
            for (const [start, end] of ranges) {
              for (const side of [-1, 1]) {
                const offset = side * (roadWidth / 2 - 0.28);
                if (horizontal) drawMapRect(road.x + (start + end) / 2, road.z + offset, end - start, markingWidth, "#e9eeee");
                else drawMapRect(road.x + offset, road.z + (start + end) / 2, markingWidth, end - start, "#e9eeee");
              }
              const dashLength = Math.max(major ? 2.8 : 1.5, 4 / pixelsPerMeterAlong);
              const dashGap = Math.max(major ? 2.4 : 2.5, 3 / pixelsPerMeterAlong);
              const phaseStart = -roadLength / 2 + 1.5;
              const firstDash = phaseStart + Math.max(0, Math.ceil((start - phaseStart) / (dashLength + dashGap))) * (dashLength + dashGap);
              for (let along = firstDash; along < end - 0.5; along += dashLength + dashGap) {
                const segment = Math.min(dashLength, end - 0.5 - along);
                if (segment <= 0) continue;
                const color = major ? "#f5c842" : "#e9eeee";
                if (horizontal) drawMapRect(road.x + along + segment / 2, road.z, segment, markingWidth, color);
                else drawMapRect(road.x, road.z + along + segment / 2, markingWidth, segment, color);
              }
            }
          }
          for (const zone of roomLayout?.zones ?? []) {
            drawMapRect(zone.x, zone.z, zone.width, zone.depth, zone.kind === "meeting" ? "#e8ddc6" : zone.kind === "restroom" ? "#d9e9f2" : "#e2e8e3", "#23495a");
            const center = projectMapPoint(zone.x, zone.z, 0.08);
            const occupied = [...overviewPlayers.values()].some((player) =>
              Math.abs(player.x - zone.x) <= zone.width / 2 && Math.abs(player.z - zone.z) <= zone.depth / 2);
            if (zone.kind === "private" && zone.ownerUsername?.trim()) {
              const ownerInitial = Array.from(zone.ownerUsername.trim())[0]!.toLocaleUpperCase();
              ctx.beginPath(); ctx.roundRect(center.x - 8, center.y - 7, 16, 14, 4); ctx.fillStyle = "#f0bd4e"; ctx.fill(); ctx.strokeStyle = "#76531d"; ctx.lineWidth = 1.5; ctx.stroke();
              ctx.fillStyle = "#183b4b"; ctx.font = "800 9px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(ownerInitial, center.x, center.y);
            }
            const localMapPlayer = localId ? playersRef.current.get(localId) : undefined;
            const withinRoomLabelRadius = Boolean(localMapPlayer
              && Math.hypot(zone.x - localMapPlayer.x, zone.z - localMapPlayer.z) <= ROOM_LABEL_RADIUS_BLOCKS);
            if (!occupied && !firstPersonViewRef.current && cameraRoomKeyRef.current === "lobby" && withinRoomLabelRadius && zone.kind !== "private" && zone.width > 16) { ctx.fillStyle = "#183b4b"; ctx.font = "600 10px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(zone.name, center.x, center.y); }
          }
          for (const [id, player] of playersRef.current) {
            const position = projectMapPoint(player.x, player.z, 0.18); const x = position.x; const z = position.y; const radius = 9;
            const words = player.displayName.trim().split(/\s+/).filter(Boolean);
            const initials = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0]?.slice(0, 2) ?? "?");
            ctx.beginPath(); ctx.arc(x, z, radius, 0, Math.PI * 2); ctx.fillStyle = id === localId ? "#159bb4" : "#51647c"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = "#fff"; ctx.font = "700 9px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(initials.toUpperCase(), x, z);
            if (speakingUsernamesRef?.current.has(player.username.trim().toLocaleLowerCase())) {
              const bubbleX = x + 12; const bubbleY = z - 16;
              ctx.beginPath(); ctx.roundRect(bubbleX - 14, bubbleY - 9, 30, 17, 8); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = "#c5e9ef"; ctx.lineWidth = 1; ctx.stroke();
              ctx.beginPath(); ctx.moveTo(bubbleX - 2, bubbleY + 7); ctx.lineTo(bubbleX + 4, bubbleY + 7); ctx.lineTo(bubbleX, bubbleY + 12); ctx.closePath(); ctx.fillStyle = "#fff"; ctx.fill();
              ctx.fillStyle = "#12839a"; ctx.font = "800 12px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("···", bubbleX + 1, bubbleY - 1);
            }
          }
        }
        map2dWasVisible = true;
      } else {
        map2dCanvas.style.display = "none";
        map2dWasVisible = false;
        renderer.render(scene, camera);
      }
      animationFrame = requestAnimationFrame(render);
    };
    animationFrame = requestAnimationFrame(render);

    return () => {
      if (draggingMapProp) endMapPropDrag(draggingMapProp);
      draggingMapProp = null;
      cameraPositionRef.current = camera.position.clone();
      cameraOcclusion.dispose();
      disposed = true;
      zoneLockIconsRef.current.clear();
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener("contextmenu", onCanvasContextMenu);
      renderer.domElement.removeEventListener("dblclick", onDoubleClick);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("pointerup", stopRotating);
      renderer.domElement.removeEventListener("pointercancel", stopRotating);
      renderer.domElement.removeEventListener("lostpointercapture", stopRotating);
      window.removeEventListener("keydown", onVehicleKeyDown);
      window.removeEventListener("keydown", onGhostModeKeyDown);
      window.removeEventListener("keyup", onGhostModeKeyUp);
      window.removeEventListener("blur", stopGhostKey);
      stopGhostKey();
      window.removeEventListener("keydown", onFirstPersonKeyDown);
      window.removeEventListener("keydown", onCameraViewKeyDown);
      window.removeEventListener("keydown", onJumpKeyDown, true);
      window.removeEventListener("pointerdown", primeBlasterAudio, true);
      window.removeEventListener("keydown", primeBlasterAudio);
      window.removeEventListener("keydown", onMapEditKeyDown);
      window.removeEventListener("keyup", onMapEditKeyUp);
      window.removeEventListener("blur", clearMapEditMovement);
      camera.remove(firstPersonViewModel);
      disposeObjectResources(firstPersonViewModel);
      for (const entry of firstPersonEffects) {
        scene.remove(entry.group);
        disposeObjectResources(entry.group);
        if (entry.beam) { scene.remove(entry.beam); disposeObjectResources(entry.beam); }
      }
      firstPersonEffects.length = 0;
      if (blasterAudio) void blasterAudio.close();
      furniturePieces.forEach(disposeObjectResources);
      campusPropTemplates.forEach(disposeObjectResources);
      if (floorTemplate) disposeObjectResources(floorTemplate);
      if (wallTemplate) disposeObjectResources(wallTemplate);
      fallbackFloor.geometry.dispose();
      (fallbackFloor.material as THREE.Material).dispose();
      (meetingRug.geometry).dispose();
      (meetingRug.material as THREE.Material).dispose();
      kenneyFloor.clear();
      kenneyWalls.clear();
      furniture.clear();
      campusRoot.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          if (!object.userData.sharedRoomPropGeometry) object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          if (!object.userData.sharedRoomPropMaterials) materials.forEach((material) => material.dispose());
        } else if (object instanceof THREE.Sprite) {
          object.material.map?.dispose();
          object.material.dispose();
        }
      });
      for (const [id, avatar] of avatars) {
        scene.remove(avatar);
        disposeAvatar(avatar);
      }
      for (const model of characterModels.values()) {
        void model.then((gltf) => disposeObjectResources(gltf.scene)).catch(() => undefined);
      }
      avatarAnimations.clear();
      avatarCharacterIds.clear();
      avatarStatusBadges.clear();
      fallbackParts.clear();
      for (const entry of roomPortalMeshes.values()) {
        entry.root.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => {
              if ("map" in material && material.map instanceof THREE.Texture) material.map.dispose();
              material.dispose();
            });
          } else if (object instanceof THREE.Sprite) {
            object.material.map?.dispose(); object.material.dispose();
          }
        });
      }
      renderer.dispose();
      map2dCanvas.remove(); map2dCanvasRef.current = null;
      scene.clear();
      deskClaimLayer.remove();
      renderer.domElement.remove();
    };
  }, [playersRef, localSessionIdRef, cameraYawRef, firstPersonViewRef, activeRoomKey, roomLayout, appPaused]);

  return (
    <>
      <div className="world-canvas" ref={hostRef} aria-label="Office map. Walk up to a parked vehicle and press E to drive. Press E again to get out." />
      {buildMode && movePropArmedId && <div className="modify-props-move-toast" role="status">Drag the selected prop on the map. Right-drag pans the camera.</div>}
      {buildMode && propActionMenu && <div ref={propActionMenuElementRef} className="prop-action-menu" style={{ left: propActionMenu.x, top: propActionMenu.y }} role="toolbar" aria-label="Actions for selected prop" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" title="Click, then left-drag on the map to move this prop" aria-label="Move prop" onClick={() => { onSelectMapItem?.(propActionMenu.id); onPlacementComplete?.(); movePropArmedIdRef.current = propActionMenu.id; setMovePropArmedId(propActionMenu.id); setPropActionMenu(null); }}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7M5 5v14" /></svg><span>Move</span></button>
        <button type="button" title="Rotate prop 90 degrees" aria-label="Rotate prop 90 degrees" onClick={() => { onSelectMapItem?.(propActionMenu.id); onRotateProp?.(propActionMenu.id); }}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 7v5h-5M20 12a8 8 0 1 1-2.34-5.66L20 9" /></svg><span>Rotate</span></button>
        <button type="button" className="is-danger" title="Delete prop" aria-label="Delete prop" onClick={() => { onDeleteProp?.(propActionMenu.id); onSelectMapItem?.(null); setPropActionMenu(null); }}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" /></svg><span>Delete</span></button>
      </div>}
      {campusOverview && <div className="map-compass" role="img" aria-label="Compass showing map direction relative to the camera">
        <div className="map-compass-rose" ref={compassRoseRef}>
          <span className="map-compass-north">N</span><span className="map-compass-east">E</span><span className="map-compass-south">S</span><span className="map-compass-west">W</span>
          <i className="map-compass-needle" />
        </div>
      </div>}
      {(nearbyVehicle || isDriving) && <div role="status" aria-live="polite" style={{ position: "absolute", zIndex: 6, left: "50%", bottom: "104px", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 9, padding: "9px 13px", border: "1px solid rgba(255,255,255,.32)", borderRadius: 12, background: "rgba(2,48,71,.92)", color: "#f4fbff", boxShadow: "0 8px 24px rgba(2,26,39,.24)", fontSize: 12, fontWeight: 650, pointerEvents: "none", whiteSpace: "nowrap" }}>
        <kbd style={{ minWidth: 23, padding: "3px 6px", border: "1px solid rgba(255,255,255,.35)", borderRadius: 6, background: "rgba(255,255,255,.12)", font: "inherit", textAlign: "center" }}>E</kbd>
        {isDriving ? "Exit vehicle" : "Drive vehicle"}
      </div>}
      {campusOverview && !mapEditMode && !buildMode && <div className="world-control-dock" aria-label="Map controls">
        <div className="world-control-group" role="group" aria-label="Character actions">
          <button data-tutorial-target="office-focus-character" type="button" className="world-control-trigger" aria-label="Focus character" title="Focus character" onClick={() => { setActiveFloatingGroup(null); dispatchCamera({ type: "focus-character" }); }}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s7-6.2 7-13a7 7 0 1 0-14 0c0 6.8 7 13 7 13Z"/><circle cx="12" cy="9" r="2.3"/></svg>
          </button>
          {personalDeskZone && currentPrivateZoneId !== personalDeskZone.id && <button type="button" className="world-control-trigger" aria-label="Go to your desk" title="Go to your desk" disabled={appPaused} onClick={() => { setActiveFloatingGroup(null); buildCallbacksRef.current.onAutoMove?.({ x: personalDeskZone.x, z: personalDeskZone.z }, false); }}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11.5 20 4l-7.5 17-2.2-7.3L3 11.5Z"/><path d="m10.3 13.7 4.6-4.6"/></svg>
          </button>}
        </div>
        {(canEditMap && onEditMap || onModifyProps) && <div className={`world-control-group${activeFloatingGroup === "edit" ? " is-active" : ""}`}>
          {activeFloatingGroup === "edit" && <div className="world-control-actions" id="map-edit-actions" role="group" aria-label="Editing actions">
            {onModifyProps && <button type="button" className="modify-props-control" aria-label="Modify props" title="Modify props" onClick={() => { setActiveFloatingGroup(null); onModifyProps(); }}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m14 6 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/><path d="M13 7 17 11"/></svg>
            </button>}
            {canEditMap && onEditMap && <button type="button" className="edit-map-control" aria-label={mapEditorUsername ? `Map is being edited by ${mapEditorUsername}` : "Edit map"} title={mapEditorUsername ? `Map is being edited by ${mapEditorUsername}` : "Edit map"} disabled={mapEditLockPending || Boolean(mapEditorUsername)} onClick={() => { setActiveFloatingGroup(null); onEditMap(); }}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6.5 8 4l8 2.5L21 4v13.5L16 20l-8-2.5L3 20V6.5Z"/><path d="M8 4v13.5M16 6.5V20M12.4 13.6l5.9-5.9 2 2-5.9 5.9-2.6.6.6-2.6Z"/></svg>
            </button>}
          </div>}
          <button type="button" className="world-control-trigger" aria-label="Editing tools" title="Editing tools" aria-expanded={activeFloatingGroup === "edit"} aria-controls="map-edit-actions" onClick={() => setActiveFloatingGroup((group) => group === "edit" ? null : "edit")}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m14 6 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/><path d="M13 7 17 11"/></svg>
          </button>
        </div>}
        <div className={`world-control-group${activeFloatingGroup === "view" ? " is-active" : ""}`}>
          {activeFloatingGroup === "view" && <div className="world-control-actions" id="map-view-actions" role="group" aria-label="Camera actions">
            <button type="button" className="camera-view-control" aria-label={firstPersonView ? "Switch to third-person view" : "Switch to first-person view"} title={firstPersonView ? "Third-person view · V" : "First-person view · V"} onClick={toggleCameraView}>
              {firstPersonView ? "3P" : "1P"}
            </button>
            {firstPersonView && <button type="button" className={`weapon-inventory-control${weaponInventoryOpen ? " is-active" : ""}`} aria-label={weaponInventoryOpen ? "Close weapon inventory" : "Open weapon inventory"} title="Weapon inventory · B" onClick={() => { setWeaponInventoryOpen((open) => !open); if (!weaponInventoryOpen && document.pointerLockElement) document.exitPointerLock(); }}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m4 15 5-5 3 1 3-3 2 2-3 3 1 3-5 5-2-2 2-3-2-2-3 2-2-2Z"/><path d="m14 7 3-3 3 3-3 3M5 19l-2 2"/></svg>
            </button>}
          </div>}
          <button type="button" className="world-control-trigger" aria-label="Camera controls" title="Camera controls" aria-expanded={activeFloatingGroup === "view"} aria-controls="map-view-actions" onClick={() => setActiveFloatingGroup((group) => group === "view" ? null : "view")}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7.5h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H3z"/><path d="m16 10 5-3v10l-5-3"/><circle cx="8.5" cy="12" r="2.2"/></svg>
          </button>
        </div>
        <div className={`world-control-group${activeFloatingGroup === "zoom" ? " is-active" : ""}`}>
          {activeFloatingGroup === "zoom" && <div className="world-control-actions" id="map-zoom-actions" role="group" aria-label="Zoom actions">
            {cameraState.mode === "tpp" || cameraState.mode === "free" && !cameraState.editing ? <div className="overview-zoom-controls tpp-zoom-controls" role="group" aria-label="3D camera distance">
              <button className="tpp-zoom-nudge" type="button" aria-label="Zoom in 10 meters" title="Zoom in 10 m" disabled={cameraState.distanceM <= CAMERA.minZoom} onClick={() => { dispatchCamera({ type: "distance", distanceM: cameraStateRef.current.distanceM - CAMERA.zoomStep, maxDistanceM: tppZoomMaxDistanceM }); }}>−</button>
              <div className="tpp-zoom-panel">
                <div className="tpp-zoom-readout"><output aria-label="Current camera distance">{Math.round(cameraState.distanceM)} m</output></div>
              </div>
              <button className="tpp-zoom-nudge" type="button" aria-label={campusOverview ? "Zoom out 10 meters or switch to 2D" : "Zoom out 10 meters"} title={campusOverview ? "Zoom out 10 m · switch to 2D at map limit" : "Zoom out 10 m"} disabled={cameraState.distanceM >= tppZoomMaxDistanceM} onClick={() => { const distanceM = cameraStateRef.current.distanceM + CAMERA.zoomStep; if (campusOverview && distanceM >= tppTransitionDistanceMRef.current) dispatchCamera({ type: "zoom", ratio: CAMPUS_2D_ZOOM_THRESHOLD_RATIO, distanceM: tppTransitionDistanceMRef.current }); else dispatchCamera({ type: "distance", distanceM, maxDistanceM: tppZoomMaxDistanceM }); }}>+</button>
            </div> : <div className="overview-zoom-controls"><button type="button" aria-label="Zoom in one level" title="Zoom in 1×" onClick={() => { dispatchCamera({ type: "zoom", ratio: cameraStateRef.current.zoomRatio / CAMERA_ZOOM_BUTTON_RATIO }); }}>+</button><button type="button" aria-label="Zoom out one level" title="Zoom out 1×" onClick={() => { dispatchCamera({ type: "zoom", ratio: cameraStateRef.current.zoomRatio * CAMERA_ZOOM_BUTTON_RATIO }); }}>−</button></div>}
          </div>}
          <button type="button" className="world-control-trigger" aria-label="Zoom controls" title="Zoom controls" aria-expanded={activeFloatingGroup === "zoom"} aria-controls="map-zoom-actions" onClick={() => setActiveFloatingGroup((group) => group === "zoom" ? null : "zoom")}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5M8 10.8h5.6M10.8 8v5.6"/></svg>
          </button>
        </div>
      </div>}
      {campusOverview && firstPersonView && !buildMode && <span className="camera-aim-reticle" aria-hidden="true" />}
      {campusOverview && firstPersonView && !buildMode && weaponInventoryOpen && <section className="weapon-inventory" role="dialog" aria-label="Weapon inventory">
        <header><div><span className="eyebrow">FIRST PERSON</span><h2>Weapon inventory</h2></div><button type="button" aria-label="Close weapon inventory" onClick={() => setWeaponInventoryOpen(false)}>×</button></header>
        <div className="weapon-inventory-grid" role="listbox" aria-label="Choose a blaster">
          {KENNEY_BLASTER_IDS.map((weaponId) => <button key={weaponId} className={`weapon-inventory-card${selectedBlasterId === weaponId ? " is-selected" : ""}`} type="button" role="option" aria-selected={selectedBlasterId === weaponId} onClick={() => { setSelectedBlasterId(weaponId); selectedBlasterIdRef.current = weaponId; buildCallbacksRef.current.onWeaponEquip?.(weaponId); setWeaponInventoryOpen(false); }}>
            <img src={`/assets/kenney/blaster-kit/Previews/${weaponId}.png`} alt="" loading="lazy" />
            <span>Blaster {weaponId.slice(-1).toUpperCase()}</span>
            {selectedBlasterId === weaponId && <small>Equipped</small>}
          </button>)}
        </div>
        <p>18 Kenney Blaster Kit models · Press B to close · Click the scene to fire.</p>
      </section>}
    </>
  );
}

