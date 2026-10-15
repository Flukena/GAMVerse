import assert from "node:assert/strict";
import test from "node:test";
import { DESK_ASSIGNMENT_FENCE_REQUEST_TTL_MS } from "@gammyverse/shared";
import { deskAssignmentControl } from "./deskAssignmentControl.js";
import { deskAssignmentFences } from "../offices/deskAssignmentFences.js";
import type { HttpRequest, HttpResponse } from "./middleware.js";

const OFFICE_ID = "00000000-0000-4000-8000-000000000021";
const OPERATION_ID = "00000000-0000-4000-8000-000000000022";
const SERVICE_TOKEN = "test-service-credential-for-isolated-unit-only";
function reply() {
  const result = { status: 200, body: undefined as unknown };
  const response = { status: (code: number) => { result.status = code; return response; }, sendStatus: (code: number) => { result.status = code; }, json: (body: unknown) => { result.body = body; } };
  return { result, response: response as unknown as HttpResponse };
}

test("internal desk fence requires service authentication and valid bound operation before any mutation", async () => {
  const control = deskAssignmentControl(SERVICE_TOKEN);
  const fence = { officeId: OFFICE_ID, operationId: OPERATION_ID, expectedConfigVersion: 1, newConfigVersion: 2, zoneIds: ["desk"], deadlineAtMs: Date.now() + DESK_ASSIGNMENT_FENCE_REQUEST_TTL_MS };
  const request = (body: unknown, token = SERVICE_TOKEN) => ({ body, header: () => token }) as unknown as HttpRequest;
  const denied = reply();
  await control(request({ ...fence, action: "prepare" }, "wrong"), denied.response);
  assert.equal(denied.result.status, 401);
  assert.equal(deskAssignmentFences.current(OFFICE_ID), undefined);
  const invalid = reply();
  await control(request({ ...fence, action: "prepare", newConfigVersion: 9 }), invalid.response);
  assert.equal(invalid.result.status, 400);
  const prepared = reply();
  await control(request({ ...fence, action: "prepare" }), prepared.response);
  assert.equal(prepared.result.status, 204);
  assert.equal(deskAssignmentFences.current(OFFICE_ID)?.operationId, OPERATION_ID);
  const status = reply();
  await control(request({ officeId: OFFICE_ID, action: "status" }), status.response);
  assert.equal((status.result.body as { appliedConfigVersion: number | null }).appliedConfigVersion, null);
  const rolledBack = reply();
  await control(request({ ...fence, action: "rollback" }), rolledBack.response);
  assert.equal(rolledBack.result.status, 204);
  assert.equal(deskAssignmentFences.current(OFFICE_ID), undefined);
});
