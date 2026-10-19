import assert from "node:assert/strict";
import test from "node:test";
import { PRIVATE_ADMISSION_TTL_MS, PRIVATE_KNOCK_TTL_MS, PRIVATE_ZONE_RESULT_EVENT, type PrivateZoneResult, type RoomLayoutZone } from "@gammyverse/shared";
import { getRecentServerErrorCount } from "../infra/logger.js";
import { PrivateMediaEpochs } from "../media/privateMediaEpoch.js";
import { PrivateConversations } from "./privateConversations.js";
import type { PrivateAccessFrame, PrivatePerson } from "./privateZoneAccess.js";
const ZONE_ID = "desk-zone";
const OFFICE_ID = "office";
const INITIAL_NOW_MS = 100_000;
const ACTION_ADVANCE_MS = 1001;
function fixture(kind: "private" | "meeting" = "private") {
  let nowMs = INITIAL_NOW_MS;
  let sequence = 0;
  let owner: string | null = "alice";
  let ownerRead = async () => owner;
  let authorize = async (_person: PrivatePerson) => true;
  let removeRoom = async (_room: string) => {};
  const removed: string[] = [];
  const people = new Map<string, PrivatePerson>();
  for (const username of ["alice", "bob", "carol", "dave", "eve", "frank"]) people.set(username, {sessionId: username, username, displayName: username, active: true, online: true, sessionToken: "fixture-session"});
  const zone: RoomLayoutZone = {id: ZONE_ID, kind, name: "Private desk", ownerUsername: kind === "private" ? "alice" : undefined, x: 0, z: 0, width: 6, depth: 6, color: "#ffffff"};
  const frame: PrivateAccessFrame = {zones: [zone], people, zoneBySession: new Map([["alice", ZONE_ID], ["bob", ZONE_ID]])};
  const epochs = new PrivateMediaEpochs({nowMs: () => nowMs, epoch: () => (++sequence).toString(16).padStart(24, "0"), removeRoom: async name => {removed.push(name);await removeRoom(name);}});
  const privacy = new PrivateConversations(OFFICE_ID, "incarnation", {epochs, nowMs: () => nowMs, id: () => `id-${++sequence}`, queries: {authorize: person => authorize(person), owner: () => ownerRead()}});
  privacy.reconcile(frame);
  const settle = () => new Promise<void>(resolve => setImmediate(resolve));
  async function command(sessionId: string, action: string, extra: Record<string, unknown> = {}) {
    nowMs += ACTION_ADVANCE_MS;
    const events = await privacy.command(sessionId, {requestId: `request-${++sequence}`, zoneId: ZONE_ID, expectedRevision: privacy.access.revision(ZONE_ID), action, ...extra});
    return events.find(event => event.event === PRIVATE_ZONE_RESULT_EVENT)?.payload as PrivateZoneResult;
  }
  async function admit() {
    assert.equal((await command("alice", "lock")).ok, true);
    await settle();
    assert.equal((await command("carol", "knock")).ok, true);
    const request = privacy.access.ownKnock("carol", ZONE_ID)!;
    assert.equal((await command("alice", "admit", {knockId: request.id})).ok, true);
    await settle();
    return request.id;
  }
  return {privacy, people, frame, removed, command, admit, settle, advance: (elapsedMs: number) => {nowMs += elapsedMs;}, now: () => nowMs, setOwner: (value: string | null) => {owner = value;}, setOwnerRead: (read: typeof ownerRead) => {ownerRead=read;}, setAuthorize: (value: typeof authorize) => {authorize = value;}, setRemoval: (value: typeof removeRoom) => {removeRoom = value;}};
}
test("desk owner locks; baseline occupants retain entry; outsiders and office administrators have no override", async () => {
  const f = fixture();
  assert.equal((await f.command("bob", "lock")).ok, false);
  assert.equal((await f.command("alice", "lock")).ok, true);
  assert.equal(f.privacy.canEnter("bob", ZONE_ID), true);
  assert.equal(f.privacy.canEnter("carol", ZONE_ID), false);
  assert.equal((await f.command("carol", "unlock")).ok, false);
  assert.equal((await f.command("bob", "unlock")).ok, false);
  (f.frame.zoneBySession as Map<string,string>).delete("alice");
  f.privacy.reconcile(f.frame);
  assert.equal(f.privacy.canEnter("alice", ZONE_ID), true);
  assert.equal((await f.command("alice", "unlock")).ok, false);
});
test("meeting occupants retain existing moderation rights without an office role bypass", async () => {
  const f = fixture("meeting");
  assert.equal((await f.command("bob", "lock")).ok, true);
  await f.settle();
  assert.equal((await f.command("alice", "unlock")).ok, true);
});
test("automatically locked meeting grants access only to its two invitees and releases an unused reservation", () => {
  const f = fixture("meeting");
  (f.frame.zoneBySession as Map<string, string>).clear();
  f.privacy.access.lockForMeeting(ZONE_ID, ["alice", "carol"], f.now());
  assert.equal(f.privacy.access.canEnter("alice", ZONE_ID, f.now()), true);
  assert.equal(f.privacy.access.canEnter("carol", ZONE_ID, f.now()), true);
  assert.equal(f.privacy.access.canEnter("dave", ZONE_ID, f.now()), false);
  (f.frame.zoneBySession as Map<string, string>).clear();
  f.privacy.reconcile(f.frame);
  assert.equal(f.privacy.lockedIds().has(ZONE_ID), true);
  f.advance(PRIVATE_ADMISSION_TTL_MS);
  f.privacy.reconcile(f.frame);
  assert.equal(f.privacy.lockedIds().has(ZONE_ID), false);
});
test("knock metadata is private; admission grants entry but not remote media; revocation blocks an inside guest", async () => {
  const f = fixture();
  const leaseId = await f.admit();
  assert.equal(f.privacy.canEnter("carol", ZONE_ID), true);
  assert.equal(f.privacy.mayHear("carol", ZONE_ID), false);
  const outsider = f.privacy.access.snapshot("dave", ZONE_ID, "ready", f.now());
  assert.deepEqual(outsider.pendingKnocks, []);
  assert.deepEqual(outsider.revocableGuests, []);
  (f.frame.zoneBySession as Map<string,string>).set("carol", ZONE_ID);
  f.privacy.reconcile(f.frame);
  assert.equal(f.privacy.admissionLeaseId("carol", ZONE_ID), leaseId);
  assert.equal(f.privacy.mayHear("carol", ZONE_ID), true);
  await f.settle();
  assert.equal((await f.command("alice", "revoke", {targetSessionId: "carol"})).ok, true);
  assert.equal(f.privacy.canEnter("carol", ZONE_ID), false);
  assert.equal(f.privacy.mayHear("carol", ZONE_ID), false);
  assert.equal(f.privacy.access.ownKnock("carol", ZONE_ID)?.state, "revoked");
  assert.equal(f.privacy.lockedIds().has(ZONE_ID), true);
});
test("baseline members cannot be revoked; guest expiry never unlocks a room containing the expired guest", async () => {
  const f = fixture();await f.admit();
  assert.equal((await f.command("alice", "revoke", {targetSessionId: "bob"})).ok, false);
  (f.frame.zoneBySession as Map<string,string>).clear();
  (f.frame.zoneBySession as Map<string,string>).set("carol", ZONE_ID);
  f.advance(PRIVATE_ADMISSION_TTL_MS);
  f.privacy.reconcile(f.frame);
  assert.equal(f.privacy.mayHear("carol", ZONE_ID), false);
  assert.equal(f.privacy.lockedIds().has(ZONE_ID), true);
  assert.equal(f.privacy.access.ownKnock("carol", ZONE_ID)?.state, "expired");
  (f.frame.zoneBySession as Map<string,string>).clear();f.privacy.reconcile(f.frame);
  assert.equal(f.privacy.lockedIds().has(ZONE_ID), false);
});
test("same authenticated reserved seat resumes its unexpired lease; replacement identity does not", async () => {
  const f = fixture();await f.admit();
  const leaseId = f.privacy.access.ownKnock("carol", ZONE_ID)!.id;
  (f.frame.zoneBySession as Map<string,string>).set("carol", ZONE_ID);f.privacy.reconcile(f.frame);
  f.privacy.removeSession("carol", true);assert.equal(f.privacy.mayHear("carol", ZONE_ID), false);
  f.people.get("carol")!.active = true;f.people.get("carol")!.online = true;f.privacy.reconcile(f.frame);
  assert.equal(f.privacy.admissionLeaseId("carol", ZONE_ID), leaseId);
  f.people.set("replacement", {...f.people.get("carol")!, sessionId: "replacement"});
  (f.frame.zoneBySession as Map<string,string>).set("replacement", ZONE_ID);f.privacy.reconcile(f.frame);
  assert.equal(f.privacy.mayHear("replacement", ZONE_ID), false);
});
test("expired and declined requests cannot be admitted and bounded queues reject extra knocks", async () => {
  const f = fixture();await f.command("alice", "lock");await f.settle();
  for (const id of ["carol", "dave", "eve", "frank"]) assert.equal((await f.command(id, "knock")).ok, true);
  f.people.set("extra", {sessionId: "extra", username: "extra", displayName: "extra", active: true, online: true});
  f.privacy.reconcile(f.frame);
  assert.equal((await f.command("extra", "knock")).ok, false);
  const knock = f.privacy.access.ownKnock("carol", ZONE_ID)!;
  f.advance(PRIVATE_KNOCK_TTL_MS);f.privacy.reconcile(f.frame);
  assert.equal((await f.command("alice", "admit", {knockId: knock.id})).ok, false);
  assert.equal(f.privacy.access.ownKnock("carol", ZONE_ID)?.state, "expired");
});
test("fresh canonical ownership and office membership deny stale moderation", async () => {
  const f = fixture();await f.command("alice", "lock");await f.settle();
  f.setOwner("carol");
  assert.equal((await f.command("alice", "unlock")).ok, false);
  assert.equal(f.privacy.mayHear("alice", ZONE_ID), false);
  f.setAuthorize(async () => false);
  const events = await f.privacy.request("alice", {zoneId: ZONE_ID, requestId: "denied"});
  assert.equal(events.some(event => event.event === "private-zone-access"), false);
});
test("drop during authorization rejects late moderation", async () => {
  const f = fixture();let release!: () => void;
  f.setAuthorize(() => new Promise(resolve => {release = () => resolve(true);}));
  const pending = f.command("alice", "lock");f.privacy.removeSession("alice", true);release();
  assert.equal((await pending).ok, false);
  assert.equal(f.privacy.lockedIds().has(ZONE_ID), false);
});
test("rotation is immediately unavailable, changes generation without logical membership changes, and fails closed", async () => {
  const f = fixture();const previous = f.privacy.descriptor(ZONE_ID);
  let release!: () => void;f.setRemoval(() => new Promise(resolve => {release = resolve;}));
  assert.equal((await f.command("alice", "lock")).ok, true);
  const rotating = f.privacy.descriptor(ZONE_ID);
  assert.equal(rotating.available, false);assert.ok(rotating.generation > previous.generation);
  release();await f.settle();assert.equal(f.privacy.descriptor(ZONE_ID).available, true);
  f.setRemoval(async () => {throw new Error("fixture service unavailable");});
  await f.command("alice", "unlock");await f.settle();
  assert.equal(f.privacy.descriptor(ZONE_ID).state, "unavailable");
  assert.equal(f.privacy.descriptor(ZONE_ID).available, false);
});

