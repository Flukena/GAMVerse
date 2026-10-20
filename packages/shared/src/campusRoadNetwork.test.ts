import assert from "node:assert/strict";
import test from "node:test";
import { generateCampusMap } from "./campusMapGenerator.js";
import { MAX_OFFICE_PROPS } from "./officePropLimits.js";
import { readRoomLayout } from "./roomLayout.js";
import { isRoadNetworkConnected, planRoadConnectors, roadNetworkComponents, roadsConnect, roadsideVergePoints } from "./campusRoadNetwork.js";

const FIXTURES = [
  { totalPeople: 1, peoplePerTeam: 1, teamCount: 1, seed: 1 },
  { totalPeople: 10, peoplePerTeam: 5, teamCount: 2, seed: 2 },
  { totalPeople: 24, peoplePerTeam: 6, teamCount: 4, seed: 5 },
  { totalPeople: 150, peoplePerTeam: 15, teamCount: 10, seed: 3 },
  { totalPeople: 235, peoplePerTeam: 5, teamCount: 47, seed: 4 },
];

test("roads that only meet edge to edge are not treated as a junction", () => {
  const left = { x: -6, z: 0, width: 8, depth: 4 };
  const right = { x: 2, z: 0, width: 8, depth: 4 };
  assert.equal(roadsConnect(left, right), false, "touching kerbs share no drivable surface");
  assert.equal(roadNetworkComponents([left, right]).length, 2);
  const [link] = planRoadConnectors(
    [{ id: "left", ...left, kind: "small" }, { id: "right", ...right, kind: "small" }],
    { blockers: [], bounds: { width: 200, depth: 200 } },
  );
  assert.ok(link, "a junction patch is planned over the seam");
  assert.ok(isRoadNetworkConnected([left, right, link]), "the patch joins both roads");
});

test("link streets bridge a gap without cutting through a room", () => {
  const roads = [
    { id: "north", x: 0, z: -20, width: 40, depth: 8, kind: "small" as const },
    { id: "south", x: 0, z: 20, width: 40, depth: 8, kind: "small" as const },
  ];
  const blocked = planRoadConnectors(roads, { blockers: [{ x: 0, z: 0, width: 60, depth: 24 }], bounds: { width: 200, depth: 200 } });
  assert.equal(blocked.length, 0, "no link is planned when a room blocks every route");
  const open = planRoadConnectors(roads, { blockers: [], bounds: { width: 200, depth: 200 } });
  assert.equal(open.length, 1);
  assert.ok(isRoadNetworkConnected([...roads, ...open]), "the gap is bridged when the space is free");
});

test("roadside verge points sit off the driving surface on both kerbs", () => {
  const road = { x: 0, z: 0, width: 40, depth: 8 };
  const points = roadsideVergePoints(road, { spacingM: 10, offsetM: 1.2 });
  assert.ok(points.length >= 6, "a 40 m road gets several furniture slots");
  for (const point of points) {
    const onRoad = Math.abs(point.x) < road.width / 2 && Math.abs(point.z) < road.depth / 2;
    assert.equal(onRoad, false, "street furniture never lands on the road itself");
    assert.equal(Math.abs(Math.abs(point.z) - (road.depth / 2 + 1.2)) < 1e-9, true);
  }
  assert.ok(points.some((point) => point.z > 0) && points.some((point) => point.z < 0), "both kerbs are used");
});

test("every generated campus map is one drivable road network", () => {
  for (const input of FIXTURES) {
    const { layout } = generateCampusMap(input);
    const roads = layout.roadways ?? [];
    assert.ok(roads.length > 0, `${input.teamCount} teams get roads`);
    const components = roadNetworkComponents(roads);
    const names = components.slice(1).map((group) => group.map((index) => roads[index]!.id).join(", "));
    assert.equal(components.length, 1, `${input.teamCount} teams drive without a dead end; stranded: ${names.join(" | ")}`);
  }
});

test("generated link streets stay clear of rooms and inside the map", () => {
  for (const input of FIXTURES) {
    const { layout, dimensions } = generateCampusMap(input);
    for (const link of (layout.roadways ?? []).filter((road) => road.id.startsWith("road-link"))) {
      assert.ok(Math.abs(link.x) + link.width / 2 <= dimensions.width / 2 + 1e-9, `${link.id} stays in bounds`);
      assert.ok(Math.abs(link.z) + link.depth / 2 <= dimensions.depth / 2 + 1e-9, `${link.id} stays in bounds`);
      for (const zone of layout.zones) {
        const overlapsZone = Math.abs(link.x - zone.x) < (link.width + zone.width) / 2 - 0.05
          && Math.abs(link.z - zone.z) < (link.depth + zone.depth) / 2 - 0.05;
        assert.equal(overlapsZone, false, `${link.id} does not run through ${zone.id}`);
      }
    }
  }
});

