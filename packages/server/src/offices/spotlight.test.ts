import assert from "node:assert/strict";
import test from "node:test";
import { getRecentServerErrorCount } from "../infra/logger.js";
import { Spotlight, spotlightDepartureReason } from "./spotlight.js";
test("only current owner/admin commands and publish eligibility follows revocation epoch", async () => {
  let role = "user";
  const removed: string[] = [];
  const spotlight = new Spotlight("office", {
    role: async () => role,
    revoke: async (room, identity) => {
      removed.push(room + identity);
    },
    changed: () => {},
  });
  await assert.rejects(
    spotlight.command("alice", { targetUsername: "bob", on: true }),
  );
  role = "admin";
  await spotlight.command("alice", { targetUsername: "bob", on: true });
  assert.equal(spotlight.grant("carol", true), null);
  const old = spotlight.grant("bob", true)!;
  spotlight.track("bob", "identity");
  await spotlight.command("alice", { targetUsername: "bob", on: false });
  assert.equal(spotlight.grant("bob", true), null);
  assert.notEqual(spotlight.grant("bob", false)!.epoch, old.epoch);
  assert.equal(removed.length, 1);
  role = "user";
  await assert.rejects(
    spotlight.command("alice", { targetUsername: "bob", on: true }),
  );
});
test("subscriber leave keeps epoch and removes only own identities", async () => {
  const removed: string[] = [];
  const spotlight = new Spotlight("office", {
    role: async () => "admin",
    revoke: async (_room, identity) => {
      removed.push(identity);
    },
    changed: () => {},
  });
  spotlight.track("alice", "old-session");
  spotlight.track("alice", "new-session");
  spotlight.track("bob", "listener");
  const old = spotlight.grant("bob", false)!;
  await spotlight.remove("alice");
  assert.equal(spotlight.grant("bob", false)!.epoch, old.epoch);
  assert.deepEqual(removed.sort(), ["new-session", "old-session"]);
});

test("publisher drop keeps spotlight membership and subscriber drop does not kick others", async () => {
  const removed: string[] = [];
  const spotlight = new Spotlight("office", {
    role: async () => "admin",
    revoke: async (_room, identity) => {
      removed.push(identity);
    },
    changed: () => {},
  });
  await spotlight.command("admin", { targetUsername: "bob", on: true });
  spotlight.track("bob", "publisher");
  spotlight.track("alice", "listener");
  const epoch = spotlight.snapshot().epoch;
  await spotlight.depart("alice", "drop");
  assert.deepEqual(removed, ["listener"]);
  assert.equal(spotlight.snapshot().epoch, epoch);
  await spotlight.depart("bob", "drop");
  assert.deepEqual(spotlight.snapshot().usernames, ["bob"]);
  assert.equal(spotlight.snapshot().epoch, epoch);
});
test("security departure rotates even for subscriber and publisher replacement rotates", async () => {
  const spotlight = new Spotlight("office", {
    role: async () => "admin",
    revoke: async () => {},
    changed: () => {},
  });
  let epoch = spotlight.snapshot().epoch;
  await spotlight.depart("alice", "security");
  assert.notEqual(spotlight.snapshot().epoch, epoch);
  await spotlight.command("admin", { targetUsername: "bob", on: true });
  epoch = spotlight.snapshot().epoch;
  await spotlight.depart("bob", "replace");
  assert.notEqual(spotlight.snapshot().epoch, epoch);
  assert.equal(spotlight.grant("bob", true), null);
});
test("failed removal retries once and counts fixed-labelled error", async () => {
  let attempts = 0;
  const spotlight = new Spotlight("office", {
    role: async () => "admin",
    revoke: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary");
    },
    changed: () => {},
  });
  spotlight.track("bob", "identity");
  const errorsBefore = getRecentServerErrorCount();
  await spotlight.remove("bob");
  assert.equal(attempts, 2);
  assert.equal(getRecentServerErrorCount(), errorsBefore + 1);
});

