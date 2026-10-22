export type WorldConfig = {
  width: number;
  depth: number;
  playerRadius: number;
  movementSpeed: number;
  proximityRadius: number;
  voiceFullVolumeRadius: number;
  meetingZone: { id: string; x: number; z: number; radius: number; exitRadius: number };
  spawnPoints: readonly Position[];
  walls: readonly Blocker[];
  obstacles: readonly Blocker[];
  collisionGrid?: BlockerGrid;
  /** Optional collision grid for movers (currently vehicles), refreshed independently of static geometry. */
  dynamicCollisionGrid?: BlockerGrid;
  /** Small per-request blockers layered over cached static and dynamic collision grids. */
  accessOverlay?: readonly Blocker[];
  /** A mounted vehicle must not collide with its own movable prop. */
  excludedVehiclePropId?: string;
};

export interface Position {
  x: number;
  z: number;
}

export interface Blocker {
  x: number;
  z: number;
  width: number;
  depth: number;
  playerClearanceRadius?: number;
  vehiclePropId?: string;
}

export interface BlockerGrid {
  cellSize: number;
  cells: ReadonlyMap<string, readonly Blocker[]>;
}
