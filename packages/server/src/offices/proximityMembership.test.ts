import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { PlayerState } from "@gammyverse/shared";
import { RoomServiceClient } from "livekit-server-sdk";
import { OfficeRoom } from "./OfficeRoom.js";
import { proximityRoomName } from "../media/service.js";

const OFFICE_ID = "synthetic-proximity-office";
const INITIAL_PARTICIPANT_COUNT = 24;
const JOINING_PARTICIPANT_INDEX = INITIAL_PARTICIPANT_COUNT;
const DISTANT_POSITION_M = 1_000;
const FIRST_SESSION_ID = "person-0";
const SPLIT_POSITIONS_M = [0, 1, 40, 79, 80];
const BRIDGE_PARTICIPANT_INDEX = 2;
const RIGHT_COMPONENT_SESSION_ID = "person-4";
const JOIN_BOUNDARY_DISTANCES_M = [49, 50, 51];
const EXPECTED_PROXIMITY_RADIUS_M = 50;
const SMALL_GROUP_MEMBER_COUNT = 2;
const SEPARATE_GROUP_POSITION_M = 200;

type RoomInternals = {
  officeId: string;
  world: { proximityRadius: number };
  updateProximity(): void;
  refreshConversations(): void;
  proximityGroupBySessionId: Map<string, string>;
  mediaIdentityBySessionId: Map<string, string>;
  privateZoneIdBySessionId: Map<string, string>;
  meetingMembersBySessionId: Set<string>;
};