test("unlocked departures rotate transport so former occupants cannot remain in the current room", async () => {
  const f=fixture("meeting");const original=f.privacy.descriptor(ZONE_ID);
  (f.frame.zoneBySession as Map<string,string>).delete("bob");f.privacy.reconcile(f.frame);
  assert.equal(f.privacy.descriptor(ZONE_ID).available,false);
  await f.settle();
  assert.notEqual(f.privacy.descriptor(ZONE_ID).roomName,original.roomName);
  assert.equal(f.privacy.mayHear("bob",ZONE_ID),false);
});
test("access read floods run one authorization and reject stale ownership completions after departure", async () => {
  const f=fixture();let calls=0;const releases:Array<()=>void>=[];
  f.setAuthorize(()=>new Promise(resolve=>{calls+=1;releases.push(()=>resolve(true));}));
  const requests=Array.from({length:5},(_,index)=>f.privacy.request("carol",{zoneId:ZONE_ID,requestId:`sync-${index}`}));
  try {assert.equal(calls,1);} finally {for(const release of releases)release();await Promise.all(requests);}
  const other=fixture();let finish!:()=>void;
  other.setOwnerRead(()=>new Promise(resolve=>{finish=()=>resolve("alice");}));
  const request=other.privacy.request("carol",{zoneId:ZONE_ID,requestId:"delayed"});
  await other.settle();other.privacy.removeSession("carol",true);finish();
  const events=await request;
  assert.equal(events.some(event=>event.event==="private-zone-access"),false);
});

