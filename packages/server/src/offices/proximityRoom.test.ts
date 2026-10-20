import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { PlayerState } from "@gammyverse/shared";
import { realtimeRuntimeMetrics } from "../infra/realtimeRuntimeMetrics.js";
import { OfficeRoom } from "./OfficeRoom.js";
import { RoomServiceClient } from "livekit-server-sdk";
import { proximityRoomName } from "../media/service.js";

test("actual room buckets retain group incarnation, rotate on regroup, and immediately exclude private/away players", () => {
  const room = new OfficeRoom();
  const internal = room as unknown as {
    updateProximity(): void; refreshConversations(): void;
    world: { proximityRadius: number };
    proximityBySessionId: Map<string, Set<string>>;
    proximityGroupBySessionId: Map<string, string>;
    privateZoneIdBySessionId: Map<string, string>;
    meetingMembersBySessionId: Set<string>;
  };
  mock.method(internal, "refreshConversations", () => {});
  const add = (id: string, x: number) => {
    const player = new PlayerState(); player.presence = "online"; player.x = x; player.z = 0;
    room.state.players.set(id, player); return player;
  };
  const radius = internal.world.proximityRadius;
  const first = add("first", 0); const second = add("second", 1);
  add("far", radius * 10);
  try {
    const before = realtimeRuntimeMetrics.snapshot().counters;
    internal.updateProximity();
    const after = realtimeRuntimeMetrics.snapshot().counters;
    assert.equal(after.proximityPairChecks - before.proximityPairChecks, 1, "sparse player is excluded before exact distance work");
    assert.equal(after.proximityPossiblePairs - before.proximityPossiblePairs, 3);
    const original = internal.proximityGroupBySessionId.get("first"); assert.ok(original);
    second.x = radius + 0.25;
    internal.updateProximity();
    assert.equal(internal.proximityGroupBySessionId.get("second"), original, "hysteresis retains the existing group ID");
    second.x = radius + 0.51;
    internal.updateProximity();
    assert.equal(internal.proximityGroupBySessionId.size, 0);
    second.x = 1; internal.updateProximity();
    assert.notEqual(internal.proximityGroupBySessionId.get("first"), original, "retired token incarnation cannot be reused");
    internal.privateZoneIdBySessionId.set("second", "locked-desk"); internal.updateProximity();
    assert.equal(internal.proximityBySessionId.has("second"), false);
    assert.equal(internal.proximityGroupBySessionId.size, 0);
    internal.privateZoneIdBySessionId.clear(); internal.meetingMembersBySessionId.add("second"); internal.updateProximity();
    assert.equal(internal.proximityBySessionId.has("second"), false);
    internal.meetingMembersBySessionId.clear(); first.presence = "away"; internal.updateProximity();
    assert.equal(internal.proximityBySessionId.has("first"), false);
    assert.equal(internal.proximityGroupBySessionId.size, 0);
    first.presence = "online"; internal.updateProximity();
    assert.ok(internal.proximityGroupBySessionId.get("first"));
    room.state.players.delete("second"); internal.updateProximity();
    assert.equal(internal.proximityGroupBySessionId.size, 0);
    assert.equal(internal.proximityBySessionId.get("first")!.size, 0);
  } finally { room.clock.stop(); mock.restoreAll(); }
});

test("retired proximity groups revoke their exact media identities and notify both affected recipients", async () => {
  const room = new OfficeRoom();
  const internal = room as unknown as {
    updateProximity(): void; refreshConversations(): void; officeId: string;
    proximityGroupBySessionId: Map<string, string>; mediaIdentityBySessionId: Map<string, string>;
  };
  internal.officeId = "office";
  mock.method(internal, "refreshConversations", () => {});
  const originalEnvironment = { LIVEKIT_URL: process.env.LIVEKIT_URL, LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY, LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET };
  Object.assign(process.env, { LIVEKIT_URL: "ws://unused.invalid", LIVEKIT_API_KEY: "test-key", LIVEKIT_API_SECRET: "test-secret" });
  const removed: [string, string][] = [];
  const lookedUp: (string[] | undefined)[] = [];
  mock.method(RoomServiceClient.prototype, "listRooms", async (names?: string[]) => { lookedUp.push(names); return [{ name: names?.[0] }] as never; });
  mock.method(RoomServiceClient.prototype, "listParticipants", async () => [{ identity: "alice-media" }, { identity: "bob-media" }] as never);
  mock.method(RoomServiceClient.prototype, "removeParticipant", async (name: string, identity: string) => { removed.push([name, identity]); return {} as never; });
  const events: { sessionId: string; event: string; payload: unknown }[] = [];
  for (const [id, x] of [["alice", 0], ["bob", 1]] as const) {
    const player = new PlayerState(); player.presence = "online"; player.x = x; player.z = 0;
    room.state.players.set(id, player); internal.mediaIdentityBySessionId.set(id, `${id}-media`);
    room.clients.push({ sessionId: id, send(event: string, payload: unknown) { events.push({ sessionId: id, event, payload }); } } as never);
  }
  try {
    internal.updateProximity();
    const retired = internal.proximityGroupBySessionId.get("alice")!;
    events.length = 0;
    internal.updateProximity();
    assert.equal(events.length, 0, "unchanged group produces no recipient churn");
    room.state.players.get("bob")!.x = 100;
    internal.updateProximity();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(lookedUp, [[proximityRoomName("office", retired)]]);
    assert.deepEqual(removed.sort(), [[proximityRoomName("office", retired), "alice-media"], [proximityRoomName("office", retired), "bob-media"]]);
    for (const sessionId of ["alice", "bob"]) {
      assert.ok(events.some(event => event.sessionId === sessionId && event.event === "proximity-group" && (event.payload as { groupId: unknown }).groupId === null));
      assert.ok(events.some(event => event.sessionId === sessionId && event.event === "proximity" && (event.payload as { sessionIds: string[] }).sessionIds.length === 0));
    }
  } finally {
    for (const [name, value] of Object.entries(originalEnvironment)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    room.clock.stop(); mock.restoreAll();
  }
});