function fixture() {
  const room = new OfficeRoom();
  const internal = room as unknown as RoomInternals;
  internal.officeId = OFFICE_ID;
  mock.method(internal, "refreshConversations", () => {});
  const originalEnvironment = { LIVEKIT_URL: process.env.LIVEKIT_URL, LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY, LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET };
  Object.assign(process.env, { LIVEKIT_URL: "ws://unused.invalid", LIVEKIT_API_KEY: "test-key", LIVEKIT_API_SECRET: "test-secret" });
  const retiredRooms: string[] = [];
  const cleanupReleases: (() => void)[] = [];
  const removed: { roomName: string; identity: string }[] = [];
  mock.method(RoomServiceClient.prototype, "listRooms", async (names?: string[]) => {
    const name = names![0]!;
    retiredRooms.push(name);
    await new Promise<void>(resolve => cleanupReleases.push(resolve));
    return [{ name }] as never;
  });
  mock.method(RoomServiceClient.prototype, "listParticipants", async () => [...internal.mediaIdentityBySessionId.values()].map(identity => ({ identity })) as never);
  mock.method(RoomServiceClient.prototype, "removeParticipant", async (roomName: string, identity: string) => { removed.push({ roomName, identity }); return {} as never; });
  function add(index: number, x = 0) {
    const id = `person-${index}`;
    const player = new PlayerState();
    player.presence = "online";
    player.x = x;
    player.z = 0;
    room.state.players.set(id, player);
    internal.mediaIdentityBySessionId.set(id, `${id}-media`);
    return player;
  }
  async function releaseCleanup() {
    for (const release of cleanupReleases.splice(0)) release();
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  async function dispose() {
    await releaseCleanup();
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    room.clock.stop();
    mock.restoreAll();
  }
  return { room, internal, add, retiredRooms, removed, releaseCleanup, dispose };
}

test("a 25th authorized nearby participant keeps all 24 existing members in their current media room", async () => {
  const context = fixture();
  try {
    for (let index = 0; index < INITIAL_PARTICIPANT_COUNT; index++) context.add(index);
    context.internal.updateProximity();
    const original = context.internal.proximityGroupBySessionId.get(FIRST_SESSION_ID);
    assert.ok(original);
    context.add(JOINING_PARTICIPANT_INDEX);
    context.internal.updateProximity();
    assert.equal(new Set(context.internal.proximityGroupBySessionId.values()).size, 1);
    assert.equal(context.internal.proximityGroupBySessionId.get(FIRST_SESSION_ID), original);
    await context.releaseCleanup();
    assert.deepEqual(context.retiredRooms, []);
    assert.deepEqual(context.removed, []);
  } finally { await context.dispose(); }
});

test("departures, private entry and away status rotate incarnations; delayed cleanup cannot evict current members", async () => {
  const context = fixture();
  try {
    for (let index = 0; index <= INITIAL_PARTICIPANT_COUNT; index++) context.add(index);
    context.internal.updateProximity();
    const original = context.internal.proximityGroupBySessionId.get(FIRST_SESSION_ID)!;
    context.room.state.players.get(`person-${JOINING_PARTICIPANT_INDEX}`)!.x = DISTANT_POSITION_M;
    context.internal.updateProximity();
    const afterDeparture = context.internal.proximityGroupBySessionId.get(FIRST_SESSION_ID)!;
    assert.notEqual(afterDeparture, original, "departed members cannot reuse their old room token");
    context.internal.privateZoneIdBySessionId.set("person-1", "private-desk");
    context.internal.updateProximity();
    const afterPrivateEntry = context.internal.proximityGroupBySessionId.get(FIRST_SESSION_ID)!;
    assert.notEqual(afterPrivateEntry, afterDeparture);
    assert.equal(context.internal.proximityGroupBySessionId.has("person-1"), false);
    context.room.state.players.get("person-2")!.presence = "away";
    context.internal.updateProximity();
    const current = context.internal.proximityGroupBySessionId.get(FIRST_SESSION_ID)!;
    assert.notEqual(current, afterPrivateEntry);
    assert.equal(context.internal.proximityGroupBySessionId.has("person-2"), false);
    await context.releaseCleanup();
    assert.deepEqual(new Set(context.retiredRooms), new Set([original, afterDeparture, afterPrivateEntry].map(id => proximityRoomName(OFFICE_ID, id))));
    assert.ok(context.removed.some(entry => entry.identity === `person-${JOINING_PARTICIPANT_INDEX}-media`));
    assert.ok(context.removed.some(entry => entry.identity === "person-1-media"));
    assert.ok(context.removed.some(entry => entry.identity === "person-2-media"));
    assert.equal(context.removed.some(entry => entry.roomName === proximityRoomName(OFFICE_ID, current)), false);
  } finally { await context.dispose(); }
});

test("merging retains the larger authorized incarnation and retires only the smaller old room", async () => {
  const context = fixture();
  try {
    for (let offset = 0; offset < SMALL_GROUP_MEMBER_COUNT; offset++) context.add(INITIAL_PARTICIPANT_COUNT + offset, SEPARATE_GROUP_POSITION_M);
    for (let index = 0; index < INITIAL_PARTICIPANT_COUNT; index++) context.add(index);
    context.internal.updateProximity();
    const large = context.internal.proximityGroupBySessionId.get(FIRST_SESSION_ID)!;
    const small = context.internal.proximityGroupBySessionId.get(`person-${INITIAL_PARTICIPANT_COUNT}`)!;
    assert.ok(large);
    assert.ok(small);
    assert.notEqual(large, small);
    for (let offset = 0; offset < SMALL_GROUP_MEMBER_COUNT; offset++) context.room.state.players.get(`person-${INITIAL_PARTICIPANT_COUNT + offset}`)!.x = 0;
    context.internal.updateProximity();
    assert.equal(new Set(context.internal.proximityGroupBySessionId.values()).size, 1);
    assert.equal(context.internal.proximityGroupBySessionId.get(FIRST_SESSION_ID), large);
    await context.releaseCleanup();
    assert.deepEqual(context.retiredRooms, [proximityRoomName(OFFICE_ID, small)]);
    assert.equal(context.removed.length, SMALL_GROUP_MEMBER_COUNT);
    assert.equal(context.removed.some(entry => entry.roomName === proximityRoomName(OFFICE_ID, large)), false);
  } finally { await context.dispose(); }
});

test("replacing a session at the same position cannot inherit its retired incarnation", async () => {
  const context = fixture();
  try {
    for (let index = 0; index < INITIAL_PARTICIPANT_COUNT; index++) context.add(index);
    context.internal.updateProximity();
    const original = context.internal.proximityGroupBySessionId.get(FIRST_SESSION_ID)!;
    context.room.state.players.delete("person-1");
    context.add(JOINING_PARTICIPANT_INDEX);
    context.internal.updateProximity();
    const current = context.internal.proximityGroupBySessionId.get(FIRST_SESSION_ID)!;
    assert.notEqual(current, original);
    assert.equal(context.internal.proximityGroupBySessionId.get(`person-${JOINING_PARTICIPANT_INDEX}`), current);
    await context.releaseCleanup();
    assert.deepEqual(context.retiredRooms, [proximityRoomName(OFFICE_ID, original)]);
    assert.ok(context.removed.some(entry => entry.identity === "person-1-media"));
    assert.equal(context.removed.some(entry => entry.identity === `person-${JOINING_PARTICIPANT_INDEX}-media`), false);
  } finally { await context.dispose(); }
});

test("splitting a connected group retires the old incarnation for both surviving components", async () => {
  const context = fixture();
  try {
    SPLIT_POSITIONS_M.forEach((x, index) => context.add(index, x));
    context.internal.updateProximity();
    const original = context.internal.proximityGroupBySessionId.get(FIRST_SESSION_ID)!;
    assert.ok(original);
    assert.equal(context.internal.proximityGroupBySessionId.get(RIGHT_COMPONENT_SESSION_ID), original);
    context.room.state.players.get(`person-${BRIDGE_PARTICIPANT_INDEX}`)!.x = DISTANT_POSITION_M;
    context.internal.updateProximity();
    const left = context.internal.proximityGroupBySessionId.get(FIRST_SESSION_ID)!;
    const right = context.internal.proximityGroupBySessionId.get(RIGHT_COMPONENT_SESSION_ID)!;
    assert.ok(left);
    assert.ok(right);
    assert.notEqual(left, original);
    assert.notEqual(right, original);
    assert.notEqual(left, right);
    await context.releaseCleanup();
    assert.deepEqual(context.retiredRooms, [proximityRoomName(OFFICE_ID, original)]);
    assert.equal(context.removed.length, SPLIT_POSITIONS_M.length);
  } finally { await context.dispose(); }
});

test("actual campus room membership includes 49 and 50 m, excluding a fresh 51 m pair", async () => {
  for (const distanceM of JOIN_BOUNDARY_DISTANCES_M) {
    const context = fixture();
    try {
      context.add(0);
      context.add(1, distanceM);
      context.internal.updateProximity();
      assert.equal(context.internal.proximityGroupBySessionId.has(FIRST_SESSION_ID), distanceM <= EXPECTED_PROXIMITY_RADIUS_M, `distance ${distanceM} m`);
    } finally { await context.dispose(); }
  }
});
