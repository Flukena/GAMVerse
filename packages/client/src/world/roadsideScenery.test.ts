import assert from "node:assert/strict";
import test from "node:test";
import { generateCampusMap } from "../../../shared/src/campusMapGenerator.js";
import {
  groupRoadsideProps, intersectsRoadsideArea, ROADSIDE_BACK_M as BACK, ROADSIDE_FRONT_M as R, ROADSIDE_RENDER_HYSTERESIS_M as H,
  ROADSIDE_SIDE_M as SIDE, RoadsideSceneryVisibility, shouldRenderRoadsideChunk, shouldRenderRoadsideProp,
} from "./roadsideScenery";
import { shouldLoadPropModel, shouldRenderDistanceCulledProp } from "./propDistanceCulling";

const prop = (id: string, x: number, z = 0, width = 2, depth = 2, rotation = 0) => ({ id, x, z, width, depth, rotation });
const observer = { x: 0, z: 0 };
const bounds = { minX: R, maxX: R + 20, minZ: -10, maxZ: 10 };

test("every generated prop, including park, building and restroom families, belongs to a chunk", () => {
  const { layout } = generateCampusMap({ totalPeople: 150, peoplePerTeam: 15, teamCount: 10, seed: 3 });
  const chunked = groupRoadsideProps(layout.props).flatMap(chunk => chunk.props);
  assert.equal(chunked.length, layout.props.length);
  for (const family of [
    "campus-border-tree-", "campus-civic-park-tree", "campus-civic-park-surface", "campus-civic-park-canopy",
    "campus-city-building-", "campus-finished-building", "campus-vehicle", "shared-restroom-",
  ]) {
    assert.ok(layout.props.some(item => item.id.startsWith(family)), family);
    assert.ok(chunked.some(item => item.id.startsWith(family)), family);
  }
  const roadside = new RoadsideSceneryVisibility(layout.props);
  roadside.update({ x: 0, z: 0 }, "lobby", false);
  for (const item of layout.props) assert.notEqual(roadside.visibilityFor(item.id), undefined, item.id);
});

test("spatial chunks separate distant props without mutating placements", () => {
  const props = [prop("campus-landscape-1", 1), prop("campus-street-light-1", 2), prop("campus-landscape-2", 400), prop("desk-1", 1)];
  const before = structuredClone(props);
  const chunks = groupRoadsideProps(props);
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks.map(chunk => chunk.props.length), [3, 1]);
  assert.deepEqual(props, before);
});

test("chunk bounds include rotated prop extents beyond their grid cell", () => {
  const [chunk] = groupRoadsideProps([prop("campus-landscape-1", R + 30, 0, 2, 80, Math.PI / 2)]);
  assert.ok(Math.abs(chunk.bounds.minX - (R - 10)) < 0.0001);
  assert.equal(shouldRenderRoadsideChunk(chunk.bounds, observer, false, "lobby", false), true);
});

test("hidden chunks enter at the render distance inclusive and visible chunks exit after the hysteresis", () => {
  assert.equal(shouldRenderRoadsideChunk(bounds, observer, false, "lobby", false), true);
  assert.equal(shouldRenderRoadsideChunk(bounds, { x: -0.01, z: 0 }, false, "lobby", false), false);
  assert.equal(shouldRenderRoadsideChunk(bounds, { x: -H, z: 0 }, true, "lobby", false), true);
  assert.equal(shouldRenderRoadsideChunk(bounds, { x: -H - 0.01, z: 0 }, true, "lobby", false), false);
  assert.equal(shouldRenderRoadsideChunk(bounds, { x: -H / 3, z: 0 }, false, "lobby", false), false);
  assert.equal(shouldRenderRoadsideChunk(bounds, { x: -H / 3, z: 0 }, true, "lobby", false), true);
});

test("distance is circular to the nearest chunk extent, not a square or its center", () => {
  const near = R * 0.8;
  const diagonal = { minX: near, maxX: near + 64, minZ: near, maxZ: near + 64 };
  assert.equal(shouldRenderRoadsideChunk(diagonal, observer, false, "lobby", false), false);
  assert.equal(shouldRenderRoadsideChunk(bounds, { x: bounds.maxX + R / 2, z: 0 }, false, "lobby", false), true);
});

test("editor, nonpublic zones and missing character preserve visibility", () => {
  for (const zone of ["meeting-1", "private-1"]) {
    assert.equal(shouldRenderRoadsideChunk(bounds, { x: -1000, z: 0 }, false, zone, false), true);
  }
  assert.equal(shouldRenderRoadsideChunk(bounds, { x: -1000, z: 0 }, false, "lobby", true), true);
  assert.equal(shouldRenderRoadsideChunk(bounds, undefined, false, "lobby", false), true);
});

