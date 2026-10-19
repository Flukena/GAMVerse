import assert from "node:assert/strict";
import test from "node:test";
import { createCampusOfficeDraft } from "./campusFurnishing.js";
import { appendCampusStarterProps } from "./campusFurnishingPlacement.js";
import { generateCampusMap } from "./campusMapGenerator.js";
import { CAMPUS_FINISHED_BUILDING_LIMIT } from "./campusFinishedBuildings.js";
import { campusWorldFromConfig, isPositionWalkable, type WorldConfig } from "./index.js";
import { readRoomLayout, ROOM_PROP_CATALOG, roomPropCollisionFootprint, roomPropPlacementSupport, type RoomLayout, type RoomLayoutProp, type RoomLayoutZone } from "./roomLayout.js";
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
  const restroomGreenery = prop.id.includes("-starter-tree-") || prop.id.includes("-starter-greenery-");
  assert.equal(prop.collision, restroomGreenery ? false : catalog.collision);
  const zone = layout.zones.find(item => prop.id.startsWith(`${item.id}${STARTER_ID_MARKER}`));
  assert.ok(zone);
  const rotatedWidth = Math.abs(Math.cos(prop.rotation)) * prop.width + Math.abs(Math.sin(prop.rotation)) * prop.depth;
  const rotatedDepth = Math.abs(Math.sin(prop.rotation)) * prop.width + Math.abs(Math.cos(prop.rotation)) * prop.depth;
  assert.ok(Math.abs(prop.x - zone.x) + rotatedWidth / 2 < zone.width / 2);
  assert.ok(Math.abs(prop.z - zone.z) + rotatedDepth / 2 < zone.depth / 2);
  if (!prop.elevation) return;
  if (prop.asset === "kit:bathroommirror") {
    assert.equal(prop.elevation, 1.15);
    return;
  }
  const support = roomPropPlacementSupport(layout.props.filter(item => item.id !== prop.id), prop.asset, prop.x, prop.z, prop.rotation);
  assert.ok(support);
  assert.ok(Math.abs(support.elevation - prop.elevation) < FLOAT_TOLERANCE_M);
}

function assertNoCollidingRestroomFixtures(props: RoomLayoutProp[], zoneId: string) {
  const collidable = props.filter((prop) => prop.collision);
  const bounds = roomPropCollisionFootprint;
  for (let index = 0; index < collidable.length; index += 1) {
    const first = collidable[index]!;
    const firstBounds = bounds(first);
    for (const second of collidable.slice(index + 1)) {
      const secondBounds = bounds(second);
      const overlapsX = Math.abs(first.x - second.x) < (firstBounds.width + secondBounds.width) / 2 - FLOAT_TOLERANCE_M;
      const overlapsZ = Math.abs(first.z - second.z) < (firstBounds.depth + secondBounds.depth) / 2 - FLOAT_TOLERANCE_M;
      assert.ok(!(overlapsX && overlapsZ), `${first.id} does not overlap ${second.id} in ${zoneId}`);
    }
  }
}

