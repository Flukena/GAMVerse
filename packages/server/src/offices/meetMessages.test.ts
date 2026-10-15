import assert from "node:assert/strict";
import test from "node:test";
import { CAMPUS_WORLD, type MeetOffer, type MeetOfferSnapshot } from "@gammyverse/shared";
import { MeetMessages, type MeetState } from "./meetMessages.js";
import type { MeetGeometry, MeetRoutePlan, MeetTravelParticipant } from "./meetRoutePlanner.js";
const OFFICE_ID = "office-1";
const FROM_ID = "alice-session";
const TO_ID = "bob-session";
const NOW_MS = 100_000;
const CREATE = { requestId: "create-1", kind: "meet" as const, targetSessionId: TO_ID };
function fixture() {
  let nowMs = NOW_MS;
  let counter = 0;
  let roleCalls = 0;
  let authorize: () => Promise<string | null> = async () => "user";
  const people = new Map<string, MeetTravelParticipant>();
  for (const [username, x] of [["alice", -6], ["bob", 6], ["eve", 10]] as const) people.set(`${username}-session`, { username, displayName: username, sessionId: `${username}-session`, x, z: 0, active: true, presence: "online", vehicleId: "", status: "available" });
  const geometry: MeetGeometry = { world: { ...CAMPUS_WORLD, width: 40, depth: 40, walls: [], obstacles: [], collisionGrid: undefined }, layout: { version: 1, props: [], zones: [], walls: [], doors: [] }, lockedZoneIds: new Set(), revision: 1 };
  const commits: MeetRoutePlan[] = [];
  const events: Array<{ sessionId: string; event: string; payload: unknown }> = [];
  const state: MeetState = { participant: id => people.get(id), geometry: () => geometry, commit: plan => { commits.push(plan); }, send: (sessionId, event, payload) => { events.push({ sessionId, event, payload: structuredClone(payload) }); } };
  const messages = new MeetMessages(OFFICE_ID, "incarnation-1", state, { nowMs: () => nowMs, id: () => `offer-${++counter}`, role: async () => { roleCalls += 1; return authorize(); } });
  const offers = () => messages.requests.visible(FROM_ID);
  const offer = () => offers()[0]!;
  const action = (actionName: "accept" | "decline" | "cancel", sessionId = TO_ID, selected: MeetOffer = offer()) => messages.action({ sessionId }, { requestId: `action-${actionName}`, offerId: selected.id, expectedRevision: 1, action: actionName });
  return { messages, people, geometry, commits, events, offers, offer, action, roles: () => roleCalls, authorize: (next: typeof authorize) => { authorize = next; }, advance: (elapsedMs: number) => { nowMs += elapsedMs; } };
}
test("creation is party-only, correlated and idempotent; accepted replay commits only once", async () => {
  const f = fixture();
  await f.messages.create({ sessionId: FROM_ID }, CREATE);
  assert.deepEqual(new Set(f.events.map(event => event.sessionId)), new Set([FROM_ID, TO_ID]));
  const ack = [...f.events].reverse().find(event => (event.payload as MeetOfferSnapshot).requestId === CREATE.requestId);
  assert.ok(ack);
  const beforeRoles = f.roles();
  await f.messages.create({ sessionId: FROM_ID }, CREATE);
  assert.equal(f.offers().length, 1); assert.equal(f.roles(), beforeRoles);
  await f.action("accept"); await f.action("accept");
  assert.equal(f.commits.length, 1); assert.equal(f.offer().state, "accepted");
  assert.equal(f.commits[0]!.routes.length, 2);
});
test("third party and wrong party actions are denied before membership work", async () => {
  const f = fixture(); await f.messages.create({ sessionId: FROM_ID }, CREATE);
  const beforeRoles = f.roles();
  await f.action("accept", "eve-session"); await f.action("cancel", TO_ID); await f.action("decline", FROM_ID);
  assert.equal(f.roles(), beforeRoles); assert.equal(f.offer().state, "pending"); assert.deepEqual(f.commits, []);
  assert.equal(f.events.filter(event => event.event === "meet-error").length, 3);
});
test("cancel, decline, expiry and departure are terminal and cannot be accepted", async () => {
  for (const ending of ["cancel", "decline", "expire", "drop"] as const) {
    const f = fixture(); await f.messages.create({ sessionId: FROM_ID }, CREATE);
    if (ending === "cancel") await f.action("cancel", FROM_ID);
    if (ending === "decline") await f.action("decline");
    if (ending === "expire") { f.advance(30_000); f.messages.expire(); }
    if (ending === "drop") f.messages.removeSession(FROM_ID);
    await f.action("accept"); assert.deepEqual(f.commits, [], ending);
    assert.notEqual(f.offer().state, "pending", ending);
  }
});
test("new intent, map refresh, expiry and cancellation during authorization cannot overwrite a newer route", async () => {
  for (const interruption of ["intent", "map", "expiry", "cancel", "status", "drop"] as const) {
    const f = fixture(); await f.messages.create({ sessionId: FROM_ID }, CREATE);
    let release!: () => void;
    const membership = new Promise<string>(resolve => { release = () => resolve("user"); });
    f.authorize(() => membership);
    const accepting = f.action("accept");
    if (interruption === "intent") f.messages.intentChanged(TO_ID);
    if (interruption === "map") f.messages.mapChanged();
    if (interruption === "expiry") f.advance(30_000);
    if (interruption === "cancel") await f.action("cancel", FROM_ID);
    if (interruption === "status") f.people.get(TO_ID)!.status = "away";
    if (interruption === "drop") { f.people.delete(TO_ID); f.messages.removeSession(TO_ID); }
    release(); await accepting;
    assert.deepEqual(f.commits, [], interruption); assert.notEqual(f.offer().state, "accepted", interruption);
  }
});
test("fresh membership denial and failed second route never partially commit either participant", async () => {
  const denied = fixture(); await denied.messages.create({ sessionId: FROM_ID }, CREATE);
  denied.authorize(async () => null); await denied.action("accept");
  assert.deepEqual(denied.commits, []); assert.equal(denied.offer().state, "unavailable");
  const blocked = fixture(); await blocked.messages.create({ sessionId: FROM_ID }, CREATE);
  blocked.geometry.world = { ...blocked.geometry.world, walls: [{ x: 0, z: 0, width: 1, depth: 40 }] };
  await blocked.action("accept"); assert.deepEqual(blocked.commits, []); assert.equal(blocked.offer().state, "unavailable");
});
test("outgoing limit and create rate reject before additional asynchronous membership calls", async () => {
  const f = fixture();
  let release!: () => void;
  const membership = new Promise<string>(resolve => { release = () => resolve("user"); });
  f.authorize(() => membership);
  const first = f.messages.create({ sessionId: FROM_ID }, CREATE);
  await f.messages.create({ sessionId: FROM_ID }, { ...CREATE, requestId: "second" });
  assert.equal(f.roles(), 2);
  release(); await first;
  f.advance(1000);
  await f.messages.create({ sessionId: FROM_ID }, { ...CREATE, requestId: "third" });
  assert.equal(f.roles(), 2); assert.equal(f.offers().length, 1);
});


test("availability transition terminates offers once and suppresses later acceptance", async () => {
  const f = fixture(); await f.messages.create({ sessionId: FROM_ID }, CREATE);
  f.people.get(TO_ID)!.status = "do-not-disturb";
  f.messages.enforceAvailability();
  const revision = f.messages.requests.revision;
  f.messages.enforceAvailability();
  assert.equal(f.messages.requests.revision, revision);
  assert.equal(f.offer().state, "unavailable");
  await f.action("accept"); assert.deepEqual(f.commits, []);
});

test("unavailable participant at accept immediately publishes the terminal offer to both parties", async () => {
  const f = fixture(); await f.messages.create({ sessionId: FROM_ID }, CREATE);
  f.events.length = 0;
  f.people.get(TO_ID)!.status = "away";
  await f.action("accept");
  const snapshots = f.events.filter(event => event.event === "meet-offers");
  assert.deepEqual(new Set(snapshots.map(event => event.sessionId)), new Set([FROM_ID, TO_ID]));
  assert.ok(snapshots.every(event => (event.payload as MeetOfferSnapshot).offers[0]?.state === "unavailable"));
});
