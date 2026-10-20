import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { PRIVATE_ADMISSION_TTL_MS, PRIVATE_KNOCK_TTL_MS, type RoomLayoutZone } from "@gammyverse/shared";
import { PrivateMediaEpochs } from "../media/privateMediaEpoch.js";
import { PrivateConversations } from "./privateConversations.js";
import type { PrivateAccessFrame } from "./privateZoneAccess.js";

function fixture() {
  let sequence = 0; let deadlines = 0;
  const zone: RoomLayoutZone = { id: "desk", kind: "private", ownerUsername: "alice", name: "Desk", x: 0, z: 0, width: 6, depth: 6, color: "#ffffff" };
  const frame: PrivateAccessFrame = { zones: [zone], people: new Map(["alice", "bob", "carol"].map(id => [id, { sessionId: id, username: id, displayName: id, active: true, online: true }])), zoneBySession: new Map([["alice", "desk"]]) };
  const privacy = new PrivateConversations("office", "incarnation", {
    nowMs: () => Date.now(), id: () => `id-${++sequence}`, onDeadline: () => { deadlines++; },
    queries: { authorize: async () => true, owner: async () => "alice" },
    epochs: new PrivateMediaEpochs({ removeRoom: async () => {}, epoch: () => (++sequence).toString(16).padStart(24, "0") }),
  });
  privacy.reconcile(frame);
  const command = async (sessionId: string, action: string, extra: Record<string, unknown> = {}) => {
    mock.timers.tick(1001);
    const result = await privacy.command(sessionId, { requestId: `request-${++sequence}`, zoneId: "desk", expectedRevision: privacy.access.revision("desk"), action, ...extra });
    assert.equal((result.at(-1)!.payload as { ok: boolean }).ok, true, JSON.stringify(result.at(-1)!.payload));
    await new Promise<void>(resolve => setImmediate(resolve));
  };
  return { privacy, frame, command, deadlineCount: () => deadlines };
}

test("pending knocks and admitted guests expire on actual timers without reconciliation, motion or messages", async () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"], now: 100_000 });
  const f = fixture();
  try {
    await f.command("alice", "lock");
    await f.command("bob", "knock");
    mock.timers.tick(PRIVATE_KNOCK_TTL_MS);
    assert.equal(f.privacy.access.ownKnock("bob", "desk")?.state, "expired");
    assert.ok(f.deadlineCount() > 0);
    await f.command("carol", "knock");
    await f.command("alice", "admit", { knockId: f.privacy.access.ownKnock("carol", "desk")!.id });
    assert.equal(f.privacy.canEnter("carol", "desk"), true);
    mock.timers.tick(PRIVATE_ADMISSION_TTL_MS);
    assert.equal(f.privacy.canEnter("carol", "desk"), false);
    assert.equal(f.privacy.access.ownKnock("carol", "desk")?.state, "expired");
    assert.equal(f.privacy.access.nextDeadlineAtMs(), null);
    assert.equal(f.privacy.lockedIds().has("desk"), true, "stationary moderator keeps lock");
  } finally { await f.privacy.dispose(); mock.timers.reset(); }
});

test("map replacement and disposal cancel stale deadlines", async () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"], now: 100_000 });
  const f = fixture();
  try {
    await f.command("alice", "lock"); await f.command("bob", "knock");
    f.privacy.mapChanged({ ...f.frame, zones: [] });
    mock.timers.tick(PRIVATE_KNOCK_TTL_MS);
    assert.equal(f.deadlineCount(), 0);
    f.privacy.mapChanged(f.frame);
    await f.command("alice", "lock"); await f.command("bob", "knock");
    await f.privacy.dispose();
    mock.timers.tick(PRIVATE_KNOCK_TTL_MS);
    assert.equal(f.deadlineCount(), 0);
  } finally { await f.privacy.dispose(); mock.timers.reset(); }
});
