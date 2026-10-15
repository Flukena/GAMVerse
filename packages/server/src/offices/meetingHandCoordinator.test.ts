import { HAND_RAISE_MAX_DURATION_MS } from "./handRaiseLifetime.js";
import assert from "node:assert/strict";
import test from "node:test";
import { CONVERSATION_ACTION_MIN_INTERVAL_MS, MEETING_HANDS_SNAPSHOT_EVENT, PlayerState, type MeetingHandsSnapshot } from "@gammyverse/shared";
import { MeetingHandCoordinator, type MeetingHandEvent } from "./meetingHandCoordinator.js";
import { SpatialConversations, type SpatialConversationMember } from "./spatialConversations.js";
import { SessionSecurity } from "./sessionSecurity.js";
import { registerMeetingHandMessages } from "./meetingHandMessages.js";
import { registerSocialMessages, unregisterSocialMessages } from "./socialMessages.js";
import { OfficeState } from "@gammyverse/shared";

const OFFICE_ID = "hand-office";
const REQUEST_ID = "12345678-1234-4234-8234-123456789abc";
const NAMES = ["alice", "bob", "charlie"];

function fixture() {
  let nowMs = 0;
  const players = new Map<string, PlayerState>();
  const security = new SessionSecurity();
  const conversations = new SpatialConversations(OFFICE_ID);
  const zones = new Map<string, { id: string }>();
  const admitted = new Set(NAMES);
  const people: SpatialConversationMember[] = NAMES.map(username => {
    const player = new PlayerState();
    player.username = username;
    player.presence = "online";
    players.set(username, player);
    security.activate(username, username, `${username}-token`);
    return { id: username, username, displayName: username, sessionId: username, characterId: "character", mediaIdentity: `${username}-media`, kind: "meeting", targetId: "meeting" };
  });
  conversations.reconcile(people);
  const queries = {
    account: async (token: string | undefined) => {
      const username = token?.replace("-token", "");
      return username ? { username, role: "user" } : null;
    },
    officeRole: async () => "user" as string | null,
  };
  const coordinator = new MeetingHandCoordinator(OFFICE_ID, conversations.roomIncarnationId,
    { players, security, conversations, zones, privacy: { mayHear: id => admitted.has(id) } }, queries, () => nowMs);
  const context = () => ({ officeId: OFFICE_ID, roomIncarnationId: conversations.roomIncarnationId, conversationId: conversations.snapshot("alice").conversation!.id });
  const command = (raised: boolean) => ({ ...context(), requestId: REQUEST_ID, raised });
  const advance = (elapsedMs = CONVERSATION_ACTION_MIN_INTERVAL_MS) => { nowMs += elapsedMs; };
  coordinator.refresh();
  return { players, security, conversations, zones, admitted, people, queries, coordinator, context, command, advance };
}

function queue(events: MeetingHandEvent[], sessionId = "alice"): MeetingHandsSnapshot {
  const snapshot = events.find(event => event.sessionId === sessionId && event.event === MEETING_HANDS_SNAPSHOT_EVENT)?.payload;
  assert.ok(snapshot && "entries" in snapshot);
  return snapshot;
}

test("three admitted members use server FIFO; duplicate raise is stable and re-raise goes to tail", async () => {
  const f = fixture();
  await f.coordinator.command("bob", f.command(true));
  await f.coordinator.command("alice", f.command(true));
  let events = await f.coordinator.command("charlie", f.command(true));
  const original = queue(events);
  assert.deepEqual(original.entries.map(entry => entry.memberId), ["bob", "alice", "charlie"]);
  f.advance();
  await f.coordinator.command("bob", f.command(true));
  events = await f.coordinator.request("alice", { ...f.context(), requestId: REQUEST_ID });
  assert.deepEqual(queue(events).entries, original.entries);
  assert.equal(queue(events).revision, original.revision);
  f.advance();
  await f.coordinator.command("bob", f.command(false));
  f.advance();
  events = await f.coordinator.command("bob", f.command(true));
  assert.deepEqual(queue(events).entries.map(entry => entry.memberId), ["alice", "charlie", "bob"]);
  assert.ok(queue(events).entries.at(-1)!.orderSequence > original.entries.at(-1)!.orderSequence);
  assert.equal(f.players.get("bob")!.handRaised, true);
});

test("private admission removal clears hand and never sends private queue to the revoked physical occupant", async () => {
  const f = fixture();
  f.zones.set("bob", { id: "meeting" });
  await f.coordinator.command("bob", f.command(true));
  f.admitted.delete("bob");
  const events = f.coordinator.refresh();
  assert.deepEqual(queue(events).entries, []);
  assert.equal(events.some(event => event.sessionId === "bob"), false);
  assert.equal(f.players.get("bob")!.handRaised, false);
  f.advance();
  const denied = await f.coordinator.request("bob", { ...f.context(), requestId: REQUEST_ID });
  assert.equal(denied.some(event => event.event === MEETING_HANDS_SNAPSHOT_EVENT && event.sessionId === "bob"), false);
  assert.equal(denied.some(event => "ok" in event.payload && !event.payload.ok), true);
});

test("stale context, fresh suspension and missing office role deny queue mutations", async () => {
  const f = fixture();
  const wrong = { ...f.command(true), conversationId: "old-conversation" };
  const stale = await f.coordinator.command("alice", wrong);
  assert.equal(stale.some(event => "ok" in event.payload && !event.payload.ok), true);
  f.queries.officeRole = async () => null;
  const denied = await f.coordinator.command("alice", f.command(true));
  assert.equal(denied.some(event => "ok" in event.payload && !event.payload.ok), true);
  assert.equal(f.players.get("alice")!.handRaised, false);
  f.advance();
  f.queries.officeRole = async () => "user";
  f.queries.account = async () => null;
  await f.coordinator.command("alice", f.command(true));
  assert.equal(f.players.get("alice")!.handRaised, false);
});