test("early media Retry is an expected denial and does not increment infrastructure errors", async () => {
  const f=fixture();await f.command("alice","lock");await f.settle();
  f.setRemoval(async()=>{throw new Error("fixture service unavailable");});
  await f.command("alice","unlock");await f.settle();
  const errors=getRecentServerErrorCount();
  const result=await f.command("alice","retry-media");
  assert.equal(result.ok,false);assert.match(result.error??"",/retry is not ready/i);
  assert.equal(getRecentServerErrorCount(),errors);
});

test("desk assignment fences synchronously isolate entry, private chat audience and media until matching release", async () => {
  const f = fixture();
  await f.admit();
  let resolveRemoval!: () => void;
  f.setRemoval(() => new Promise<void>(resolve => { resolveRemoval = resolve; }));
  const fence = { officeId: OFFICE_ID, operationId: "assignment", expectedConfigVersion: 1, newConfigVersion: 2, zoneIds: [ZONE_ID], deadlineAtMs: f.now() + 10000 };
  const preparing = f.privacy.prepareAssignment(fence);
  assert.equal(f.privacy.canEnter("alice", ZONE_ID), false);
  assert.equal(f.privacy.mayHear("bob", ZONE_ID), false);
  assert.equal(f.privacy.audienceSessions().has("alice"), false);
  assert.equal(f.privacy.descriptor(ZONE_ID).available, false);
  await f.settle();
  resolveRemoval();
  assert.equal(await preparing, true);
  assert.equal(f.privacy.mayHear("alice", ZONE_ID), false);
  f.privacy.releaseAssignment("other-operation");
  assert.equal(f.privacy.mayHear("alice", ZONE_ID), false);
  f.privacy.releaseAssignment("assignment");
  assert.equal(f.privacy.mayHear("alice", ZONE_ID), true);
});

