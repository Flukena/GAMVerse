import assert from "node:assert/strict";
import test from "node:test";
import { DESK_ASSIGNMENT_FENCE_REQUEST_TTL_MS } from "@gammyverse/shared";
import { DeskAssignmentFences } from "./deskAssignmentFences.js";

const NOW_MS = 100_000;
const operation = { officeId: "office", operationId: "operation", expectedConfigVersion: 1, newConfigVersion: 2, zoneIds: ["zone"], deadlineAtMs: NOW_MS + DESK_ASSIGNMENT_FENCE_REQUEST_TTL_MS };

test("prepare is idempotent; pending privacy fences never expire or release for stale map versions", () => {
  let nowMs = NOW_MS;
  const registry = new DeskAssignmentFences(() => nowMs);
  assert.deepEqual(registry.prepare(operation), operation);
  assert.deepEqual(registry.prepare(operation), operation);
  nowMs += DESK_ASSIGNMENT_FENCE_REQUEST_TTL_MS * 2;
  assert.ok(registry.current("office"));
  assert.equal(registry.applied("office", 1), undefined);
  assert.throws(() => registry.prepare({ ...operation, operationId: "newer", deadlineAtMs: nowMs + DESK_ASSIGNMENT_FENCE_REQUEST_TTL_MS }));
  assert.deepEqual(registry.applied("office", 2), operation);
});

test("late rollback/recovery cannot release newer fence and cancelled prepare cannot arrive late", () => {
  const registry = new DeskAssignmentFences(() => NOW_MS);
  registry.rollback(operation);
  assert.throws(() => registry.prepare(operation));
  const newer = { ...operation, operationId: "newer" };
  registry.prepare(newer);
  assert.equal(registry.rollback(operation), false);
  assert.deepEqual(registry.current("office"), newer);
  assert.equal(registry.rollback(newer), true);
});
