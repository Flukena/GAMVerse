import * as THREE from "three";

type JointPose = {
  bone: THREE.Object3D;
  rest: THREE.Quaternion;
  armDrop?: THREE.Quaternion;
  armSwingAxis?: THREE.Vector3;
  axisA: THREE.Vector3;
  axisB: THREE.Vector3;
  deltaA: THREE.Quaternion;
  deltaB: THREE.Quaternion;
};

export type ProceduralHumanoidRig = {
  leftArm?: JointPose;
  rightArm?: JointPose;
  leftForearm?: JointPose;
  rightForearm?: JointPose;
  leftLeg?: JointPose;
  rightLeg?: JointPose;
  leftShin?: JointPose;
  rightShin?: JointPose;
  leftFoot?: JointPose;
  rightFoot?: JointPose;
};

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const MIXAMO_BONE_NAMES = {
  leftArm: ["mixamorig:LeftArm", "LeftArm", "LeftUpperArm", "J_Bip_L_UpperArm", "upperarm.l", "upperarml"],
  rightArm: ["mixamorig:RightArm", "RightArm", "RightUpperArm", "J_Bip_R_UpperArm", "upperarm.r", "upperarmr"],
  leftForearm: ["mixamorig:LeftForeArm", "LeftForeArm", "LeftLowerArm", "J_Bip_L_LowerArm", "lowerarm.l", "lowerarml"],
  rightForearm: ["mixamorig:RightForeArm", "RightForeArm", "RightLowerArm", "J_Bip_R_LowerArm", "lowerarm.r", "lowerarmr"],
  leftLeg: ["mixamorig:LeftUpLeg", "LeftUpLeg", "LeftUpperLeg", "J_Bip_L_UpperLeg", "upperleg.l", "upperlegl"],
  rightLeg: ["mixamorig:RightUpLeg", "RightUpLeg", "RightUpperLeg", "J_Bip_R_UpperLeg", "upperleg.r", "upperlegr"],
  leftShin: ["mixamorig:LeftLeg", "LeftLeg", "LeftLowerLeg", "J_Bip_L_LowerLeg", "lowerleg.l", "lowerlegl"],
  rightShin: ["mixamorig:RightLeg", "RightLeg", "RightLowerLeg", "J_Bip_R_LowerLeg", "lowerleg.r", "lowerlegr"],
  leftFoot: ["mixamorig:LeftFoot", "LeftFoot", "J_Bip_L_Foot", "foot.l"],
  rightFoot: ["mixamorig:RightFoot", "RightFoot", "J_Bip_R_Foot", "foot.r"],
} as const;

function joint(root: THREE.Object3D, names: readonly string[], axisA = AXIS_Z, axisB = AXIS_X): JointPose | undefined {
  const bone = names.map((name) => root.getObjectByName(name)).find((object) => object instanceof THREE.Bone);
  if (!bone) return undefined;
  return {
    bone,
    rest: bone.quaternion.clone(),
    axisA,
    axisB,
    deltaA: new THREE.Quaternion(),
    deltaB: new THREE.Quaternion(),
  };
}

function armJoint(root: THREE.Object3D, boneNames: readonly string[], lowerArmNames: readonly string[]): JointPose | undefined {
  const pose = joint(root, boneNames);
  const forearm = lowerArmNames.map((name) => root.getObjectByName(name)).find((object) => object instanceof THREE.Bone);
  if (!pose || !forearm || !pose.bone.parent) return pose;

  pose.bone.updateWorldMatrix(true, false);
  forearm.updateWorldMatrix(true, false);
  const upperPosition = pose.bone.getWorldPosition(new THREE.Vector3());
  const lowerPosition = forearm.getWorldPosition(new THREE.Vector3());
  const restDirection = lowerPosition.sub(upperPosition).normalize();
  const side = restDirection.clone().setY(0).normalize();
  if (side.lengthSq() < 0.001) side.set(boneNames[0].includes("Right") || boneNames[0].endsWith(".r") ? 1 : -1, 0, 0);
  // Keep a broad, visible A-pose rather than pointing straight down; the fully
  // vertical target let chunky KayKit arm meshes overlap the torso.
  const targetWorldDirection = side.multiplyScalar(0.62).add(new THREE.Vector3(0, -1, 0)).normalize();
  const parentRotation = pose.bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const inverseParentRotation = parentRotation.invert();
  const rootRotation = root.getWorldQuaternion(new THREE.Quaternion());
  const armSwingAxis = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(rootRotation)
    .cross(new THREE.Vector3(0, 0, 1).applyQuaternion(rootRotation))
    .normalize()
    .applyQuaternion(inverseParentRotation)
    .normalize();
  restDirection.applyQuaternion(inverseParentRotation);
  targetWorldDirection.applyQuaternion(inverseParentRotation);
  pose.armDrop = new THREE.Quaternion().setFromUnitVectors(restDirection, targetWorldDirection);
  pose.armSwingAxis = armSwingAxis;
  return pose;
}