test("private command awaiting authorization cannot apply after assignment fence or after fence release", async () => {
  const f = fixture();
  let authorize!: () => void;
  let querying!: () => void;
  const started = new Promise<void>(resolve => { querying = resolve; });
  let firstRead = true;
  f.setAuthorize(() => {
    if (!firstRead) return Promise.resolve(true);
    firstRead = false;
    querying();
    return new Promise<boolean>(resolve => { authorize = () => resolve(true); });
  });
  const pending = f.command("alice", "lock");
  await started;
  await f.privacy.prepareAssignment({ officeId: OFFICE_ID, operationId: "assignment", expectedConfigVersion: 1, newConfigVersion: 2, zoneIds: [ZONE_ID], deadlineAtMs: f.now() + 10000 });
  f.privacy.releaseAssignment("assignment");
  authorize();
  assert.equal((await pending).ok, false);
  assert.equal(f.privacy.lockedIds().has(ZONE_ID), false);
});

test("private access read awaiting authorization cannot reveal a fenced room snapshot", async () => {
  const f = fixture();
  let authorize!: () => void;
  let querying!: () => void;
  const started = new Promise<void>(resolve => { querying = resolve; });
  f.setAuthorize(() => { querying(); return new Promise<boolean>(resolve => { authorize = () => resolve(true); }); });
  const pending = f.privacy.request("alice", { requestId: "read-before-assignment", zoneId: ZONE_ID });
  await started;
  await f.privacy.prepareAssignment({ officeId: OFFICE_ID, operationId: "assignment", expectedConfigVersion: 1, newConfigVersion: 2, zoneIds: [ZONE_ID], deadlineAtMs: f.now() + 10000 });
  authorize();
  const events = await pending;
  assert.equal(events.some(event => event.event === "private-zone-access"), false);
  assert.equal((events.find(event => event.event === PRIVATE_ZONE_RESULT_EVENT)?.payload as PrivateZoneResult).ok, false);
});