test("visibility follows the character, restores batches on zone/editor changes and handles late loads", () => {
  const roadside = new RoadsideSceneryVisibility([prop("campus-landscape-1", 600)]);
  const visual = { visible: true };
  roadside.update(observer, "lobby", false);
  roadside.registerVisual("campus-landscape-1", visual);
  assert.equal(visual.visible, false);
  assert.equal(roadside.visibilityFor("campus-landscape-1"), false);
  assert.equal(roadside.visibilityFor("unknown-prop"), undefined);
  roadside.update({ x: 600, z: 0 }, "lobby", false);
  assert.equal(visual.visible, true);
  roadside.update(observer, "meeting-1", false);
  assert.equal(visual.visible, true);
  assert.equal(roadside.visibilityFor("campus-landscape-1"), undefined);
  roadside.update(observer, "lobby", false);
  assert.equal(visual.visible, false);
  roadside.update(observer, "lobby", true);
  assert.equal(visual.visible, true);
  assert.equal(roadside.visibilityFor("campus-landscape-1"), undefined);
});

test("instanced placements split by spatial cell for any id; unknown ids stay in an unculled group", () => {
  const known = [prop("campus-civic-park-tree-1", 1), prop("campus-landscape-2", 2), prop("campus-landscape-3", 600)];
  const roadside = new RoadsideSceneryVisibility(known);
  const late = prop("late-plant-1", 1);
  assert.deepEqual(roadside.splitInstancedProps([...known, late]).map(group => group.map(item => item.id)), [
    ["campus-civic-park-tree-1", "campus-landscape-2"], ["campus-landscape-3"], ["late-plant-1"],
  ]);
});

test("public zone hides every prop family outside the directional area of the character; other zones use the camera rule", () => {
  const roadside = new RoadsideSceneryVisibility([prop("campus-civic-park-tree-1", 0, R - 10), prop("desk-1", 0, R + 500), prop("campus-city-building-north-1", R - 10)]);
  roadside.update(observer, "lobby", false);
  assert.equal(roadside.visibilityFor("campus-civic-park-tree-1"), true);
  assert.equal(roadside.visibilityFor("desk-1"), false);
  assert.equal(roadside.visibilityFor("campus-city-building-north-1"), false);
  roadside.update(observer, "meeting-1", false);
  assert.equal(roadside.visibilityFor("desk-1"), undefined);
  assert.equal(shouldRenderDistanceCulledProp({ x: 240, z: 0 }, observer, true), false);
  assert.equal(shouldLoadPropModel({ x: 240, z: 0 }, observer), false);
  assert.equal(shouldRenderDistanceCulledProp({ x: 200, z: 0 }, observer, true), true);
  assert.equal(shouldRenderDistanceCulledProp({ x: 190, z: 0 }, observer, false), false);
});

test("no generated prop of the 560x292 campus is visible outside the grown directional area, for any facing", () => {
  const { layout } = generateCampusMap({ totalPeople: 150, peoplePerTeam: 10, teamCount: 15 });
  for (const rotation of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7]) {
    const character = { ...observer, rotation };
    const roadside = new RoadsideSceneryVisibility(layout.props);
    roadside.update(character, "lobby", false);
    const visible = layout.props.filter(item => roadside.visibilityFor(item.id));
    assert.ok(visible.length > 0 && visible.length < layout.props.length);
    for (const item of layout.props) {
      const itemBounds = groupRoadsideProps([item])[0].bounds;
      assert.equal(roadside.visibilityFor(item.id), intersectsRoadsideArea(itemBounds, character, 0), item.id);
      const reach = Math.max(item.width, item.depth) / 2 * Math.SQRT2;
      if (roadside.visibilityFor(item.id)) assert.ok(Math.hypot(item.x, item.z) - reach <= R + H, item.id);
    }
  }
});

const at = (x: number, z: number, rotation = 0) => ({ x, z, rotation, bounds: { minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1 } });
const seen = (x: number, z: number, rotation: number, was = false) =>
  shouldRenderRoadsideProp(at(x, z).bounds, { x: 0, z: 0, rotation }, was, "lobby", false);

test("area constants are 150 front, 100 side, 50 back, with a 15 unit exit margin", () => {
  assert.deepEqual([R, SIDE, BACK, H], [150, 100, 50, 15]);
});

test("facing 0 looks along +z: front 150, sides 100, back 50 by footprint edge", () => {
  assert.equal(seen(0, 151, 0), true);
  assert.equal(seen(0, 151.01, 0), false);
  assert.equal(seen(101, 0, 0), true);
  assert.equal(seen(101.01, 0, 0), false);
  assert.equal(seen(-101, 0, 0), true);
  assert.equal(seen(-101.01, 0, 0), false);
  assert.equal(seen(0, -51, 0), true);
  assert.equal(seen(0, -51.01, 0), false);
});

