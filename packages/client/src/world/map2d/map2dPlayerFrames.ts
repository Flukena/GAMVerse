import { smoothAvatarPose, isPoseSettled } from "./avatarPoseSmoother";
import { advanceMap2dAvatarVisual, createMap2dAvatarVisual, type Map2dPlayer, type Map2dRenderedPlayer } from "./map2dAvatarVisual";

function sameMetadata(current: Map2dPlayer, target: Map2dPlayer): boolean {
  return current.displayName === target.displayName && current.username === target.username && current.isMaintainer === target.isMaintainer &&
    current.status === target.status && current.handRaised === target.handRaised && current.characterId === target.characterId && current.sittingPropId === target.sittingPropId;
}
function writeMetadata(current: Map2dPlayer, target: Map2dPlayer): void {
  current.displayName = target.displayName;
  current.isMaintainer = target.isMaintainer;
  current.username = target.username;
  current.status = target.status;
  current.handRaised = target.handRaised;
  current.characterId = target.characterId;
  current.sittingPropId = target.sittingPropId;
}
function updatePlayer(current: Map2dRenderedPlayer, target: Map2dPlayer, deltaS: number, local: boolean): boolean {
  const previousX = current.x;
  const previousZ = current.z;
  const previousRotation = current.rotation;
  const metadataChanged = !sameMetadata(current, target);
  smoothAvatarPose(current, target, deltaS, local, current);
  if (isPoseSettled(current, target)) {
    current.x = target.x;
    current.z = target.z;
    current.rotation = target.rotation;
  }
  const visualChanged = advanceMap2dAvatarVisual(current.visual, {
    previousX, previousZ, x: current.x, z: current.z, deltaS, sittingPropId: target.sittingPropId,
  });
  writeMetadata(current, target);
  return visualChanged || metadataChanged || previousX !== current.x || previousZ !== current.z || previousRotation !== current.rotation;
}
/** Persistent render poses: allocation occurs on join, never for a steady player frame. */
export class Map2dPlayerFrames {
  readonly players = new Map<string, Map2dRenderedPlayer>();
  update(targets: ReadonlyMap<string, Map2dPlayer>, localId: string | null, deltaS: number): boolean {
    let changed = false;
    for (const [id, target] of targets) {
      const current = this.players.get(id);
      if (current) {
        changed = updatePlayer(current, target, deltaS, id === localId) || changed;
      } else {
        this.players.set(id, { ...target, visual: createMap2dAvatarVisual(target.sittingPropId) });
        changed = true;
      }
    }
    for (const id of this.players.keys()) {
      if (!targets.has(id)) { this.players.delete(id); changed = true; }
    }
    return changed;
  }
  clear(): void { this.players.clear(); }
}