export function createProceduralHumanoidRig(root: THREE.Object3D): ProceduralHumanoidRig | null {
  const rig: ProceduralHumanoidRig = {
    leftArm: armJoint(root, MIXAMO_BONE_NAMES.leftArm, MIXAMO_BONE_NAMES.leftForearm),
    rightArm: armJoint(root, MIXAMO_BONE_NAMES.rightArm, MIXAMO_BONE_NAMES.rightForearm),
    leftForearm: joint(root, MIXAMO_BONE_NAMES.leftForearm),
    rightForearm: joint(root, MIXAMO_BONE_NAMES.rightForearm),
    leftLeg: joint(root, MIXAMO_BONE_NAMES.leftLeg, AXIS_X, AXIS_Z),
    rightLeg: joint(root, MIXAMO_BONE_NAMES.rightLeg, AXIS_X, AXIS_Z),
    leftShin: joint(root, MIXAMO_BONE_NAMES.leftShin, AXIS_X, AXIS_Z),
    rightShin: joint(root, MIXAMO_BONE_NAMES.rightShin, AXIS_X, AXIS_Z),
    leftFoot: joint(root, MIXAMO_BONE_NAMES.leftFoot, AXIS_X, AXIS_Z),
    rightFoot: joint(root, MIXAMO_BONE_NAMES.rightFoot, AXIS_X, AXIS_Z),
  };
  return rig.leftArm && rig.rightArm && rig.leftLeg && rig.rightLeg ? rig : null;
}

function setPose(pose: JointPose | undefined, primary: number, secondary = 0) {
  if (!pose) return;
  pose.deltaA.setFromAxisAngle(pose.axisA, primary);
  pose.deltaB.setFromAxisAngle(pose.axisB, secondary);
  pose.bone.quaternion.copy(pose.rest).multiply(pose.deltaA).multiply(pose.deltaB);
}

/** Lower Mixamo/VRM T-pose arms and add a small alternating gait to its humanoid rig. */
export function updateProceduralHumanoidRig(rig: ProceduralHumanoidRig, phase: number, moving: boolean, sprinting: boolean, idleEnabled: boolean) {
  const stride = moving ? Math.sin(phase) * (sprinting ? 0.48 : 0.31) : 0;
  const armSwing = moving ? stride * 1.25 : idleEnabled ? Math.sin(phase) * 0.055 : 0;
  const kneeBend = moving ? Math.max(0, Math.cos(phase)) * (sprinting ? 0.48 : 0.32) : 0;
  const idleSway = idleEnabled && !moving ? Math.sin(phase) * 0.025 : 0;

  // Apply the lowered pose first, then swing the arms in opposite directions
  // around the character's forward/back gait axis.
  if (rig.leftArm?.armDrop && rig.leftArm.armSwingAxis) {
    rig.leftArm.deltaA.setFromAxisAngle(rig.leftArm.armSwingAxis, -armSwing);
    rig.leftArm.bone.quaternion.copy(rig.leftArm.rest).premultiply(rig.leftArm.armDrop).premultiply(rig.leftArm.deltaA);
  }
  else setPose(rig.leftArm, 1.12, moving ? -stride * 0.52 : idleSway);
  if (rig.rightArm?.armDrop && rig.rightArm.armSwingAxis) {
    rig.rightArm.deltaA.setFromAxisAngle(rig.rightArm.armSwingAxis, armSwing);
    rig.rightArm.bone.quaternion.copy(rig.rightArm.rest).premultiply(rig.rightArm.armDrop).premultiply(rig.rightArm.deltaA);
  }
  else setPose(rig.rightArm, -1.12, moving ? stride * 0.52 : -idleSway);
  setPose(rig.leftForearm, 0.1);
  setPose(rig.rightForearm, -0.1);

  setPose(rig.leftLeg, stride);
  setPose(rig.rightLeg, -stride);
  setPose(rig.leftShin, kneeBend);
  setPose(rig.rightShin, Math.max(0, -Math.cos(phase)) * (moving ? (sprinting ? 0.48 : 0.32) : 0));
  setPose(rig.leftFoot, -kneeBend * 0.45);
  setPose(rig.rightFoot, -Math.max(0, -Math.cos(phase)) * (moving ? (sprinting ? 0.22 : 0.14) : 0));
}
