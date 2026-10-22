import type { StarterPlacement } from "./campusFurnishingTypes.js";
import type { RoomLayoutZone } from "./roomLayoutTypes.js";

const STALL_COUNT_PER_SIDE = 5;
const STALL_SPACING_M = 2.2;
const TOILET_WALL_INSET_M = 1.4;
const PARTITION_REAR_OFFSET_M = 0.15;
const WASH_ISLAND_X_M = -1.4;
const WASH_BACKBOARD_X_M = -2.1;
const MIRROR_ELEVATION_M = 1.15;
const WET_WALL_INSET_M = 1.5;
const DECOR_WALL_INSET_M = 1.4;

/** Author one south-entry plan, then rotate the entire plan with the actual door. */
export function campusRestroomFixtures(
  zone: RoomLayoutZone,
  eastWestEntrance = false,
  entranceSide: "north" | "east" | "south" | "west" = "south",
): StarterPlacement[] {
  const widthM = eastWestEntrance ? zone.depth : zone.width;
  const depthM = eastWestEntrance ? zone.width : zone.depth;
  const rotationRad = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 }[entranceSide];
  const placements: StarterPlacement[] = [];
  for (const [side, sign] of [["west", -1], ["east", 1]] as const) {
    const xM = sign * (widthM / 2 - TOILET_WALL_INSET_M);
    for (let index = 0; index < STALL_COUNT_PER_SIDE; index += 1) {
      const zM = (index - (STALL_COUNT_PER_SIDE - 1) / 2) * STALL_SPACING_M;
      placements.push(
        { key: `toilet-${side}-${index + 1}`, asset: "kit:toilet", xM, zM, rotationRad: sign * Math.PI / 2 },
        { key: `partition-${side}-${index + 1}`, asset: "office-restroom-partition", xM: xM + sign * PARTITION_REAR_OFFSET_M, zM, rotationRad: -sign * Math.PI / 2 },
      );
    }
    const decorZ = depthM / 2 - 1.6;
    const decorX = sign * (widthM / 2 - DECOR_WALL_INSET_M);
    placements.push(
      { key: `sofa-${side}`, asset: "kit:loungesofa", xM: decorX, zM: decorZ, rotationRad: sign * Math.PI / 2 },
      { key: `plant-${side}`, asset: "kit:plantsmall1", xM: decorX - sign * 2.1, zM: decorZ },
      { key: `trashcan-${side}`, asset: "kit:trashcan", xM: decorX - sign * 3.5, zM: decorZ },
    );
  }
  placements.push({ key: "wash-backboard", asset: "office-restroom-wash-backboard", xM: WASH_BACKBOARD_X_M, zM: 0, rotationRad: Math.PI / 2 });
  for (let index = 0; index < STALL_COUNT_PER_SIDE; index += 1) {
    const zM = (index - (STALL_COUNT_PER_SIDE - 1) / 2) * STALL_SPACING_M;
    placements.push(
      { key: `sink-${index + 1}`, asset: "kit:bathroomsink", xM: WASH_ISLAND_X_M, zM, rotationRad: -Math.PI / 2 },
      { key: `mirror-${index + 1}`, asset: "kit:bathroommirror", xM: WASH_BACKBOARD_X_M + 0.2, zM, rotationRad: -Math.PI / 2, elevationM: MIRROR_ELEVATION_M },
    );
  }
  for (const [key, asset, xM] of [
    ["shower-1", "kit:shower", -5.4],
    ["bathtub-1", "kit:bathtub", -1.8],
    ["bathtub-2", "kit:bathtub", 1.8],
    ["shower-2", "kit:shower", 5.4],
  ] as const) placements.push({ key, asset, xM, zM: -depthM / 2 + WET_WALL_INSET_M, rotationRad: Math.PI });
  return placements.map((placement) => ({
    ...placement,
    xM: placement.xM * Math.cos(rotationRad) + placement.zM * Math.sin(rotationRad),
    zM: -placement.xM * Math.sin(rotationRad) + placement.zM * Math.cos(rotationRad),
    rotationRad: (placement.rotationRad ?? 0) + rotationRad,
  }));
}
