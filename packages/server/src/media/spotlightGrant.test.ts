import assert from "node:assert/strict";
import test from "node:test";
import type { RoomServiceClient } from "livekit-server-sdk";
import { SPOTLIGHT_REVOKE_DEADLINE_MS } from "@gammyverse/shared";
import { Spotlight } from "../offices/spotlight.js";
import { mintSpotlightGrant, SpotlightAuthorizationError } from "./spotlightGrant.js";
import { revokeSpotlightParticipant } from "./service.js";
async function activate(spotlight: Spotlight, requester: string, target: string) {
  await spotlight.command(requester, { action: "request", targetUsername: target });
  const request = spotlight.requestSnapshot(target).incoming[0]!;
  await spotlight.command(target, { action: "respond", requestId: request.id, accept: true });
}
function makeSpotlight() {
  return new Spotlight("office", {
    role: async () => "admin",
    revoke: async () => {},
    changed: () => {},
  });
}
test("non-spotlight publish denied, subscribe permitted, membership checked after mint", async () => {
  const spotlight = makeSpotlight();
  let role: string | null = "user";
  const dependencies = {
    role: async () => role,
    mint: async (roomName: string) => ({
      url: "wss://media.test",
      roomName,
      token: "fixture",
    }),
  };
  await assert.rejects(
    mintSpotlightGrant(spotlight, "bob", "id", true, dependencies),
  );
  assert.equal(
    (await mintSpotlightGrant(spotlight, "bob", "id", false, dependencies))
      .publish,
    false,
  );
  await assert.rejects(
    mintSpotlightGrant(spotlight, "bob", "id", false, {
      ...dependencies,
      mint: async (roomName) => {
        role = null;
        return { url: "wss://media.test", roomName, token: "fixture" };
      },
    }),
  );
});
test("publisher removal during mint prevents stale publisher grant response", async () => {
  const spotlight = makeSpotlight();
  await activate(spotlight, "admin", "bob");
  await assert.rejects(
    mintSpotlightGrant(spotlight, "bob", "id", true, {
      role: async () => "user",
      mint: async (roomName) => {
        await spotlight.remove("bob");
        return { url: "wss://media.test", roomName, token: "old" };
      },
    }),
  );
});
test("LiveKit service seam receives removeParticipant within deadline and epoch isolates current room", async () => {
  const calls: {
    room: string;
    identity: string;
    at: number;
  }[] = [];
  const service = {
    listRooms: async () => [{ name: "room" }],
    listParticipants: async () => [{ identity: "bob-id" }],
    removeParticipant: async (room: string, identity: string) => {
      calls.push({ room, identity, at: Date.now() });
    },
  } as unknown as Pick<
    RoomServiceClient,
    "listRooms" | "listParticipants" | "removeParticipant"
  >;
  const spotlight = new Spotlight("office", {
    role: async () => "admin",
    revoke: (room, identity) =>
      revokeSpotlightParticipant(room, identity, service),
    changed: () => {},
  });
  await activate(spotlight, "admin", "bob");
  spotlight.track("bob", "bob-id");
  const oldRoom = spotlight.grant("bob", true)!.roomName;
  const offAt = Date.now();
  await spotlight.remove("bob");
  assert.equal(calls[0]!.room, oldRoom);
  assert.equal(calls[0]!.identity, "bob-id");
  assert.ok(calls[0]!.at - offAt < SPOTLIGHT_REVOKE_DEADLINE_MS);
  assert.notEqual(spotlight.grant("bob", false)!.roomName, oldRoom);
  assert.equal(spotlight.grant("bob", true), null);
});
test("spotlight-off while final membership read awaits denies cached publisher grant", async () => {
  const spotlight = makeSpotlight();
  await activate(spotlight, "admin", "bob");
  let reads = 0;
  await assert.rejects(
    mintSpotlightGrant(spotlight, "bob", "id", true, {
      role: async () => {
        reads += 1;
        if (reads === 2) await spotlight.remove("bob");
        return "user";
      },
      mint: async (roomName) => ({
        url: "wss://media.test",
        roomName,
        token: "stale",
      }),
    }),
  );
});
test(
  "hung LiveKit removal fails within named revoke deadline",
  { timeout: SPOTLIGHT_REVOKE_DEADLINE_MS * 3 },
  async () => {
    let attempts = 0;
    const spotlight = new Spotlight("office", {
      role: async () => "admin",
      revoke: () => {
        attempts += 1;
        return new Promise(() => {});
      },
      changed: () => {},
    });
    await activate(spotlight, "admin", "bob");
    spotlight.track("bob", "id");
    await assert.rejects(spotlight.remove("bob"), /deadline exceeded/);
    assert.equal(attempts, 2);
  },
);

test("a non-rotating drop between track and mint denies the grant", async () => {
  const spotlight = makeSpotlight();
  await assert.rejects(
    mintSpotlightGrant(spotlight, "bob", "id", false, {
      role: async () => "user",
      mint: async (roomName) => {
        await spotlight.depart("bob", "drop");
        return { url: "wss://media.test", roomName, token: "fixture" };
      },
    }),
    SpotlightAuthorizationError,
  );
});
