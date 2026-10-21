import * as THREE from "three";

const CHARACTER_HALF_HEIGHT_M = 0.775;
const LYING_BODY_CLEARANCE_M = 0.12;
const ORIGIN_M = new THREE.Vector3();
const REST_ROTATION_RAD = new THREE.Euler();

/** Rotate a standing model onto the mattress, centered on its seat anchor. */
export function applyLyingCharacterPose(model: THREE.Object3D, lying: boolean,
  restPosition: THREE.Vector3 = ORIGIN_M, restRotation: THREE.Euler = REST_ROTATION_RAD, forwardSign = 1): void {
  model.rotation.x = lying ? restRotation.x - forwardSign * Math.PI / 2 : restRotation.x;
  model.position.z = restPosition.z + (lying ? forwardSign * CHARACTER_HALF_HEIGHT_M : 0);
  if (!lying && model.userData.characterLying) model.position.y = restPosition.y;
  if (lying) {
    model.rotation.y = restRotation.y;
    model.rotation.z = restRotation.z;
    model.position.y = LYING_BODY_CLEARANCE_M;
  }
  model.userData.characterLying = lying;
}
