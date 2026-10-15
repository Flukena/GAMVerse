import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CHARACTER_ID, isVoiceModerationRequest } from "@gammyverse/shared";
import { createMediaModerationEndpoint } from "./mediaModerationEndpoint.js";
import type { HttpRequest, HttpResponse } from "../http/middleware.js";

const OFFICE_ID = "00000000-0000-4000-8000-000000000099";
const EPOCH_ROOM_NAME = "zone-000000000000000000000001";
const USERNAME = "alice";
const TARGET = "bob";
function fixture(all = false) {
  let status = 200;
  let body: unknown;
  let calls = 0;
  const response = { status: (value: number) => { status = value; return response; }, json: (value: unknown) => { body = value; } } as unknown as HttpResponse;
  const request = { body: { officeId: OFFICE_ID, source: "microphone", all, targetUsername: TARGET }, header: () => "gv_session=synthetic-session" } as unknown as HttpRequest;
  const user = { username: USERNAME, nickname: null, role: "user" as const, characterId: DEFAULT_CHARACTER_ID };
  const dependencies = {
    session: async () => user as typeof user | null,
    role: async () => "user" as "user" | "admin" | null,
    context: async () => ({ kind: "private" as const, id: "private-zone", roomName: EPOCH_ROOM_NAME, participantIdentities: ["bob-media"] }) as { kind: "private"; id: string; roomName: string; participantIdentities: string[] } | null,
    mute: async (roomName: string, identities: string[]) => { calls += 1; assert.equal(roomName, EPOCH_ROOM_NAME); assert.deepEqual(identities, ["bob-media"]); return 1; },
  };
  return { request, response, dependencies, status: () => status, body: () => body, calls: () => calls };
}

test("upstream individual moderation uses the current private epoch rather than legacy geometry room names", async () => {
  const f = fixture();
  await createMediaModerationEndpoint(f.dependencies)(f.request, f.response);
  assert.equal(f.status(), 200);
  assert.equal(f.calls(), 1);
  assert.deepEqual(f.body(), { mutedTracks: 1 });
});

test("moderation rejects unadmitted targets and stale role and preserves admin-only mute-all", async () => {
  const revoked = fixture();
  revoked.dependencies.context = async () => null;
  await createMediaModerationEndpoint(revoked.dependencies)(revoked.request, revoked.response);
  assert.equal(revoked.status(), 403);
  assert.equal(revoked.calls(), 0);
  const all = fixture(true);
  await createMediaModerationEndpoint(all.dependencies)(all.request, all.response);
  assert.equal(all.status(), 403);
  assert.equal(all.calls(), 0);
  const stale = fixture();
  let reads = 0;
  stale.dependencies.role = async () => ++reads === 1 ? "admin" : null;
  await createMediaModerationEndpoint(stale.dependencies)(stale.request, stale.response);
  assert.equal(stale.status(), 403);
  assert.equal(stale.calls(), 0);
});

test("moderation validator rejects coercing flags, invalid sources and absent individual target", () => {
  assert.equal(isVoiceModerationRequest({ officeId: OFFICE_ID, source: "microphone", all: true }), true);
  assert.equal(isVoiceModerationRequest({ officeId: OFFICE_ID, source: "microphone", all: "true" }), false);
  assert.equal(isVoiceModerationRequest({ officeId: OFFICE_ID, source: "microphone" }), false);
  assert.equal(isVoiceModerationRequest({ officeId: OFFICE_ID, source: ["microphone"], all: true }), false);
});

test("moderation rechecks admission and epoch after a deferred final role query before muting", async () => {
  const f = fixture();
  let roleReadCount = 0;
  let resolveRole!: (role: "user" | "admin" | null) => void;
  let roleStarted!: () => void;
  const started = new Promise<void>(resolve => { roleStarted = resolve; });
  f.dependencies.role = async () => {
    roleReadCount += 1;
    if (roleReadCount === 1) return "user";
    roleStarted();
    return new Promise(resolve => { resolveRole = resolve; });
  };
  let admitted = true;
  const originalContext = f.dependencies.context;
  f.dependencies.context = async () => admitted ? originalContext() : null;
  const pending = createMediaModerationEndpoint(f.dependencies)(f.request, f.response);
  await started;
  admitted = false;
  resolveRole("user");
  await pending;
  assert.equal(f.status(), 403);
  assert.equal(f.calls(), 0);
});


test("moderation rejects a session revoked after initial authorization before any mute", async () => {
  const f = fixture();
  const account = await f.dependencies.session();
  let reads = 0;
  f.dependencies.session = async () => ++reads === 1 ? account : null;
  await createMediaModerationEndpoint(f.dependencies)(f.request, f.response);
  assert.equal(f.status(), 403);
  assert.equal(f.calls(), 0);
});
