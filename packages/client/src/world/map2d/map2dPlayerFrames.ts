import { smoothAvatarPose, isPoseSettled } from "./avatarPoseSmoother";
import type { Map2dPlayer } from "./map2dDynamicLayer";

function sameMetadata(current: Map2dPlayer, target: Map2dPlayer): boolean {
  return current.displayName === target.displayName && current.username === target.username &&
    current.status === target.status && current.handRaised === target.handRaised && current.characterId === target.characterId;
}
function writeMetadata(current: Map2dPlayer, target: Map2dPlayer): void {
  current.displayName = target.displayName;
  current.username = target.username;
  current.status = target.status;
  current.handRaised = target.handRaised;
  current.characterId = target.characterId;
}
function updatePlayer(current: Map2dPlayer, target: Map2dPlayer, deltaS: number, local: boolean): boolean {
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
  writeMetadata(current, target);
  return metadataChanged || previousX !== current.x || previousZ !== current.z || previousRotation !== current.rotation;
}
/** Persistent render poses: allocation occurs on join, never for a steady player frame. */
export class Map2dPlayerFrames {
  readonly players = new Map<string, Map2dPlayer>();
  update(targets: ReadonlyMap<string, Map2dPlayer>, localId: string | null, deltaS: number): boolean {
    let changed = false;
    for (const [id, target] of targets) {
      const current = this.players.get(id);
      if (current) {
        changed = updatePlayer(current, target, deltaS, id === localId) || changed;
      } else {
        this.players.set(id, { ...target });
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
