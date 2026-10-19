import assert from "node:assert/strict";
import test from "node:test";
import { createCampusOfficeDraft } from "./campusFurnishing.js";
import { appendCampusStarterProps } from "./campusFurnishingPlacement.js";
import { generateCampusMap } from "./campusMapGenerator.js";
import { campusWorldFromConfig, isPositionWalkable, type WorldConfig } from "./index.js";
import { readRoomLayout, ROOM_PROP_CATALOG, roomPropPlacementSupport, type RoomLayout, type RoomLayoutProp, type RoomLayoutZone } from "./roomLayout.js";
import { MAX_OFFICE_PROPS } from "./officePropLimits.js";

const FIXTURES = [
  { totalPeople: 1, peoplePerTeam: 1, teamCount: 1, seed: 1 },
  { totalPeople: 10, peoplePerTeam: 5, teamCount: 2, seed: 2 },
  { totalPeople: 150, peoplePerTeam: 15, teamCount: 10, seed: 3 },
  { totalPeople: 235, peoplePerTeam: 5, teamCount: 47, seed: 4 },
];
const GRID_STEP_M = 0.5;
const ROOM_GRID_INSET_M = 0.75;
const SEAT_APPROACH_DISTANCE_M = 1.4;
const FLOAT_TOLERANCE_M = 0.001;
const STARTER_ID_MARKER = "-starter-";
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

