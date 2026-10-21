import * as THREE from "three";
import type { RoomLayoutProp } from "@gammyverse/shared";
import { StaticSceneGroup } from "./staticSceneGroup";
import type { RoadsideSceneryVisibility } from "./roadsideScenery";

export function isInstancedScenery(catalog: {
  asset: string; label: string; geometry?: unknown; vehicleId?: unknown; interaction?: unknown; supportsPlacement?: unknown;
} | undefined) {
  if (!catalog || catalog.geometry || catalog.vehicleId || catalog.interaction || catalog.supportsPlacement) return false;
  return /tree|rock|bush|shrub|flower|plant/i.test(`${catalog.asset} ${catalog.label}`);
}

export function createInstancedSceneryBatches(
  template: THREE.Group,
  props: readonly RoomLayoutProp[],
  world: { width: number; depth: number },
  roadside: RoadsideSceneryVisibility,
) {
  template.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  template.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  const rootMatrix = new THREE.Matrix4();
  const instanceMatrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3(1, 1, 1);
  return roadside.splitInstancedProps(props).map(placements => {
    const batch = new StaticSceneGroup();
    batch.name = `Instanced scenery ${placements[0].asset}`;
    const layers: { instances: THREE.InstancedMesh; matrices: THREE.Matrix4[] }[] = [];
    for (const source of meshes) {
      const matrices: THREE.Matrix4[] = [];
      const instances = new THREE.InstancedMesh(source.geometry, source.material, placements.length);
      instances.castShadow = true;
      instances.receiveShadow = true;
      instances.raycast = () => {};
      instances.userData.sharedRoomPropGeometry = true;
      instances.userData.sharedRoomPropMaterials = true;
      placements.forEach((prop, index) => {
        position.set(prop.x + world.width / 2, prop.elevation ?? 0, prop.z + world.depth / 2);
        rotation.setFromAxisAngle(up, prop.rotation);
        rootMatrix.compose(position, rotation, scale);
        instanceMatrix.copy(rootMatrix).multiply(source.matrixWorld);
        instances.setMatrixAt(index, instanceMatrix);
        matrices.push(instanceMatrix.clone());
      });
      instances.instanceMatrix.needsUpdate = true;
      batch.add(instances);
      layers.push({ instances, matrices });
    }
    // Instances beyond the render radius are dropped individually, not per chunk.
    roadside.registerInstances(placements.map(prop => prop.id), visible => {
      for (const { instances, matrices } of layers) {
        let count = 0;
        matrices.forEach((matrix, index) => { if (visible[index]) instances.setMatrixAt(count++, matrix); });
        instances.count = count;
        instances.instanceMatrix.needsUpdate = true;
      }
      batch.visible = visible.some(Boolean);
    });
    return batch;
  });
}