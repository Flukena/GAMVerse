import assert from "node:assert/strict";
import test from "node:test";
import { generateCampusMap } from "./campusMapGenerator.js";
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
