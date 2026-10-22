import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { CONVERSATION_SNAPSHOT_EVENT, PlayerState, PRIVATE_ADMISSION_TTL_MS, type ConversationSnapshot } from "@gammyverse/shared";
import { OfficeRoom } from "./OfficeRoom.js";
import { PrivateConversations } from "./privateConversations.js";
import { PrivateMediaEpochs } from "../media/privateMediaEpoch.js";
import type { SpatialConversations } from "./spatialConversations.js";
import type { SessionSecurity } from "./sessionSecurity.js";
import { realtimeRuntimeMetrics } from "../infra/realtimeRuntimeMetrics.js";

type Internals = {
  step(dt: number): void; applyMapConfig(config: unknown, version: number): void;
  updateMeetingMembership(): void; updateProximity(): void; refreshPrivateAccess(): void;
  privacy: PrivateConversations; lockedZoneIds: Set<string>; sessionSecurity: SessionSecurity;
  movementInputs: Map<string, { x: number; z: number; sprint: boolean; receivedAt: number }>;
  mediaZoneBySessionId: Map<string, { id: string }>;
  mediaIdentityBySessionId: Map<string, string>; usernamesBySessionId: Map<string, string>;
  conversations: SpatialConversations; reconcilingPrivateAccess: boolean;
};
async function fixture() {
  const room = new OfficeRoom();
  mock.method(room, "setMetadata", async () => {}); mock.method(room, "setFixedTimestep", () => {});
  mock.method(room, "onMessage", () => () => {}); mock.method(console, "info", () => {});
  await room.onCreate({ officeId: "00000000-0000-4000-8000-000000000007" });
  const internal = room as unknown as Internals;
  internal.applyMapConfig({ version: 1, layout: { version: 1, dimensions: { width: 50, depth: 50 }, props: [], walls: [], doors: [], zones: [{ id: "room", kind: "meeting", name: "Meeting", x: 15, z: 15, width: 4, depth: 4, color: "#ffffff" }] } }, 2);
  for (const id of ["alice", "bob"]) {
    const player = new PlayerState(); player.presence = "online"; player.username = id;
    room.state.players.set(id, player); internal.sessionSecurity.activate(id, id);
    internal.movementInputs.set(id, { x: 0, z: 0, sprint: false, receivedAt: performance.now() });
  }
  return { room, internal };
}

test("stationary ticks batch projections, but movement crossing a zone boundary reconciles in that same tick", async () => {
  let nowMs = 1000; mock.method(performance, "now", () => nowMs);
  const { room, internal } = await fixture();
  try {
    const memberships = mock.method(internal, "updateMeetingMembership");
    const proximity = mock.method(internal, "updateProximity");
    for (let i = 0; i < 5; i++) { internal.step(0.02); nowMs += 20; }
    assert.equal(memberships.mock.callCount(), 1);
    assert.equal(proximity.mock.callCount(), 1);
    internal.step(0.02);
    assert.equal(proximity.mock.callCount(), 2);
    const alice = room.state.players.get("alice")!;
    alice.x = 12.99; alice.z = 15;
    nowMs += 20;
    internal.movementInputs.set("alice", { x: 1, z: 0, sprint: false, receivedAt: nowMs });
    internal.step(0.02);
    assert.equal(internal.mediaZoneBySessionId.get("alice")?.id, "room");
    assert.equal(proximity.mock.callCount(), 3, "zone transition bypasses stationary cadence");
  } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); }
});

test("simulation ticks project distant markers after authoritative movement", async () => {
  const tickAtMs = 1_000;
  const tickDeltaSeconds = 0.02;
  mock.method(performance, "now", () => tickAtMs);
  const { room, internal } = await fixture();
  try {
    const player = room.state.players.get("alice")!;
    player.x = 0;
    player.z = 0;
    player.rotation = 0;
    const initialX = player.x;
    internal.movementInputs.set("alice", { x: 1, z: 0, sprint: false, receivedAt: tickAtMs });
    internal.step(tickDeltaSeconds);
    assert.ok(player.x > initialX, "the tick applies movement before marker projection");
    assert.equal(player.markerX, player.x);
    assert.equal(player.markerZ, player.z);
    assert.equal(player.markerRotation, player.rotation);
  } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); }
});

test("empty room ticks skip projections without disabling deadlines or retained-player work", async () => {
  const { room, internal } = await fixture();
  try {
    assert.equal(room.autoDispose, true, "keep framework disposal and reserved reconnect seats");
    const alice = room.state.players.get("alice")!;
    room.state.players.clear();
    const membership = mock.method(internal, "updateMeetingMembership", () => {});
    const proximity = mock.method(internal, "updateProximity", () => {});
    const deadline = mock.method(internal.privacy, "deadlineDue", () => false);
    const before = realtimeRuntimeMetrics.snapshot().counters;
    for (let i = 0; i < 20; i++) internal.step(0.05);
    const after = realtimeRuntimeMetrics.snapshot().counters;
    assert.equal(after.emptyRoomTickSkips - before.emptyRoomTickSkips, 20);
    assert.equal(after.mapParses, before.mapParses);
    assert.equal(after.vehicleWorldRebuilds, before.vehicleWorldRebuilds);
    assert.equal(membership.mock.callCount(), 0);
    assert.equal(proximity.mock.callCount(), 0);
    deadline.mock.mockImplementation(() => true);
    internal.step(0.05);
    assert.equal(membership.mock.callCount(), 1, "due deadlines bypass empty-room skipping");
    assert.equal(proximity.mock.callCount(), 1);
    deadline.mock.mockImplementation(() => false);
    alice.x = 0; alice.z = 0; alice.rotation = 0;
    room.state.players.set("alice", alice);
    const now = performance.now();
    internal.movementInputs.set("alice", { x: 1, z: 0, sprint: false, receivedAt: now });
    const previousX = alice.x;
    internal.step(0.05);
    assert.notEqual(alice.x, previousX, "a retained player is not skipped merely because no clients are connected");
    assert.equal(realtimeRuntimeMetrics.snapshot().counters.emptyRoomTickSkips, after.emptyRoomTickSkips);
  } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); }
});