function reachableRoomPoints(world: WorldConfig, zone: RoomLayoutZone) {
  const points = [{ x: zone.x, z: zone.z }];
  assert.ok(isPositionWalkable(points[0], world), `${zone.id} central aisle is open`);
  const visited = new Set(["0,0"]);
  for (let cursor = 0; cursor < points.length; cursor += 1) {
    const current = points[cursor];
    for (const [dx, dz] of NEIGHBORS) {
      const x = current.x + dx * GRID_STEP_M;
      const z = current.z + dz * GRID_STEP_M;
      if (Math.abs(x - zone.x) > zone.width / 2 - ROOM_GRID_INSET_M || Math.abs(z - zone.z) > zone.depth / 2 - ROOM_GRID_INSET_M) continue;
      const key = `${Math.round((x - zone.x) / GRID_STEP_M)},${Math.round((z - zone.z) / GRID_STEP_M)}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (isPositionWalkable({ x, z }, world)) points.push({ x, z });
    }
  }
  return points;
}

function assertCatalogPlacement(prop: RoomLayoutProp, layout: RoomLayout) {
  const catalog = ROOM_PROP_CATALOG.find(item => item.asset === prop.asset);
  assert.ok(catalog, `${prop.asset} is already catalogued`);
  assert.equal(prop.width, catalog.width);
  assert.equal(prop.depth, catalog.depth);
  assert.equal(prop.collision, catalog.collision);
  const zone = layout.zones.find(item => prop.id.startsWith(`${item.id}${STARTER_ID_MARKER}`));
  assert.ok(zone);
  const rotatedWidth = Math.abs(Math.cos(prop.rotation)) * prop.width + Math.abs(Math.sin(prop.rotation)) * prop.depth;
  const rotatedDepth = Math.abs(Math.sin(prop.rotation)) * prop.width + Math.abs(Math.cos(prop.rotation)) * prop.depth;
  assert.ok(Math.abs(prop.x - zone.x) + rotatedWidth / 2 < zone.width / 2);
  assert.ok(Math.abs(prop.z - zone.z) + rotatedDepth / 2 < zone.depth / 2);
  if (!prop.elevation) return;
  const support = roomPropPlacementSupport(layout.props.filter(item => item.id !== prop.id), prop.asset, prop.x, prop.z, prop.rotation);
  assert.ok(support);
  assert.ok(Math.abs(support.elevation - prop.elevation) < FLOAT_TOLERANCE_M);
}

test("empty interiors preserve legacy output and furnished starters retain landscaping without mutating it", () => {
  const input = FIXTURES[1];
  const legacy = generateCampusMap(input);
  assert.deepEqual(createCampusOfficeDraft(input, "empty"), legacy);
  const furnished = createCampusOfficeDraft(input, "furnished");
  assert.deepEqual(furnished, createCampusOfficeDraft(input, "furnished"));
  assert.deepEqual(furnished.layout.props.slice(0, legacy.layout.props.length), legacy.layout.props);
  assert.deepEqual(furnished.layout.zones, legacy.layout.zones);
  assert.deepEqual(furnished.layout.walls, legacy.layout.walls);
  assert.ok(furnished.layout.props.length > legacy.layout.props.length);
});

test("minimum, two-team, compact and largest-zone campuses furnish every room with valid bounded catalog props", () => {
  for (const input of FIXTURES) {
    const generated = createCampusOfficeDraft(input, "furnished");
    const { layout } = generated;
    assert.ok(layout.props.length <= MAX_OFFICE_PROPS);
    assert.equal(new Set(layout.props.map(prop => prop.id)).size, layout.props.length);
    assert.deepEqual(readRoomLayout({ version: 1, layout }).props, layout.props);
    for (const zone of layout.zones) assert.ok(layout.props.some(prop => prop.id.startsWith(`${zone.id}${STARTER_ID_MARKER}`)), zone.id);
    for (const prop of layout.props.filter(item => item.id.includes(STARTER_ID_MARKER))) assertCatalogPlacement(prop, layout);
    const world = campusWorldFromConfig({ version: 1, layout });
    assert.ok(layout.spawnPoint && isPositionWalkable(layout.spawnPoint, world), "spawn stays walkable");
  }
});

test("starter furniture leaves an actual walkable route from room center to entrances and seating approaches", () => {
  for (const input of FIXTURES) {
    const { layout } = createCampusOfficeDraft(input, "furnished");
    const world = campusWorldFromConfig({ version: 1, layout });
    for (const zone of layout.zones) {
      const reachable = reachableRoomPoints(world, zone);
      const door = layout.doors.find(item => item.id.startsWith(`${zone.id}-entrance-`));
      const wall = layout.walls.find(item => item.id === door?.wallId);
      assert.ok(wall && door);
      const entrance = wall.axis === "horizontal"
        ? { x: wall.x + door.offset, z: wall.z + Math.sign(zone.z - wall.z) * ROOM_GRID_INSET_M }
        : { x: wall.x + Math.sign(zone.x - wall.x) * ROOM_GRID_INSET_M, z: wall.z + door.offset };
      assert.ok(reachable.some(point => Math.hypot(point.x - entrance.x, point.z - entrance.z) <= GRID_STEP_M), `${zone.id} entrance has a route`);
      const seats = layout.props.filter(prop => prop.id.startsWith(`${zone.id}${STARTER_ID_MARKER}`) && ROOM_PROP_CATALOG.find(item => item.asset === prop.asset)?.interaction === "sit");
      for (const seat of seats) assert.ok(reachable.some(point => Math.hypot(point.x - seat.x, point.z - seat.z) <= SEAT_APPROACH_DISTANCE_M), `${seat.id} is approachable`);
    }
  }
});

test("unsupported create-office population is rejected with the generator's actual constraint", () => {
  assert.throws(() => createCampusOfficeDraft({ totalPeople: 4000, peoplePerTeam: 16, teamCount: 250 }, "furnished"), /more zones or walls/);
});


test("the total prop budget counts pre-existing landscaping and never partially mutates it", () => {
  const { layout } = generateCampusMap(FIXTURES[0]);
  const example = layout.props[0];
  assert.ok(example);
  const full = { ...layout, props: Array.from({ length: MAX_OFFICE_PROPS }, (_, index) => ({ ...example, id: `landscaping-${index}` })) };
  assert.throws(() => appendCampusStarterProps(full), /exceeds the office prop limit/);
  assert.equal(full.props.length, MAX_OFFICE_PROPS);
  assert.equal(appendCampusStarterProps({ ...full, zones: [] }).length, MAX_OFFICE_PROPS);
  assert.throws(() => appendCampusStarterProps({ ...full, zones: [], props: [...full.props, { ...example, id: "one-too-many" }] }), /exceeds the office prop limit/);
});