test("departure, offline, replacement and context changes clear session queue entries", async () => {
  const f = fixture();
  await f.coordinator.command("bob", f.command(true));
  f.players.get("bob")!.presence = "away";
  assert.deepEqual(queue(f.coordinator.refresh()).entries, []);
  assert.equal(f.players.get("bob")!.handRaised, false);
  f.players.get("bob")!.presence = "online";
  f.coordinator.refresh();
  f.advance();
  await f.coordinator.command("bob", f.command(true));
  f.security.activate("bob", "replacement");
  assert.deepEqual(queue(f.coordinator.refresh()).entries, []);
  assert.equal(f.players.get("bob")!.handRaised, false);
  f.advance();
  await f.coordinator.command("alice", f.command(true));
  f.conversations.reconcile(f.people.filter(person => person.id !== "alice"));
  f.coordinator.refresh();
  assert.equal(f.players.get("alice")!.handRaised, false);
});

test("pending authorization cannot restore a hand after A to B to A or drop", async () => {
  const f = fixture();
  let resolveRole!: (role: string | null) => void;
  let started!: () => void;
  const querying = new Promise<void>(resolve => { started = resolve; });
  f.queries.officeRole = () => { started(); return new Promise(resolve => { resolveRole = resolve; }); };
  const pending = f.coordinator.command("alice", f.command(true));
  await querying;
  f.conversations.reconcile(f.people.map(person => person.id === "alice" ? { ...person, targetId: "other" } : person));
  f.coordinator.refresh();
  f.conversations.reconcile(f.people);
  f.coordinator.refresh();
  resolveRole("user");
  const events = await pending;
  assert.equal(f.players.get("alice")!.handRaised, false);
  assert.equal(events.some(event => "ok" in event.payload && event.payload.ok), false);
});

test("request floods perform one fresh read and disposed pending work sends nothing", async () => {
  const f = fixture();
  let reads = 0;
  let resolveRole!: (role: string | null) => void;
  f.queries.officeRole = () => { reads += 1; return new Promise(resolve => { resolveRole = resolve; }); };
  const request = { ...f.context(), requestId: REQUEST_ID };
  const pending = f.coordinator.request("alice", request);
  await new Promise(resolve => setImmediate(resolve));
  await Promise.all(Array.from({ length: 5 }, () => f.coordinator.request("alice", request)));
  assert.equal(reads, 1);
  f.coordinator.dispose();
  resolveRole("user");
  assert.deepEqual(await pending, []);
});

test("legacy button and explicit commands share one queue authority and durable map projection", async () => {
  const f = fixture();
  const handlers = new Map<string, (client: { sessionId: string; send(event: string, payload: unknown): void }, payload: unknown) => void>();
  const sent: MeetingHandEvent[] = [];
  const clients = NAMES.map(sessionId => ({ sessionId, send: (event: string, payload: unknown) => sent.push({ sessionId, event, payload: payload as MeetingHandsSnapshot }) }));
  const room = { clients, state: new OfficeState(), broadcast: () => {}, onMessage: (event: string, handler: typeof handlers extends Map<string, infer T> ? T : never) => { handlers.set(event, handler); } };
  registerMeetingHandMessages(room, f.coordinator);
  registerSocialMessages(room, "legacy-hand-fixture", { username: id => id, player: id => f.players.get(id), people: () => [], client: id => clients.find(client => client.sessionId === id) });
  try {
    handlers.get("hand-raise")!(clients[0], { raised: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.players.get("alice")!.handRaised, true);
    assert.deepEqual(queue(sent).entries.map(entry => entry.memberId), ["alice"]);
    f.advance();
    await f.coordinator.command("alice", f.command(false));
    assert.equal(f.players.get("alice")!.handRaised, false);
    handlers.get("hand-raise")!(clients[0], { raised: "true" });
    assert.equal(f.players.get("alice")!.handRaised, false);
  } finally { unregisterSocialMessages(room, "legacy-hand-fixture", false); }
});

test("outside a conversation the legacy hand remains map only and cannot carry into a new queue", async () => {
  const f = fixture();
  f.conversations.reconcile([]);
  f.coordinator.refresh();
  await f.coordinator.legacy("alice", { raised: true });
  assert.equal(f.players.get("alice")!.handRaised, true);
  f.conversations.reconcile(f.people);
  const events = f.coordinator.refresh();
  assert.equal(f.players.get("alice")!.handRaised, false);
  assert.deepEqual(queue(events).entries, []);
});


test("upstream sixty-second hand expiry lowers the canonical queue and map indicator; repeats cannot extend it", async () => {
  const f = fixture();
  await f.coordinator.command("alice", f.command(true));
  f.advance(HAND_RAISE_MAX_DURATION_MS / 2);
  await f.coordinator.command("alice", f.command(true));
  f.advance(HAND_RAISE_MAX_DURATION_MS / 2);
  const events = f.coordinator.refresh();
  assert.equal(f.players.get("alice")!.handRaised, false);
  assert.deepEqual(queue(events).entries, []);
  f.conversations.reconcile([]);
  f.coordinator.refresh();
  f.advance();
  await f.coordinator.legacy("bob", {raised: true});
  f.advance(HAND_RAISE_MAX_DURATION_MS);
  f.coordinator.refresh();
  assert.equal(f.players.get("bob")!.handRaised, false);
});
