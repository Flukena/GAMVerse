import assert from "node:assert/strict";
import test from "node:test";
import { appendCampusStarterProps } from "./campusFurnishingPlacement.js";
import { campusPrivateRoomPlacements } from "./campusPrivateRoomTemplate.js";
import { campusWorldFromConfig, isPositionWalkable } from "./index.js";
import { ROOM_PROP_CATALOG, roomPropCollisionFootprint, roomPropPlacementSupport, type RoomLayout, type RoomLayoutZone } from "./roomLayout.js";

const ZONE: RoomLayoutZone = { id: "private-0", name: "Studio", kind: "private", x: 0, z: 0, width: 8, depth: 8, color: "#ffffff" };
const EPSILON_M = 0.001;
const GRID_STEP_M = 0.25;
const KEYS = ["desk", "monitor", "keyboard", "chair", "bed", "fridge", "sink", "counter", "stove", "washer", "storage", "decor", "plant"];
const VARIANTS = {
  monitor: ["computerScreen", "external-pixel-modern-office-pixel-modern-office-monitor-arm-54a8d67b", "external-cozy-home-interiors-cozy-home-interiors-computer-monitor-3e762133"],
  bed: ["kit:bedsingle", "kit:beddouble"],
  plant: ["kit:pottedplant", "kit:plantsmall1", "kit:plantsmall2", "kit:plantsmall3"],
  decor: ["kit:books", "kit:radio"],
};

function studio(zone = ZONE): RoomLayout {
  return {
    version: 1, props: [], zones: [zone],
    walls: [
      { id: "north", axis: "horizontal", x: zone.x, z: zone.z - 4, length: 8, thickness: 0.2, height: 3 },
      { id: "south", axis: "horizontal", x: zone.x, z: zone.z + 4, length: 8, thickness: 0.2, height: 3 },
      { id: "west", axis: "vertical", x: zone.x - 4, z: zone.z, length: 8, thickness: 0.2, height: 3 },
      { id: "east", axis: "vertical", x: zone.x + 4, z: zone.z, length: 8, thickness: 0.2, height: 3 },
    ],
    doors: ["north", "south"].map((wallId) => ({ id: `${zone.id}-entrance-${wallId}`, wallId, offset: 0, width: 1.4 })),
  };
}

test("private studios have the exact complete inventory and deterministic independent variants", () => {
  const seen = Object.fromEntries(Object.keys(VARIANTS).map((key) => [key, new Set<string>()]));
  for (let index = 0; index < 48; index += 1) {
    const zone = { ...ZONE, id: `team-${Math.floor(index / 8)}-private-${index}` };
    const placements = campusPrivateRoomPlacements(zone);
    assert.deepEqual(placements.map((item) => item.key), KEYS);
    assert.deepEqual(placements, campusPrivateRoomPlacements({ ...zone, name: "Renamed", ownerUsername: "changed" }));
    for (const [key, variants] of Object.entries(VARIANTS)) {
      const asset = placements.find((item) => item.key === key)!.asset;
      assert.ok(variants.includes(asset), `${key} uses an existing approved variant`);
      seen[key]!.add(asset);
    }
    for (const [key, asset] of Object.entries({
      desk: "external-pixel-modern-office-pixel-modern-office-desk-l-shaped-e63b68bc",
      keyboard: "kit:computerkeyboard",
      chair: "kit:chairdesk", fridge: "kit:kitchenfridge", sink: "kit:kitchensink",
      counter: "kit:kitchencabinet", stove: "kit:kitchenstove", washer: "kit:washer", storage: "kit:bookcaseopenlow",
    })) assert.equal(placements.find((item) => item.key === key)?.asset, asset);
  }
  for (const [key, variants] of Object.entries(VARIANTS)) assert.deepEqual([...seen[key]!].sort(), [...variants].sort(), `${key} varies across stable room identities`);
});

test("computer keyboards are tabletop items without classifying keyboard instruments as tabletop decor", () => {
  assert.equal(ROOM_PROP_CATALOG.find((item) => item.asset === "kit:computerkeyboard")?.placementClass, "small");
  assert.equal(ROOM_PROP_CATALOG.find((item) => item.asset.includes("keyboard-piano"))?.placementClass, "floor");
  const layout = studio();
  const props = appendCampusStarterProps(layout);
  const keyboard = props.find((prop) => prop.id.endsWith("-keyboard"))!;
  const desk = props.find((prop) => prop.id.endsWith("-desk"))!;
  assert.equal(keyboard.elevation, ROOM_PROP_CATALOG.find((item) => item.asset === desk.asset)?.height);
  assert.equal(roomPropPlacementSupport([], keyboard.asset, keyboard.x, keyboard.z), null);
});

