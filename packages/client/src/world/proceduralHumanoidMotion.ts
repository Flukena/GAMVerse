import * as THREE from "three";

type JointPose = {
  bone: THREE.Object3D;
  rest: THREE.Quaternion;
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
  leftArm: ["mixamorig:LeftArm", "mixamorigLeftArm", "LeftArm", "LeftUpperArm", "J_Bip_L_UpperArm", "upperarm.l", "upperarml"],
  rightArm: ["mixamorig:RightArm", "mixamorigRightArm", "RightArm", "RightUpperArm", "J_Bip_R_UpperArm", "upperarm.r", "upperarmr"],
  leftForearm: ["mixamorig:LeftForeArm", "mixamorigLeftForeArm", "LeftForeArm", "LeftLowerArm", "J_Bip_L_LowerArm", "lowerarm.l", "lowerarml"],
  rightForearm: ["mixamorig:RightForeArm", "mixamorigRightForeArm", "RightForeArm", "RightLowerArm", "J_Bip_R_LowerArm", "lowerarm.r", "lowerarmr"],
  leftLeg: ["mixamorig:LeftUpLeg", "mixamorigLeftUpLeg", "LeftUpLeg", "LeftUpperLeg", "J_Bip_L_UpperLeg", "upperleg.l", "upperlegl"],
  rightLeg: ["mixamorig:RightUpLeg", "mixamorigRightUpLeg", "RightUpLeg", "RightUpperLeg", "J_Bip_R_UpperLeg", "upperleg.r", "upperlegr"],
  leftShin: ["mixamorig:LeftLeg", "mixamorigLeftLeg", "LeftLeg", "LeftLowerLeg", "J_Bip_L_LowerLeg", "lowerleg.l", "lowerlegl"],
  rightShin: ["mixamorig:RightLeg", "mixamorigRightLeg", "RightLeg", "RightLowerLeg", "J_Bip_R_LowerLeg", "lowerleg.r", "lowerlegr"],
  leftFoot: ["mixamorig:LeftFoot", "mixamorigLeftFoot", "LeftFoot", "J_Bip_L_Foot", "foot.l"],
  rightFoot: ["mixamorig:RightFoot", "mixamorigRightFoot", "RightFoot", "J_Bip_R_Foot", "foot.r"],
} as const;

function joint(root: THREE.Object3D, names: readonly string[], axisA = AXIS_Z, axisB = AXIS_X): JointPose | undefined {
  const bone = names.map((name) => root.getObjectByName(name)).find((object): object is THREE.Object3D => Boolean(object));
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

export function createProceduralHumanoidRig(root: THREE.Object3D): ProceduralHumanoidRig | null {
  const rig: ProceduralHumanoidRig = {
    leftArm: joint(root, MIXAMO_BONE_NAMES.leftArm),
    rightArm: joint(root, MIXAMO_BONE_NAMES.rightArm),
    leftForearm: joint(root, MIXAMO_BONE_NAMES.leftForearm),
    rightForearm: joint(root, MIXAMO_BONE_NAMES.rightForearm),
    leftLeg: joint(root, MIXAMO_BONE_NAMES.leftLeg, AXIS_X, AXIS_Z),
    rightLeg: joint(root, MIXAMO_BONE_NAMES.rightLeg, AXIS_X, AXIS_Z),
    leftShin: joint(root, MIXAMO_BONE_NAMES.leftShin, AXIS_X, AXIS_Z),
    rightShin: joint(root, MIXAMO_BONE_NAMES.rightShin, AXIS_X, AXIS_Z),
    leftFoot: joint(root, MIXAMO_BONE_NAMES.leftFoot, AXIS_X, AXIS_Z),
    rightFoot: joint(root, MIXAMO_BONE_NAMES.rightFoot, AXIS_X, AXIS_Z),
  };
  // Arm pose correction must still run for humanoid rigs that omit or rename
  // their leg bones. Requiring all four limbs caused some otherwise valid
  // models (including Jimmy) to fall back to their source T-pose.
  return rig.leftArm && rig.rightArm ? rig : null;
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

  // The source packs use a consistent Mixamo local arm axis. Applying the
  // correction in bone-local space avoids world-direction calculations that
  // can silently leave some rigs at their imported T-pose.
  setPose(rig.leftArm, 1.12, moving ? -stride * 0.52 : idleSway);
  setPose(rig.rightArm, -1.12, moving ? stride * 0.52 : -idleSway);
  setPose(rig.leftForearm, 0.1);
  setPose(rig.rightForearm, -0.1);

  setPose(rig.leftLeg, stride);
  setPose(rig.rightLeg, -stride);
  setPose(rig.leftShin, kneeBend);
  setPose(rig.rightShin, Math.max(0, -Math.cos(phase)) * (moving ? (sprinting ? 0.48 : 0.32) : 0));
  setPose(rig.leftFoot, -kneeBend * 0.45);
  setPose(rig.rightFoot, -Math.max(0, -Math.cos(phase)) * (moving ? (sprinting ? 0.22 : 0.14) : 0));
}