test("Campus Loop roads have connected exits at both ends and never cross rooms", () => {
  const cases = [...FIXTURES,
    { totalPeople: 160, peoplePerTeam: 16, teamCount: 10, seed: 6 },
    { totalPeople: 16, peoplePerTeam: 16, teamCount: 1, seed: 7 },
  ];
  for (const input of cases) {
    const { layout, dimensions } = generateCampusMap(input);
    const roads = layout.roadways ?? [];
    for (const road of roads) {
      assert.ok(Math.abs(road.x) + road.width / 2 <= dimensions.width / 2, `${road.id} stays within map width`);
      assert.ok(Math.abs(road.z) + road.depth / 2 <= dimensions.depth / 2, `${road.id} stays within map depth`);
      const horizontal = road.width >= road.depth;
      for (const side of [-1, 1]) {
        const end = horizontal
          ? { x: road.x + side * (road.width / 2 - road.depth / 2), z: road.z }
          : { x: road.x, z: road.z + side * (road.depth / 2 - road.width / 2) };
        assert.ok(roads.some((other) => other !== road
          && Math.abs(end.x - other.x) <= other.width / 2
          && Math.abs(end.z - other.z) <= other.depth / 2), `${input.teamCount}×${input.peoplePerTeam}: ${road.id} end ${side} joins another road`);
      }
      for (const zone of layout.zones) {
        assert.ok(!(Math.abs(road.x - zone.x) < (road.width + zone.width) / 2 - 0.001
          && Math.abs(road.z - zone.z) < (road.depth + zone.depth) / 2 - 0.001), `${road.id} clears ${zone.id}`);
      }
    }
  }
});

test("Campus Loop roadside props leave the full driving surface clear", () => {
  for (const input of [FIXTURES[0]!, FIXTURES[3]!]) {
    const { layout } = generateCampusMap(input);
    assert.ok(layout.props.some((prop) => prop.id.startsWith("campus-street-light-")));
    assert.ok(layout.props.some((prop) => prop.id.startsWith("campus-street-bin-")));
    assert.ok(layout.props.some((prop) => /campus-(landscape-|city-tree-|border-tree-)/.test(prop.id)), "planned and infill landscaping finish the roadsides");
    for (const prop of layout.props) {
      if (prop.id.startsWith("campus-vehicle-") || prop.id.includes("-starter-")) continue;
      const width = Math.abs(Math.cos(prop.rotation)) * prop.width + Math.abs(Math.sin(prop.rotation)) * prop.depth;
      const depth = Math.abs(Math.cos(prop.rotation)) * prop.depth + Math.abs(Math.sin(prop.rotation)) * prop.width;
      for (const road of layout.roadways ?? []) {
        assert.ok(!(Math.abs(prop.x - road.x) < (width + road.width) / 2 - 0.001
          && Math.abs(prop.z - road.z) < (depth + road.depth) / 2 - 0.001), `${prop.id} clears ${road.id}`);
      }
    }
  }
});


test("Campus Loop preserves saveable dimensions and geometry at the previous width boundary", () => {
  for (const peoplePerTeam of [1, 3, 4]) {
    const { layout } = generateCampusMap({ totalPeople: 53 * peoplePerTeam, peoplePerTeam, teamCount: 53, seed: 8 });
    const restored = readRoomLayout({ layout });
    assert.deepEqual(restored.dimensions, layout.dimensions, `${peoplePerTeam} people/team retains saved dimensions`);
    assert.deepEqual(restored.roadways, layout.roadways, "saving retains all street geometry");
    assert.equal(restored.zones.length, layout.zones.length, "saving retains every room");
    for (const zone of layout.zones) {
      assert.ok(Math.abs(zone.x) + zone.width / 2 <= layout.dimensions!.width / 2, `${zone.id} fits the persisted map`);
    }
  }
});


test("team blocks alternate with finished-building city gaps and a planted map border", () => {
  for (const teamCount of [5, 10]) {
    const { layout, dimensions } = generateCampusMap({ totalPeople: teamCount * 15, peoplePerTeam: 15, teamCount, seed: 3 });
    const teams = new Map<string, typeof layout.zones>();
    for (const zone of layout.zones.filter(zone => zone.kind === "private")) {
      const id = zone.id.split("-office-")[0]!;
      teams.set(id, [...(teams.get(id) ?? []), zone]);
    }
    assert.equal(teams.size, teamCount, "the user's selected team count stays authoritative");
    for (const north of [true, false]) {
      const blocks = [...teams.values()].filter(rooms => (rooms[0]!.z < 0) === north).map(rooms => ({
        left: Math.min(...rooms.map(room => room.x - room.width / 2)),
        right: Math.max(...rooms.map(room => room.x + room.width / 2)),
      })).sort((a,b) => a.left - b.left);
      for (let index = 0; index < blocks.length - 1; index += 1) {
        const left = blocks[index]!, right = blocks[index + 1]!;
        assert.ok(right.left - left.right >= 12, "every adjacent pair reserves a city gap");
        assert.ok(layout.props.some(prop => prop.id.startsWith("campus-city-building-") && prop.x > left.right && prop.x < right.left && (prop.z < 0) === north), "each gap contains a finished building");
      }
    }
    const border = layout.props.filter(prop => prop.id.startsWith("campus-border-tree-"));
    assert.ok(border.length >= (dimensions.width + dimensions.depth) / 3, "the perimeter receives a dense tree rhythm");
    assert.ok(new Set(border.map(prop => prop.asset)).size >= 8, "the perimeter uses a broad mix of available tree assets");
    for (const axis of ["x", "z"] as const) for (const side of [-1,1]) {
      const half = dimensions[axis === "x" ? "width" : "depth"] / 2;
      assert.ok(border.some(prop => Math.abs(prop[axis] - side * (half - 1.2)) < 0.01), "all four map boundaries receive trees");
    }
    assert.ok(layout.props.length < MAX_OFFICE_PROPS, "outdoor props remain saveable");
    for (const prop of layout.props.filter(prop => /campus-(city-|border-tree-)/.test(prop.id))) {
      for (const area of [...layout.zones, ...(layout.roadways ?? [])]) {
        assert.ok(!(Math.abs(prop.x - area.x) < (prop.width + area.width)/2 - 0.001 && Math.abs(prop.z - area.z) < (prop.depth + area.depth)/2 - 0.001), `${prop.id} clears ${area.id}`);
      }
    }
  }
});