test("departure reason maps close codes: 4003/4004 are security in both phases", () => {
  for (const phase of ["drop", "leave"] as const) {
    assert.equal(spotlightDepartureReason(4003, phase), "security");
    assert.equal(spotlightDepartureReason(4004, phase), "security");
  }
});
test("departure reason keeps phase for consented, abnormal and other codes", () => {
  assert.equal(spotlightDepartureReason(4000, "leave"), "leave");
  assert.equal(spotlightDepartureReason(1006, "drop"), "drop");
  assert.equal(spotlightDepartureReason(1006, "leave"), "leave");
  assert.equal(spotlightDepartureReason(undefined, "drop"), "drop");
  assert.equal(spotlightDepartureReason(4001, "drop"), "drop");
});
test("security departure removes a publisher from the set and rotates immediately", async () => {
  const removed: string[] = [];
  const spotlight = new Spotlight("office", {
    role: async () => "admin",
    revoke: async (_room, identity) => {
      removed.push(identity);
    },
    changed: () => {},
  });
  await spotlight.command("admin", { targetUsername: "bob", on: true });
  spotlight.track("bob", "publisher");
  spotlight.track("carol", "listener");
  const before = spotlight.grant("bob", true)!.epoch;
  await spotlight.depart("bob", spotlightDepartureReason(4003, "drop"));
  assert.equal(spotlight.grant("bob", true), null);
  assert.notEqual(spotlight.grant("carol", false)!.epoch, before);
  assert.deepEqual(removed.sort(), ["listener", "publisher"]);
});
test("a plain drop of a publisher does not rotate (contrast with security)", async () => {
  const spotlight = new Spotlight("office", {
    role: async () => "admin",
    revoke: async () => {},
    changed: () => {},
  });
  await spotlight.command("admin", { targetUsername: "bob", on: true });
  const before = spotlight.grant("bob", true)!.epoch;
  await spotlight.depart("bob", spotlightDepartureReason(1006, "drop"));
  assert.equal(spotlight.grant("bob", true)!.epoch, before);
});

test("spotlight closure is idempotent and denies grants and tracking", async () => {
  const username = "closed-publisher";
  const identity = "closed-identity";
  let rotations = 0;
  const spotlight = new Spotlight("closed-office", {
    role: async () => "owner", revoke: async () => {},
    changed: () => { rotations += 1; },
  });
  await spotlight.command(username, { targetUsername: username, on: true });
  const before = rotations;
  await spotlight.close();
  await spotlight.close();
  assert.equal(rotations - before, 1);
  assert.equal(spotlight.grant(username, false), null);
  spotlight.track(username, identity);
  assert.equal(spotlight.isTracked(username, identity), false);
});

test("spotlight command awaiting authorization cannot repopulate a closed office", async () => {
  const username = "waiting-publisher";
  let resolveRole!: (role: string) => void;
  const role = new Promise<string>(resolve => { resolveRole = resolve; });
  const spotlight = new Spotlight("waiting-office", {
    role: () => role, revoke: async () => {}, changed: () => {},
  });
  const command = spotlight.command(username, { targetUsername: username, on: true });
  await spotlight.close();
  resolveRole("owner");
  await assert.rejects(command, /access changed/);
  assert.deepEqual(spotlight.snapshot().usernames, []);
});

test("spotlight batch security departure rotates once and preserves other publisher consent", async () => {
  const departing = "departing-publisher";
  const retained = "retained-publisher";
  let rotations = 0;
  const spotlight = new Spotlight("batch-office", {
    role: async () => "owner", revoke: async () => {},
    changed: () => { rotations += 1; },
  });
  await spotlight.command(departing, { targetUsername: departing, on: true });
  await spotlight.command(retained, { targetUsername: retained, on: true });
  const before = rotations;
  await spotlight.departSecurity([departing, "subscriber"]);
  assert.equal(rotations - before, 1);
  assert.deepEqual(spotlight.snapshot().usernames, [retained]);
  assert.equal(spotlight.grant(departing, true), null);
  assert.equal(spotlight.grant(retained, true)?.publish, true);
});
