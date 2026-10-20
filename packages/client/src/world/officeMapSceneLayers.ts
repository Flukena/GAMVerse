import { type Group, type Object3D } from "three";
import { StaticSceneGroup } from "./staticSceneGroup";

const PICK_TARGETS_LABEL = "Office editor pick targets";
const COLLISION_OVERLAYS_LABEL = "Office editor collision overlays";
const SELECTIONS_LABEL = "Office editor selections";

/** Hidden picking geometry still participates in Three.js recursive raycasts. */
export class OfficeMapSceneLayers {
  readonly pickTargets = new StaticSceneGroup();
  readonly collisionOverlays = new StaticSceneGroup();
  readonly selections = new StaticSceneGroup();

  constructor(parent: Group) {
    this.pickTargets.name = PICK_TARGETS_LABEL;
    this.pickTargets.visible = false;
    this.collisionOverlays.name = COLLISION_OVERLAYS_LABEL;
    this.collisionOverlays.visible = false;
    this.selections.name = SELECTIONS_LABEL;
    this.selections.visible = false;
    parent.add(this.pickTargets, this.collisionOverlays, this.selections);
  }

  setEditing(editing: boolean) {
    this.collisionOverlays.visible = editing;
    this.selections.visible = editing;
  }

  syncVehicleHandles(handles: readonly Object3D[], position: { x: number; z: number }) {
    for (const handle of handles) {
      if (handle.position.x === position.x && handle.position.z === position.z) continue;
      handle.position.x = position.x;
      handle.position.z = position.z;
      if (handle.parent instanceof StaticSceneGroup) handle.parent.invalidate();
    }
  }

  moveProp(parent: Group, propId: string, offset: { x: number; y: number; z: number }) {
    for (const root of this.propRoots(parent)) {
      if (root.userData.officeMapPropId !== propId) continue;
      root.position.x += offset.x;
      root.position.y += offset.y;
      root.position.z += offset.z;
      if (!root.matrixAutoUpdate) root.updateMatrix();
    }
    this.pickTargets.invalidate();
    this.collisionOverlays.invalidate();
    this.selections.invalidate();
  }

  *propRoots(parent: Group): Iterable<Object3D> {
    yield* parent.children;
    yield* this.pickTargets.children;
    yield* this.collisionOverlays.children;
    yield* this.selections.children;
  }
}
