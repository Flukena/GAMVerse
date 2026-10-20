import test from "node:test";
import assert from "node:assert/strict";
import { resolveRouteSearchWorkerPath } from "./routeSearchWorkerPath.js";

test("worker resolver finds the adjacent production bundle from bundled realtime entry", () => {
  const path = resolveRouteSearchWorkerPath("file:///srv/app/dist/index.js", (candidate) => candidate === "/srv/app/dist/routeSearchWorker.js");
  assert.equal(path, "/srv/app/dist/routeSearchWorker.js");
});

test("worker resolver finds the TypeScript source from dev office module", () => {
  const path = resolveRouteSearchWorkerPath("file:///workspace/src/offices/routeSearchPool.ts", (candidate) => candidate === "/workspace/src/offices/routeSearchWorker.ts");
  assert.equal(path, "/workspace/src/offices/routeSearchWorker.ts");
});

test("worker resolver finds the watched dev bundle before the TypeScript fallback", () => {
  const path = resolveRouteSearchWorkerPath("file:///workspace/src/offices/routeSearchPool.ts", (candidate) => candidate === "/workspace/dist/routeSearchWorker.js" || candidate === "/workspace/src/offices/routeSearchWorker.ts");
  assert.equal(path, "/workspace/dist/routeSearchWorker.js");
});
