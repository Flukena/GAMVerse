import type { Blocker, BlockerGrid } from "./worldTypes.js";

const DEFAULT_BLOCKER_GRID_CELL_SIZE_M = 8;

export function makeBlockerGrid(blockers: readonly Blocker[], cellSize = DEFAULT_BLOCKER_GRID_CELL_SIZE_M): BlockerGrid {
  const cells = new Map<string, Blocker[]>();
  for (const blocker of blockers) {
    const minX = Math.floor((blocker.x - blocker.width / 2) / cellSize);
    const maxX = Math.floor((blocker.x + blocker.width / 2) / cellSize);
    const minZ = Math.floor((blocker.z - blocker.depth / 2) / cellSize);
    const maxZ = Math.floor((blocker.z + blocker.depth / 2) / cellSize);
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
        const key = `${cellX},${cellZ}`;
        const bucket = cells.get(key) ?? [];
        bucket.push(blocker);
        cells.set(key, bucket);
      }
    }
  }
  return { cellSize, cells };
}
