import type { WorldConfig } from "@gammyverse/shared";

type GhostCollisionGrid = NonNullable<WorldConfig["collisionGrid"]>;
const ghostCollisionGrids = new WeakMap<object, GhostCollisionGrid>();

/** Allows passage through props while retaining all collision blockers classified as walls. */
export function ghostCollisionWorld(world: WorldConfig): WorldConfig {
  const walls = world.walls;
  let collisionGrid = ghostCollisionGrids.get(walls);
  if (!collisionGrid) {
    const cellSize = world.collisionGrid?.cellSize ?? 8;
    const cells = new Map<string, (typeof walls)[number][]>();
    for (const wall of walls) {
      const minX = Math.floor((wall.x - wall.width / 2) / cellSize);
      const maxX = Math.floor((wall.x + wall.width / 2) / cellSize);
      const minZ = Math.floor((wall.z - wall.depth / 2) / cellSize);
      const maxZ = Math.floor((wall.z + wall.depth / 2) / cellSize);
      for (let cellX = minX; cellX <= maxX; cellX += 1) {
        for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
          const key = `${cellX},${cellZ}`;
          const bucket = cells.get(key) ?? [];
          bucket.push(wall);
          cells.set(key, bucket);
        }
      }
    }
    collisionGrid = { cellSize, cells };
    ghostCollisionGrids.set(walls, collisionGrid);
  }
  return { ...world, obstacles: [], collisionGrid };
}

/** True when prop/car collision changes the authoritative result of a walking step. */
export function movementBlockedByProps(
  withProps: { x: number; z: number },
  withoutProps: { x: number; z: number },
): boolean {
  return Math.hypot(withoutProps.x - withProps.x, withoutProps.z - withProps.z) > 0.01;
}