test("stationary admitted-guest expiry rotates its epoch, removes grants and sends actual room snapshots", async () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"], now: 100_000 });
  const { room, internal } = await fixture();
  const removedRooms: string[] = [];
  const events: { sessionId: string; event: string; payload: unknown }[] = [];
  mock.method(room, "broadcast", (event: string | number, payload: unknown) => {
    for (const client of room.clients) client.send(event, payload);
  });
  let sequence = 0;
  await internal.privacy.dispose();
  internal.privacy = new PrivateConversations("00000000-0000-4000-8000-000000000007", internal.conversations.roomIncarnationId, {
    nowMs: () => Date.now(), id: () => `request-${++sequence}`,
    queries: { authorize: async () => true, owner: async () => null },
    epochs: new PrivateMediaEpochs({ removeRoom: async name => { removedRooms.push(name); }, epoch: () => (++sequence).toString(16).padStart(24, "0") }),
    onChange: () => { if (!internal.reconcilingPrivateAccess) { internal.updateMeetingMembership(); internal.updateProximity(); } },
  });
  for (const id of ["alice", "bob"]) {
    internal.mediaIdentityBySessionId.set(id, `${id}-media`); internal.usernamesBySessionId.set(id, id);
    room.clients.push({ sessionId: id, send(event: string, payload: unknown) { events.push({ sessionId: id, event, payload: structuredClone(payload) }); } } as never);
  }
  const settle = () => new Promise<void>(resolve => setImmediate(resolve));
  const command = async (id: string, action: string, extra: Record<string, unknown> = {}) => {
    mock.timers.tick(1001);
    const result = await internal.privacy.command(id, { requestId: `command-${++sequence}`, zoneId: "room", expectedRevision: internal.privacy.access.revision("room"), action, ...extra });
    assert.equal((result.at(-1)!.payload as { ok: boolean }).ok, true, JSON.stringify(result.at(-1)!.payload));
    await settle();
  };
  try {
    const alice = room.state.players.get("alice")!; alice.x = 15; alice.z = 15;
    internal.updateMeetingMembership(); internal.updateProximity();
    await command("alice", "lock");
    await command("bob", "knock");
    await command("alice", "admit", { knockId: internal.privacy.access.ownKnock("bob", "room")!.id });
    const bob = room.state.players.get("bob")!; bob.x = 15; bob.z = 15;
    internal.updateMeetingMembership(); internal.updateProximity(); await settle();
    assert.ok(await OfficeRoom.getConversationMediaGrant("00000000-0000-4000-8000-000000000007", "bob", "bob-media"));
    const oldDescriptor = internal.privacy.descriptor("room");
    removedRooms.length = 0; events.length = 0;
    mock.timers.tick(PRIVATE_ADMISSION_TTL_MS);
    await settle();
    assert.ok(removedRooms.includes(oldDescriptor.roomName), "expired admission retires its media room");
    assert.ok(internal.privacy.descriptor("room").generation > oldDescriptor.generation);
    assert.equal(internal.privacy.mayHear("bob", "room"), false);
    assert.equal(internal.privacy.canEnter("bob", "room"), false);
    assert.equal(internal.conversations.snapshot("bob").conversation, null);
    for (const sessionId of ["alice", "bob"]) assert.ok(events.some(event => event.sessionId === sessionId && event.event === CONVERSATION_SNAPSHOT_EVENT));
    const guestSnapshots = events.filter(event => event.sessionId === "bob" && event.event === CONVERSATION_SNAPSHOT_EVENT);
    assert.equal((guestSnapshots.at(-1)!.payload as ConversationSnapshot).conversation, null);
    assert.equal(await OfficeRoom.getConversationMediaGrant("00000000-0000-4000-8000-000000000007", "bob", "bob-media"), null);
    assert.ok(await OfficeRoom.getConversationMediaGrant("00000000-0000-4000-8000-000000000007", "alice", "alice-media"));
  } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); mock.timers.reset(); }
});

test("retained meeting locks expire and publish room effects on timers with no ticks or messages", async () => {
  mock.timers.enable({ apis: ["Date", "setTimeout"], now: 100_000 });
  const { room, internal } = await fixture();
  try {
    internal.refreshPrivateAccess();
    internal.privacy.access.lockForMeeting("room", ["alice", "bob"], Date.now());
    internal.refreshPrivateAccess();
    assert.equal(internal.lockedZoneIds.has("room"), true);
    const projection = mock.method(internal, "updateProximity");
    mock.timers.tick(PRIVATE_ADMISSION_TTL_MS);
    assert.equal(internal.lockedZoneIds.has("room"), false);
    assert.equal(projection.mock.callCount(), 1);
    room.onDispose();
    mock.timers.tick(PRIVATE_ADMISSION_TTL_MS);
    assert.equal(projection.mock.callCount(), 1);
  } finally { room.onDispose(); room.clock.stop(); mock.restoreAll(); mock.timers.reset(); }
});
