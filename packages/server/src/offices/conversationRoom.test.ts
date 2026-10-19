import assert from "node:assert/strict";
import test from "node:test";
import { PlayerState } from "@gammyverse/shared";
import { SpatialConversations } from "./spatialConversations.js";
import { OfficeRoom } from "./OfficeRoom.js";
import { SessionSecurity } from "./sessionSecurity.js";
const OFFICE_ID = "conversation-test-office";
const USERNAME = "alice";
const SESSION_ID = "alice-session";
const IDENTITY = "alice-media";
test("meeting membership never aliases a different meeting to lobby", () => {
  const registry = OfficeRoom as unknown as { roomsByOffice: Map<string, Set<OfficeRoom>> };
  const room = new OfficeRoom();
  const internal = room as unknown as { usernamesBySessionId: Map<string, string>; mediaIdentityBySessionId: Map<string, string>; meetingMembersBySessionId: Set<string>; mediaZoneBySessionId: Map<string, {id: string}>; sessionSecurity: SessionSecurity };
  internal.usernamesBySessionId.set(SESSION_ID, USERNAME);
  internal.mediaIdentityBySessionId.set(SESSION_ID, IDENTITY);
  internal.meetingMembersBySessionId.add(SESSION_ID);
  internal.mediaZoneBySessionId.set(SESSION_ID, {id: "actual-meeting"});
  internal.sessionSecurity.activate(USERNAME, SESSION_ID);
  registry.roomsByOffice.set(OFFICE_ID, new Set([room]));
  try {
    assert.equal(OfficeRoom.isMeetingMember(OFFICE_ID, USERNAME, IDENTITY, "lobby"), false);
    assert.equal(OfficeRoom.isMeetingMember(OFFICE_ID, USERNAME, IDENTITY, "actual-meeting"), true);
    internal.sessionSecurity.revoke(SESSION_ID);
    assert.equal(OfficeRoom.isMeetingMember(OFFICE_ID, USERNAME, IDENTITY, "actual-meeting"), false);
  } finally { registry.roomsByOffice.delete(OFFICE_ID); room.clock.stop(); }
});

test("actual room projection admits online active identities, retains Busy, and denies spoofed or revoked sessions", () => {
  const registry = OfficeRoom as unknown as { roomsByOffice: Map<string, Set<OfficeRoom>> };
  const room = new OfficeRoom();
  const internal = room as unknown as { officeId: string; conversations: SpatialConversations; usernamesBySessionId: Map<string, string>; mediaIdentityBySessionId: Map<string, string>; mediaZoneBySessionId: Map<string, {id: string; kind: string}>; sessionSecurity: SessionSecurity };
  internal.officeId = OFFICE_ID;
  internal.conversations = new SpatialConversations(OFFICE_ID);
  internal.usernamesBySessionId.set(SESSION_ID, USERNAME);
  internal.mediaIdentityBySessionId.set(SESSION_ID, IDENTITY);
  internal.mediaZoneBySessionId.set(SESSION_ID, {id: "meeting",kind: "meeting"});
  internal.sessionSecurity.activate(USERNAME, SESSION_ID);
  const player = new PlayerState();
  player.username = USERNAME; player.presence = "online"; player.status = "do-not-disturb";
  room.state.players.set(SESSION_ID, player);
  registry.roomsByOffice.set(OFFICE_ID, new Set([room]));
  try {
    assert.equal(OfficeRoom.getConversationSnapshot(OFFICE_ID, USERNAME, "spoofed"), null);
    assert.equal(OfficeRoom.getConversationSnapshot("different-office", USERNAME, IDENTITY), null);
    assert.equal(OfficeRoom.getConversationSnapshot(OFFICE_ID, USERNAME, IDENTITY)?.conversation?.members[0]?.username, USERNAME);
    player.presence = "away";
    assert.equal(OfficeRoom.getConversationSnapshot(OFFICE_ID, USERNAME, IDENTITY), null);
    player.presence = "online";
    assert.ok(OfficeRoom.getConversationSnapshot(OFFICE_ID, USERNAME, IDENTITY)?.conversation);
    internal.sessionSecurity.revoke(SESSION_ID);
    assert.equal(OfficeRoom.getConversationSnapshot(OFFICE_ID, USERNAME, IDENTITY), null);
  } finally {registry.roomsByOffice.delete(OFFICE_ID);room.clock.stop();}
});
