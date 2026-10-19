import assert from "node:assert/strict";
import test from "node:test";
import { PlayerState, type AvailabilityProfile } from "@gammyverse/shared";
import { AvailabilityMessages, applyPlayerAvailability, playerAvailability, STATUS_UPDATE_MIN_INTERVAL_MS } from "./availabilityMessages.js";
const SESSION_ID = "session-alice";
const USERNAME = "alice";
const OFFICE_ID = "office-one";
const CUSTOM = { text: "Reading", emoji: "📚", expiresAtMs: null };
function fixture() {
  const player = new PlayerState();
  applyPlayerAvailability(player, { status: "available", customStatus: CUSTOM });
  const players = new Map([[SESSION_ID, player]]);
  const saves: AvailabilityProfile[] = [];
  const events: unknown[] = [];
  const errors: unknown[] = [];
  let nowMs = 1_000_000;
  let failure: Error | undefined;
  let delay: Promise<void> | undefined;
  const controller = new AvailabilityMessages(OFFICE_ID, { onMessage() {}, broadcast(event, payload) { events.push({ event, payload }); } }, {
    username: id => players.has(id) ? USERNAME : undefined, player: id => players.get(id), sessions: () => players.keys(), maintainer: () => false,
  }, {
    async load() { return saves.at(-1) ?? { status: "available", customStatus: CUSTOM }; },
    async save(username, officeId, profile) { assert.equal(username, USERNAME); assert.equal(officeId, OFFICE_ID); await delay; if (failure) throw failure; saves.push(profile); },
  }, () => nowMs);
  const client = { sessionId: SESSION_ID, send(event: string, payload: unknown) { errors.push({ event, payload }); } };
  return { controller, player, players, saves, events, errors, client, advance() { nowMs += STATUS_UPDATE_MIN_INTERVAL_MS; }, fail(error: Error) { failure = error; }, delay(promise: Promise<void>) { delay = promise; } };
}
test("legacy command preserves custom, explicit null clears, authenticated username owns update", async () => {
  const f = fixture();
  await f.controller.command(f.client, { status: "away", username: "victim" });
  assert.deepEqual(playerAvailability(f.player), { status: "away", customStatus: CUSTOM });
  f.advance();
  await f.controller.command(f.client, { status: "do-not-disturb", customStatus: null });
  assert.deepEqual(playerAvailability(f.player), { status: "do-not-disturb", customStatus: null });
  assert.equal(f.events.length, 2);
});
test("failed persistence preserves authoritative state and reports failure", async () => {
  const f = fixture(); f.fail(new Error("storage unavailable"));
  await f.controller.command(f.client, { status: "away", customStatus: null });
  assert.equal(f.player.status, "available"); assert.equal(f.events.length, 0); assert.equal(f.errors.length, 1);
});
test("missing session and invalid payload cannot write", async () => {
  const f = fixture();
  await f.controller.command({ ...f.client, sessionId: "attacker" }, { status: "away" });
  await f.controller.command(f.client, { status: "invented" });
  assert.equal(f.saves.length, 0); assert.equal(f.player.status, "available");
});
test("expired custom clears and broadcasts exactly once without storage writes", () => {
  const f = fixture(); const expiresAtMs = 1000;
  applyPlayerAvailability(f.player, { status: "away", customStatus: { ...CUSTOM, expiresAtMs } });
  f.controller.expire(expiresAtMs); f.controller.expire(expiresAtMs);
  assert.deepEqual(playerAvailability(f.player), { status: "away", customStatus: null });
  assert.equal(f.events.length, 1); assert.equal(f.saves.length, 0);
});
test("inflight stale session never broadcasts to replacement; queued newer intent wins", async () => {
  const f = fixture(); let resolve!: () => void;
  f.delay(new Promise<void>(done => { resolve = done; }));
  const stale = f.controller.command(f.client, { status: "away" });
  await Promise.resolve();
  f.players.delete(SESSION_ID); resolve(); await stale;
  assert.equal(f.events.length, 0);
  f.players.set(SESSION_ID, f.player);
  f.advance();
  const first = f.controller.command(f.client, { status: "in-meeting" });
  const second = f.controller.command(f.client, { status: "available", customStatus: null });
  await Promise.all([first, second]);
  assert.equal(f.player.status, "in-meeting");
  assert.equal(f.errors.length, 1);
  f.advance();
  await f.controller.command(f.client, { status: "available", customStatus: null });
  assert.deepEqual(await f.controller.load(USERNAME, false), { status: "available", customStatus: null });
});
test("disposed room cannot accept or finish pending writes", async () => {
  const f = fixture(); f.controller.dispose();
  await f.controller.command(f.client, { status: "away" });
  assert.equal(f.saves.length, 0);
});

test("pending update rejects a flood without losing its correlated acknowledgement", async () => {
  const f = fixture(); let resolve!: () => void;
  f.delay(new Promise<void>(done => { resolve = done; }));
  const accepted = f.controller.command(f.client, { status: "away", requestId: "accepted-request" });
  const FLOOD_COMMAND_COUNT = 100;
  const flood = Array.from({ length: FLOOD_COMMAND_COUNT }, (_, index) => f.controller.command(f.client, { status: "available", requestId: `rejected-${index}` }));
  const rejectedCount = f.errors.length;
  resolve(); await Promise.all([accepted, ...flood]);
  assert.equal(rejectedCount, FLOOD_COMMAND_COUNT);
  assert.equal(f.saves.length, 1);
  assert.deepEqual(f.events, [{ event: "user-status", payload: { sessionId: SESSION_ID, status: "away", customStatus: CUSTOM, requestId: "accepted-request" } }]);
  await f.controller.command(f.client, { status: "available", requestId: "rate-limited" });
  assert.equal(f.saves.length, 1);
  assert.deepEqual(f.errors.at(-1), { event: "user-status-error", payload: { error: "Availability update is busy. Try again shortly.", requestId: "rate-limited" } });
});
