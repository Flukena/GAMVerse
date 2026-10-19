import assert from "node:assert/strict";
import test from "node:test";
import { registerDeskEndpoints } from "./deskEndpoints.js";
import type { HttpRequest, HttpResponse, requestSession } from "./middleware.js";
const OFFICE_ID = "00000000-0000-4000-8000-000000000001";
const DESK_ID = "00000000-0000-4000-8000-000000000002";
const CLAIM_PATH = "/offices/:officeId/desks/:deskId/claim";
type Handler = (request: HttpRequest, response: HttpResponse) => Promise<void>;
function fixture(authenticated = true, denied = false) {
  const handlers = new Map<string, Handler>();
  const changes: unknown[] = [];
  const notifications: string[] = [];
  const output: { status: number; body?: unknown } = { status: 200 };
  const result = { config: {}, configVersion: 2, desks: [] };
  const app = { get: (path: string, handler: Handler) => handlers.set(path, handler), post: (path: string, handler: Handler) => handlers.set(path, handler) };
  registerDeskEndpoints(app, async officeId => { notifications.push(officeId); }, {
    session: async () => authenticated ? { username: "alice", role: "user" } as NonNullable<Awaited<ReturnType<typeof requestSession>>> : null,
    store: { list: async () => result, change: async (...args) => {
      changes.push(args); if (denied) throw new Error("Office not found or access denied."); return result;
    } },
  });
  const request = { params: { officeId: OFFICE_ID, deskId: DESK_ID }, body: { username: "victim" } } as unknown as HttpRequest;
  const response = { status: (code: number) => { output.status = code; return response; }, json: (value: unknown) => { output.body = value; }, setHeader() {} } as unknown as HttpResponse;
  return { handlers, changes, notifications, output, request, response };
}
test("claim endpoint derives identity from session and refreshes canonical map", async () => {
  const f = fixture(); await f.handlers.get(CLAIM_PATH)!(f.request, f.response);
  assert.deepEqual(f.changes, [["alice", OFFICE_ID, { deskId: DESK_ID }, true]]);
  assert.deepEqual(f.notifications, [OFFICE_ID]); assert.equal(f.output.status, 200);
});
test("claim endpoint rejects missing session and membership denial without notifying", async () => {
  const anonymous = fixture(false); await anonymous.handlers.get(CLAIM_PATH)!(anonymous.request, anonymous.response);
  assert.equal(anonymous.output.status, 401); assert.deepEqual(anonymous.changes, []);
  const outsider = fixture(true, true); await outsider.handlers.get(CLAIM_PATH)!(outsider.request, outsider.response);
  assert.equal(outsider.output.status, 403); assert.deepEqual(outsider.notifications, []);
});
