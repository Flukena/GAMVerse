import { CAMPUS_WORLD, ROOM_PROP_CATALOG, WORLD, roomBoundaryWalls, roomPropCollisionFootprint, roomWallSolidSegments, type RoomLayout } from "@gammyverse/shared";
import { BoxGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import type { CameraPose } from "./cameraPose";
import type { CameraMode } from "./cameraState";
import { CAMERA_COLLISION_PADDING_M, CAMERA_FALLBACK_PROP_HEIGHT_M, CAMERA_FALLBACK_WALL_HEIGHT_M, CAMERA_MIN_DISTANCE_M, CAMPUS_BOUNDARY_WALL_HEIGHT_M } from "./constants";
import { resolveSpringArmDistance } from "./springArm";

type ColliderBox = { x: number; z: number; width: number; depth: number; height: number; elevation: number };

function wallBoxes(layout: RoomLayout): ColliderBox[] {
  return layout.walls.flatMap((wall) => roomWallSolidSegments(wall, layout.doors).map(({ start, end }) => ({
    x: wall.x + (wall.axis === "horizontal" ? (start + end) / 2 : 0),
    z: wall.z + (wall.axis === "vertical" ? (start + end) / 2 : 0),
    width: wall.axis === "horizontal" ? end - start : wall.thickness,
    depth: wall.axis === "vertical" ? end - start : wall.thickness,
    height: wall.height, elevation: 0,
  })));
}

function propBoxes(layout: RoomLayout): ColliderBox[] {
  return layout.props.filter((prop) => prop.collision).map((prop) => ({
    x: prop.x, z: prop.z, ...roomPropCollisionFootprint(prop),
    height: ROOM_PROP_CATALOG.find((definition) => definition.asset === prop.asset)?.height ?? CAMERA_FALLBACK_PROP_HEIGHT_M,
    elevation: prop.elevation ?? 0,
  }));
}

/** Owns static collision proxies; no scene traversal or model-load dependency. */
export class CameraColliders {
  private readonly material = new MeshBasicMaterial({ side: DoubleSide });
  private readonly meshes: Mesh[];
  private readonly raycaster = new Raycaster();
  private readonly direction = new Vector3();
  private readonly intersections: ReturnType<Raycaster["intersectObjects"]> = [];
  private previousDistanceM: number | null = null;

  constructor(layout: RoomLayout | null, offset: { x: number; z: number }, campus = false) {
    const world = campus ? CAMPUS_WORLD : WORLD;
    const boxes = layout ? [...wallBoxes(layout), ...propBoxes(layout)] : [
      ...world.walls.map((wall) => ({ ...wall, height: campus ? CAMPUS_BOUNDARY_WALL_HEIGHT_M : CAMERA_FALLBACK_WALL_HEIGHT_M, elevation: 0 })),
      ...world.obstacles.map((prop) => ({ ...prop, height: CAMERA_FALLBACK_PROP_HEIGHT_M, elevation: 0 })),
    ];
    if (campus && layout) {
      const widthM = layout.dimensions?.width ?? CAMPUS_WORLD.width;
      const depthM = layout.dimensions?.depth ?? CAMPUS_WORLD.depth;
      boxes.push(...roomBoundaryWalls(widthM, depthM).map((wall) => ({ ...wall, height: CAMPUS_BOUNDARY_WALL_HEIGHT_M, elevation: 0 })));
    }
    this.meshes = boxes.map((box) => {
      const mesh = new Mesh(new BoxGeometry(box.width, box.height, box.depth), this.material);
      mesh.position.set(box.x + offset.x, box.elevation + box.height / 2, box.z + offset.z);
      mesh.updateMatrixWorld(true);
      return mesh;
    });
  }

  apply(pose: CameraPose, mode: CameraMode, deltaSec: number, snap: boolean): CameraPose {
    if (mode !== "tpp") {
      this.previousDistanceM = null;
      return pose;
    }
    this.direction.copy(pose.position).sub(pose.lookAt);
    const desiredM = this.direction.length();
    if (desiredM === 0) return pose;
    this.direction.divideScalar(desiredM);
    this.raycaster.set(pose.lookAt, this.direction);
    this.raycaster.far = desiredM;
    this.intersections.length = 0;
    this.raycaster.intersectObjects(this.meshes, false, this.intersections);
    const distanceM = resolveSpringArmDistance({
      desired: desiredM, hit: this.intersections[0]?.distance ?? null,
      padding: CAMERA_COLLISION_PADDING_M, min: CAMERA_MIN_DISTANCE_M,
      previous: snap ? null : this.previousDistanceM, deltaSec,
    });
    this.previousDistanceM = distanceM;
    return { ...pose, position: pose.lookAt.clone().addScaledVector(this.direction, distanceM) };
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.geometry.dispose();
    this.material.dispose();
  }
}