test("empty interiors omit restroom fixtures while preserving the generated map and landscaping", () => {
  const input = FIXTURES[1];
  const legacy = generateCampusMap(input);
  const empty = createCampusOfficeDraft(input, "empty");
  const restroomPrefixes = legacy.layout.zones
    .filter((zone) => zone.kind === "restroom")
    .map((zone) => `${zone.id}-starter-`);
  assert.deepEqual(empty.layout.props, legacy.layout.props.filter((prop) => !restroomPrefixes.some((prefix) => prop.id.startsWith(prefix))));
  assert.deepEqual(empty.layout.zones, legacy.layout.zones);
  assert.deepEqual(empty.layout.walls, legacy.layout.walls);
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

test("generated campus maps add finished buildings only in clear, in-bounds spaces", () => {
  const first = generateCampusMap(FIXTURES[2]);
  const repeat = generateCampusMap(FIXTURES[2]);
  const finished = first.layout.props.filter((prop) => prop.id.startsWith("campus-finished-building-"));
  assert.ok(finished.length > 0, "the template includes finished buildings when suitable space exists");
  assert.ok(finished.length <= CAMPUS_FINISHED_BUILDING_LIMIT, "finished buildings stay within the template limit");
  assert.deepEqual(finished, repeat.layout.props.filter((prop) => prop.id.startsWith("campus-finished-building-")), "the same seed produces the same building placements");
  const roads = first.layout.roadways ?? [];
  for (const prop of finished) {
    const facesRoad = roads.some((road) => {
      const gapX = Math.max(0, Math.abs(prop.x - road.x) - (prop.width + road.width) / 2);
      const gapZ = Math.max(0, Math.abs(prop.z - road.z) - (prop.depth + road.depth) / 2);
      return Math.hypot(gapX, gapZ) <= 16;
    });
    assert.ok(facesRoad, `${prop.id} sits on a street rather than alone in open ground`);
  }

  const rotatedSize = (prop: RoomLayoutProp) => ({
    width: Math.abs(Math.cos(prop.rotation)) * prop.width + Math.abs(Math.sin(prop.rotation)) * prop.depth,
    depth: Math.abs(Math.cos(prop.rotation)) * prop.depth + Math.abs(Math.sin(prop.rotation)) * prop.width,
  });
  const isClearOf = (prop: RoomLayoutProp, area: { x: number; z: number; width: number; depth: number }) => {
    const size = rotatedSize(prop);
    return Math.abs(prop.x - area.x) >= (size.width + area.width) / 2 + 0.74
      || Math.abs(prop.z - area.z) >= (size.depth + area.depth) / 2 + 0.74;
  };
  for (const prop of finished) {
    const definition = ROOM_PROP_CATALOG.find((item) => item.asset === prop.asset);
    assert.equal(definition?.editorRole, "building-prefab");
    const size = rotatedSize(prop);
    assert.ok(Math.abs(prop.x) + size.width / 2 <= first.dimensions.width / 2 - 0.74);
    assert.ok(Math.abs(prop.z) + size.depth / 2 <= first.dimensions.depth / 2 - 0.74);
    for (const road of first.layout.roadways ?? []) assert.ok(isClearOf(prop, road), `${prop.id} clears ${road.id}`);
    for (const zone of first.layout.zones) assert.ok(isClearOf(prop, zone), `${prop.id} clears ${zone.id}`);
    for (const other of first.layout.props) {
      if (other.id === prop.id) continue;
      const otherSize = rotatedSize(other);
      assert.ok(isClearOf(prop, { x: other.x, z: other.z, ...otherSize }), `${prop.id} clears ${other.id}`);
    }
  }
});

test("furnished restrooms have the requested fixture counts and empty restrooms have no props", () => {
  const layouts = [FIXTURES[0], FIXTURES[2]].map((input) => ({
    empty: createCampusOfficeDraft(input, "empty").layout,
    furnished: createCampusOfficeDraft(input, "furnished").layout,
  }));
  for (const { empty, furnished } of layouts) for (const zone of empty.zones.filter((item) => item.kind === "restroom")) {
    assert.equal(empty.props.filter((prop) => prop.id.startsWith(`${zone.id}-starter-`)).length, 0, `${zone.id} stays empty in the empty preset`);
    for (const [asset, expected] of [
      ["kit:toilet", 10],
      ["office-restroom-partition", 10],
      ["office-restroom-wash-backboard", 1],
      ["kit:bathroomsink", 5],
      ["kit:bathroommirror", 5],
      ["kit:trashcan", 2],
      ["kit:loungesofa", 2],
      ["kit:plantsmall1", 2],
      ["kit:shower", 2],
      ["kit:bathtub", 2],
    ] as const) {
      const emptyFixtures = empty.props.filter((prop) => prop.id.startsWith(`${zone.id}-starter-`) && prop.asset === asset);
      const furnishedFixtures = furnished.props.filter((prop) => prop.id.startsWith(`${zone.id}-starter-`) && prop.asset === asset);
      assert.equal(emptyFixtures.length, 0, `${zone.id} has no ${asset} in empty interiors`);
      assert.equal(furnishedFixtures.length, expected, `${zone.id} has ${asset} in furnished interiors without duplicates`);
    }
    const sinks = furnished.props.filter((prop) => prop.id.startsWith(`${zone.id}-starter-sink-`));
    assert.ok(Math.abs(sinks.reduce((sum, sink) => sum + sink.x, 0) / sinks.length - zone.x) < 2, `${zone.id} wash island is near the room center`);
    assert.ok(Math.abs(sinks.reduce((sum, sink) => sum + sink.z, 0) / sinks.length - zone.z) < 2, `${zone.id} wash island is near the room center`);
    for (const mirror of furnished.props.filter((prop) => prop.id.startsWith(`${zone.id}-starter-mirror-`))) {
      assert.ok(sinks.some((sink) => Math.hypot(mirror.x - sink.x, mirror.z - sink.z) <= 1), `${mirror.id} is paired with a sink`);
      assert.equal(mirror.elevation, 1.15, `${mirror.id} is above the basin, not on the floor`);
    }
    for (const side of ["west", "east"] as const) {
      const decor = ["sofa", "plant", "trashcan"].map((key) =>
        furnished.props.find((prop) => prop.id === `${zone.id}-starter-${key}-${side}`),
      );
      assert.ok(decor.every((prop) => prop), `${zone.id} has a complete ${side} decor set`);
      assert.ok(decor.every((prop) => Math.hypot(prop!.x - decor[0]!.x, prop!.z - decor[0]!.z) <= 3.5 + FLOAT_TOLERANCE_M), `${zone.id} ${side} decor stays together as a set`);
    }
    const restroomProps = furnished.props.filter((prop) => prop.id.startsWith(`${zone.id}-starter-`));
    assert.ok(restroomProps.every((prop) => [
      "kit:toilet",
      "office-restroom-partition",
      "office-restroom-wash-backboard",
      "kit:bathroomsink",
      "kit:bathroommirror",
      "kit:trashcan",
      "kit:loungesofa",
      "kit:plantsmall1",
      "kit:shower",
      "kit:bathtub",
    ].includes(prop.asset)), `${zone.id} contains bathroom fixtures only`);
    const toilets = furnished.props.filter((prop) => prop.id.startsWith(`${zone.id}-starter-toilet-`));
    const partitions = restroomProps.filter((prop) => prop.asset === "office-restroom-partition");
    for (let index = 0; index < partitions.length; index += 1) {
      const first = partitions[index]!;
      const firstBounds = roomPropCollisionFootprint(first);
      for (const second of partitions.slice(index + 1)) {
        const secondBounds = roomPropCollisionFootprint(second);
        assert.ok(
          Math.abs(first.x - second.x) >= (firstBounds.width + secondBounds.width) / 2 - FLOAT_TOLERANCE_M
          || Math.abs(first.z - second.z) >= (firstBounds.depth + secondBounds.depth) / 2 - FLOAT_TOLERANCE_M,
          `${first.id} and ${second.id} have no overlapping divider panels`,
        );
      }
    }
    for (const toilet of toilets) {
      const facingX = -Math.sin(toilet.rotation);
      const facingZ = -Math.cos(toilet.rotation);
      assert.ok((zone.x - toilet.x) * facingX + (zone.z - toilet.z) * facingZ > 0, `${toilet.id} faces into the room`);
      const partition = restroomProps.find((prop) => prop.id === toilet.id.replace("-toilet-", "-partition-"));
      assert.ok(partition, `${toilet.id} has its own divider`);
      assert.ok(Math.hypot(partition.x - toilet.x, partition.z - toilet.z) < 0.2, `${toilet.id} sits inside its divider`);
      assert.ok(Math.cos(partition.rotation - toilet.rotation) < -0.999, `${toilet.id} faces the open side of its divider`);
    }
    assertNoCollidingRestroomFixtures(restroomProps, zone.id);
  }
});
