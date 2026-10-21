import assert from "node:assert/strict";
import test from "node:test";
import { generateCampusMap } from "../../../shared/src/campusMapGenerator.js";
import {
  groupRoadsideProps, ROADSIDE_RENDER_DISTANCE_M as R, ROADSIDE_RENDER_HYSTERESIS_M as H,
  RoadsideSceneryVisibility, shouldRenderRoadsideChunk,
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

test("public zone hides every prop family beyond the render distance of the character; other zones use the camera rule", () => {
  const roadside = new RoadsideSceneryVisibility([prop("campus-civic-park-tree-1", R - 10), prop("desk-1", R + 500), prop("campus-city-building-north-1", R + 50)]);
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

test("no generated prop of the 560x292 campus stays visible beyond the render distance of a mid-map character", () => {
  const { layout } = generateCampusMap({ totalPeople: 150, peoplePerTeam: 10, teamCount: 15 });
  const roadside = new RoadsideSceneryVisibility(layout.props);
  roadside.update(observer, "lobby", false);
  const visible = layout.props.filter(item => roadside.visibilityFor(item.id));
  assert.ok(visible.length > 0 && visible.length < layout.props.length);
  for (const item of visible) {
    const reach = Math.max(item.width, item.depth) / 2 * Math.SQRT2;
    assert.ok(Math.hypot(item.x, item.z) - reach <= R, item.id);
  }
});

test("negative coordinates use distinct floor-based cells and support props spanning the origin", () => {
  const props = [prop("campus-landscape-1", -1), prop("campus-landscape-2", 1)];
  const chunks = groupRoadsideProps(props);
  assert.deepEqual(chunks.map(chunk => chunk.key), ["-1,0", "0,0"]);
  assert.deepEqual(chunks[0].bounds, { minX: -2, maxX: 0, minZ: -1, maxZ: 1 });
});