test("studio variants are bounded, collision-free and supported at catalog surface elevations", () => {
  for (let index = 0; index < 24; index += 1) {
    const zone = { ...ZONE, id: `private-${index}`, x: 17, z: -21 };
    const props = appendCampusStarterProps(studio(zone));
    assert.equal(props.length, KEYS.length);
    for (const prop of props) {
      const definition = ROOM_PROP_CATALOG.find((item) => item.asset === prop.asset)!;
      assert.ok(definition);
      assert.equal(prop.width, definition.width);
      assert.equal(prop.depth, definition.depth);
      assert.equal(prop.collision, definition.collision);
      const cos = Math.abs(Math.cos(prop.rotation));
      const sin = Math.abs(Math.sin(prop.rotation));
      assert.ok(Math.abs(prop.x - zone.x) + (prop.width * cos + prop.depth * sin) / 2 < 4);
      assert.ok(Math.abs(prop.z - zone.z) + (prop.width * sin + prop.depth * cos) / 2 < 4);
      if (["monitor", "keyboard", "decor"].some((key) => prop.id.endsWith(`-starter-${key}`))) {
        const support = roomPropPlacementSupport(props.filter((item) => item.id !== prop.id), prop.asset, prop.x, prop.z, prop.rotation);
        assert.ok(support, `${prop.id} has compatible support`);
        assert.equal(prop.elevation, support.elevation);
        assert.equal(support.prop.id, `${zone.id}-starter-${prop.id.endsWith("-decor") ? "storage" : "desk"}`);
      } else assert.equal(prop.elevation, undefined);
    }
    const floorProps = props.filter((prop) => !prop.elevation);
    for (let firstIndex = 0; firstIndex < floorProps.length; firstIndex += 1) {
      const first = floorProps[firstIndex]!;
      const firstSize = roomPropCollisionFootprint(first);
      for (const second of floorProps.slice(firstIndex + 1)) {
        const secondSize = roomPropCollisionFootprint(second);
        assert.ok(
          Math.abs(first.x - second.x) >= (firstSize.width + secondSize.width) / 2 - EPSILON_M
          || Math.abs(first.z - second.z) >= (firstSize.depth + secondSize.depth) / 2 - EPSILON_M,
          `${first.id} clears ${second.id}`,
        );
        const visualSize = (prop: typeof first) => ({
          width: prop.width * Math.abs(Math.cos(prop.rotation)) + prop.depth * Math.abs(Math.sin(prop.rotation)),
          depth: prop.depth * Math.abs(Math.cos(prop.rotation)) + prop.width * Math.abs(Math.sin(prop.rotation)),
        });
        const firstVisual = visualSize(first);
        const secondVisual = visualSize(second);
        assert.ok(
          Math.abs(first.x - second.x) >= (firstVisual.width + secondVisual.width) / 2 - EPSILON_M
          || Math.abs(first.z - second.z) >= (firstVisual.depth + secondVisual.depth) / 2 - EPSILON_M,
          `${first.id} visual bounds clear ${second.id}`,
        );
      }
    }
    const monitor = props.find((prop) => prop.id.endsWith("-monitor"))!;
    const keyboard = props.find((prop) => prop.id.endsWith("-keyboard"))!;
    assert.ok(Math.abs(monitor.z - keyboard.z) >= (monitor.depth + keyboard.depth) / 2 - EPSILON_M, "computer accessories do not overlap each other");
  }
});

test("all studio variants preserve center, both entrances and desk chair approach routes", () => {
  for (let index = 0; index < 12; index += 1) {
    const layout = studio({ ...ZONE, id: `private-${index}` });
    layout.props = appendCampusStarterProps(layout);
    const world = campusWorldFromConfig({ version: 1, layout });
    assert.ok(isPositionWalkable({ x: 0, z: 0 }, world), "room center stays open");
    const points = [{ x: 0, z: 0 }];
    const visited = new Set(["0,0"]);
    for (let cursor = 0; cursor < points.length; cursor += 1) {
      const current = points[cursor]!;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const x = current.x + dx * GRID_STEP_M;
        const z = current.z + dz * GRID_STEP_M;
        const key = `${x},${z}`;
        if (Math.abs(x) > 4.5 || Math.abs(z) > 4.5 || visited.has(key)) continue;
        visited.add(key);
        if (isPositionWalkable({ x, z }, world)) points.push({ x, z });
      }
    }
    for (const z of [-4.5, 4.5]) assert.ok(points.some((point) => point.x === 0 && point.z === z), `entrance ${z} reaches outside`);
    assert.ok(points.some((point) => point.x === -2 && point.z === 1), "front of chair is reachable, not just its blocked center");
    assert.ok(points.some((point) => point.x === 0.5 && point.z === 1), "kitchen side of room is accessible");
  }
});
