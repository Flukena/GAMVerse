import { isPositionWalkable, type Position, type WorldConfig } from "@gammyverse/shared";
import { findAccessibleSpawn } from "./privateMovement.js";
const VEHICLE_EXIT_CLEARANCE_M = 0.12;
const VEHICLE_EXIT_EXTRA_OFFSETS_M = [0, 0.45, 0.9, 1.35] as const;
const FOOTPRINT_HALF_DIVISOR = 2;
export function vehicleExitPosition(position: Position, footprint: {width:number;depth:number}|undefined, world: WorldConfig, occupied: readonly Position[]): Position | null {
  if (!footprint) return isPositionWalkable(position,world) ? {x:position.x,z:position.z} : findAccessibleSpawn(occupied,world);
  const clearanceM = world.playerRadius + VEHICLE_EXIT_CLEARANCE_M;
  for (const extraM of VEHICLE_EXIT_EXTRA_OFFSETS_M) {
    const horizontalM = footprint.width / FOOTPRINT_HALF_DIVISOR + clearanceM + extraM;
    const verticalM = footprint.depth / FOOTPRINT_HALF_DIVISOR + clearanceM + extraM;
    const candidates = [{x:position.x+horizontalM,z:position.z},{x:position.x-horizontalM,z:position.z},{x:position.x,z:position.z+verticalM},{x:position.x,z:position.z-verticalM}];
    const exit = candidates.find(candidate=>isPositionWalkable(candidate,world));
    if (exit) return exit;
  }
  return findAccessibleSpawn(occupied,world);
}