test("area is two half-ellipses: diagonal points use the ellipse of their half", () => {
  assert.equal(seen(70, 100, 0), true);
  assert.equal(seen(80, 130, 0), false);
  assert.equal(seen(70, -30, 0), true);
  assert.equal(seen(80, -40, 0), false);
});

test("rotating the character rotates the area; a quarter turn sends the 150 front along +x", () => {
  const quarter = Math.PI / 2;
  assert.equal(seen(151, 0, quarter), true);
  assert.equal(seen(151.01, 0, quarter), false);
  assert.equal(seen(0, 101, quarter), true);
  assert.equal(seen(0, 101.01, quarter), false);
  assert.equal(seen(-51, 0, quarter), true);
  assert.equal(seen(-51.01, 0, quarter), false);
  assert.equal(seen(0, -150, Math.PI), true);
  assert.equal(seen(0, -151.01, Math.PI), false);
  assert.equal(seen(0, 51.01, Math.PI), false);
});

test("visible props stay until the area grown by the hysteresis, including after the character turns", () => {
  assert.equal(seen(0, 151.01 + H - 0.02, 0, true), true);
  assert.equal(seen(0, 151 + H + 0.01, 0, true), false);
  assert.equal(seen(0, -51.01 - H + 0.02, 0, true), true);
  assert.equal(seen(0, -51 - H - 0.01, 0, true), false);
  assert.equal(seen(0, -60, Math.PI, false), true);
  assert.equal(seen(0, -120, 0, false), false);
  const roadside = new RoadsideSceneryVisibility([prop("campus-landscape-1", 0, 100)]);
  roadside.update({ x: 0, z: 0, rotation: 0 }, "lobby", false);
  assert.equal(roadside.visibilityFor("campus-landscape-1"), true);
  roadside.update({ x: 0, z: 0, rotation: Math.PI }, "lobby", false);
  assert.equal(roadside.visibilityFor("campus-landscape-1"), false);
  roadside.update({ x: 0, z: 0, rotation: 0 }, "lobby", false);
  roadside.update({ x: 0, z: -60, rotation: 0 }, "lobby", false);
  assert.equal(roadside.visibilityFor("campus-landscape-1"), true);
});

test("a footprint that surrounds or crosses the area without a corner inside it is visible", () => {
  const character = { x: 0, z: 0, rotation: 0 };
  assert.equal(intersectsRoadsideArea({ minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, character, 0), true);
  assert.equal(intersectsRoadsideArea({ minX: -500, maxX: 500, minZ: 100, maxZ: 101 }, character, 0), true);
  assert.equal(intersectsRoadsideArea({ minX: -500, maxX: 500, minZ: 151, maxZ: 152 }, character, 0), false);
});

test("chunk rejection never removes a chunk that holds a prop of the area, whatever the facing", () => {
  for (const rotation of [0, 1, Math.PI / 2, 2.5, Math.PI, -2]) {
    for (const [x, z] of [[0, 150], [150, 0], [-150, 0], [0, -150], [100, 110], [-80, -40]]) {
      const forward = { x: Math.sin(rotation), z: Math.cos(rotation) };
      const lateral = { x: Math.cos(rotation), z: -Math.sin(rotation) };
      const px = (x * lateral.x + z * forward.x) * 0.99;
      const pz = (x * lateral.z + z * forward.z) * 0.99;
      const itemBounds = { minX: px - 1, maxX: px + 1, minZ: pz - 1, maxZ: pz + 1 };
      const character = { x: 0, z: 0, rotation };
      if (!intersectsRoadsideArea(itemBounds, character, 0)) continue;
      assert.equal(shouldRenderRoadsideChunk(itemBounds, character, false, "lobby", false), true);
    }
  }
  assert.equal(shouldRenderRoadsideChunk({ minX: 150.01, maxX: 160, minZ: -1, maxZ: 1 }, observer, false, "lobby", false), false);
  assert.equal(shouldRenderRoadsideChunk({ minX: 150.01, maxX: 160, minZ: -1, maxZ: 1 }, observer, true, "lobby", false), true);
});

test("editing, nonpublic zones and a missing character show every prop", () => {
  const far = at(900, 900).bounds;
  assert.equal(shouldRenderRoadsideProp(far, { x: 0, z: 0, rotation: 0 }, false, "lobby", true), true);
  assert.equal(shouldRenderRoadsideProp(far, { x: 0, z: 0, rotation: 0 }, false, "meeting-1", false), true);
  assert.equal(shouldRenderRoadsideProp(far, undefined, false, "lobby", false), true);
});

test("negative coordinates use distinct floor-based cells and support props spanning the origin", () => {
  const props = [prop("campus-landscape-1", -1), prop("campus-landscape-2", 1)];
  const chunks = groupRoadsideProps(props);
  assert.deepEqual(chunks.map(chunk => chunk.key), ["-1,0", "0,0"]);
  assert.deepEqual(chunks[0].bounds, { minX: -2, maxX: 0, minZ: -1, maxZ: 1 });
});