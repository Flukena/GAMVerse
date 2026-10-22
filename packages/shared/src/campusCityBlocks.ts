import { ROOM_PROP_CATALOG } from "./roomPropCatalog.js";
import type { RoomLayout } from "./roomLayoutTypes.js";
import type { RoomLayoutProp } from "./roomPropTypes.js";

const CITY_BUILDING_CLEARANCE_M = 1;
const CITY_TREE_CLEARANCE_M = 0.3;
const CITY_BUILDING_STEP_M = 12;
const CITY_BUILDING_MIN_DISTANCE_M = 60;
const CITY_BUILDING_MAX_DISTANCE_M = 100;
const CITY_FACADE_INSET_M = 12;
const TEAM_LOOP_RESERVE_M = 4;
const CITY_TREE_MIN_DISTANCE_M = 58;
const CITY_TREE_MAX_DISTANCE_M = 102;
const CITY_TREE_SPINE_OFFSET_M = 3;
const CITY_TREE_STEP_M = 8;
const BORDER_TREE_STEP_M = 3;
const BORDER_TREE_INSET_M = 1.2;
const BORDER_GATE_HALF_WIDTH_M = 4;
const CITY_TREE_ASSETS = ROOM_PROP_CATALOG
  .filter(item => (item.asset.startsWith("nature-kenney-nature-kit-tree-")
    || item.asset.startsWith("kit-mini-forest-tree")
    || item.asset.startsWith("kenney-city-kit-suburban-tree-"))
    && item.width <= 2 && item.depth <= 2 && item.height >= 1)
  .map(item => item.asset);

function treeAsset(index: number) {
  // A stride coprime to the curated list avoids long repeating runs along the border.
  return CITY_TREE_ASSETS[(index * 7 + Math.floor(index / 3)) % CITY_TREE_ASSETS.length]!;
}

/** A deterministic city plaza between each pair of populated team blocks. */
export function appendCampusCityBlocks(layout: RoomLayout) {
  const add = (id: string, asset: string, x: number, z: number, clearanceM: number) => {
    const definition = ROOM_PROP_CATALOG.find(item => item.asset === asset);
    if (!definition || !layout.dimensions) return false;
    const candidate: RoomLayoutProp = { id, asset, x, z, rotation: 0, collision: definition.collision, width: definition.width, depth: definition.depth };
    if (Math.abs(x) + candidate.width / 2 > layout.dimensions.width / 2 || Math.abs(z) + candidate.depth / 2 > layout.dimensions.depth / 2) return false;
    const blocked = [...layout.zones, ...(layout.roadways ?? []), ...layout.props].some(area => {
      const rotation = "rotation" in area ? area.rotation : 0;
      const width = Math.abs(Math.cos(rotation)) * area.width + Math.abs(Math.sin(rotation)) * area.depth;
      const depth = Math.abs(Math.cos(rotation)) * area.depth + Math.abs(Math.sin(rotation)) * area.width;
      return Math.abs(x - area.x) < (candidate.width + width) / 2 + clearanceM
        && Math.abs(z - area.z) < (candidate.depth + depth) / 2 + clearanceM;
    });
    if (blocked) return false;
    layout.props.push(candidate);
    return true;
  };
  const teams = new Map<string, typeof layout.zones>();
  for (const zone of layout.zones) {
    const id = /^(team-\d+)-office-/.exec(zone.id)?.[1];
    if (id) teams.set(id, [...(teams.get(id) ?? []), zone]);
  }
  // Industrial finished buildings read as city office blocks; avoid the
  // residential cutaway prefabs in these deliberately repeated plazas.
  const buildings = ROOM_PROP_CATALOG.filter(item => item.editorRole === "building-prefab" && item.asset.startsWith("kit-city-kit-industrial-building-"));
  for (const north of [true, false]) {
    const blocks = [...teams.values()].filter(rooms => (rooms[0]!.z < 0) === north).map(rooms => ({
      left: Math.min(...rooms.map(room => room.x - room.width / 2)),
      right: Math.max(...rooms.map(room => room.x + room.width / 2)),
    })).sort((a, b) => a.left - b.left);
    for (let index = 0; index < blocks.length - 1; index += 1) {
      const left = blocks[index]!.right, right = blocks[index + 1]!.left;
      const center = (left + right) / 2;
      const band = north ? "north" : "south";
      let buildingIndex = 0;
      // Keep a central pedestrian spine; facade rows face the two team alleys.
      const xs = [left + CITY_FACADE_INSET_M, right - CITY_FACADE_INSET_M];
      for (const x of xs) for (let distance = CITY_BUILDING_MIN_DISTANCE_M; distance <= CITY_BUILDING_MAX_DISTANCE_M; distance += CITY_BUILDING_STEP_M) {
        const z = (north ? -1 : 1) * distance;
        const start = (index + buildingIndex) % buildings.length;
        for (let offset = 0; offset < buildings.length; offset += 1) {
          const definition = buildings[(start + offset) % buildings.length]!;
          if (x - definition.width / 2 <= left + TEAM_LOOP_RESERVE_M || x + definition.width / 2 >= right - TEAM_LOOP_RESERVE_M) continue;
          if (add(`campus-city-building-${band}-${index + 1}-${buildingIndex + 1}`, definition.asset, x, z, CITY_BUILDING_CLEARANCE_M)) { buildingIndex += 1; break; }
        }
      }
      for (const side of [-1, 1]) for (let distance = CITY_TREE_MIN_DISTANCE_M; distance <= CITY_TREE_MAX_DISTANCE_M; distance += CITY_TREE_STEP_M) {
        add(`campus-city-tree-${band}-${index + 1}-${side}-${distance}`, treeAsset(index * 31 + distance + side), center + side * CITY_TREE_SPINE_OFFSET_M, (north ? -1 : 1) * distance, CITY_TREE_CLEARANCE_M);
      }
    }
  }
  if (!layout.dimensions) return;
  const halfWidth = layout.dimensions.width / 2 - BORDER_TREE_INSET_M;
  const halfDepth = layout.dimensions.depth / 2 - BORDER_TREE_INSET_M;
  let treeIndex = 0;
  for (const side of [-1, 1]) {
    for (let x = -halfWidth; x <= halfWidth; x += BORDER_TREE_STEP_M) {
      if (Math.abs(x) < BORDER_GATE_HALF_WIDTH_M) continue;
      add(`campus-border-tree-${++treeIndex}`, treeAsset(treeIndex), x, side * halfDepth, CITY_TREE_CLEARANCE_M);
    }
    for (let z = -halfDepth + BORDER_TREE_STEP_M; z < halfDepth - BORDER_TREE_STEP_M; z += BORDER_TREE_STEP_M) {
      if (Math.abs(z) < BORDER_GATE_HALF_WIDTH_M) continue;
      add(`campus-border-tree-${++treeIndex}`, treeAsset(treeIndex), side * halfWidth, z, CITY_TREE_CLEARANCE_M);
    }
  }
}
