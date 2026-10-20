import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { CAMPUS_WORLD, PlayerState, PUBLIC_CONVERSATIONS_EVENT } from "@gammyverse/shared";
import { ConversationActions } from "./conversationActions.js";
import { SpatialConversations } from "./spatialConversations.js";
import { SessionSecurity } from "./sessionSecurity.js";
import { MeetMessages, registerMeetMessages } from "./meetMessages.js";
import { AvailabilityMessages, registerAvailabilityMessages } from "./availabilityMessages.js";

test("public discovery refreshes independently of ticks and stops on disposal", () => {
  mock.timers.enable({ apis: ["setInterval"] });
  const security = new SessionSecurity();
  const player = new PlayerState(); player.username = "alice"; player.presence = "online";
  const players = new Map([["alice", player]]); security.activate("alice", "alice");
  const conversations = new SpatialConversations("office");
  conversations.reconcile([{ id: "alice", username: "alice", sessionId: "alice", mediaIdentity: "alice-media", displayName: "Alice", characterId: "character-female-a", kind: "meeting", targetId: "meeting" }]);
  const events: unknown[] = [];
  const actions = new ConversationActions("office", { onMessage() {} }, {
    players, security, conversations, editingSessionId: () => null,
    geometry: () => ({ world: CAMPUS_WORLD, revision: 1, lockedZoneIds: new Set(), layout: { version: 1, zones: [], walls: [], doors: [], props: [] } }),
    commit() {}, send() {}, broadcast(event, payload) { if (event === PUBLIC_CONVERSATIONS_EVENT) events.push(payload); },
  });
  try {
    assert.equal(events.length, 0);
    mock.timers.tick(1000); assert.equal(events.length, 1);
    player.presence = "away";
    mock.timers.tick(1000); assert.equal(events.length, 2);
    player.presence = "online"; actions.dispose();
    mock.timers.tick(1000); assert.equal(events.length, 2);
  } finally { actions.dispose(); mock.timers.reset(); }
});

test("meet availability enforcement runs on its expiry timer and cancels on disposal", () => {
  mock.timers.enable({ apis: ["setInterval"] });
  const messages = new MeetMessages("office", "incarnation", { participant: () => undefined, participants: () => [], geometry() { throw new Error("unused"); }, commit() {}, send() {} });
  const enforcement = mock.method(messages, "enforceAvailability");
  const dispose = registerMeetMessages({ onMessage() {} }, messages);
  try {
    mock.timers.tick(500); assert.equal(enforcement.mock.callCount(), 1);
    dispose(); mock.timers.tick(1000); assert.equal(enforcement.mock.callCount(), 1);
  } finally { dispose(); mock.restoreAll(); mock.timers.reset(); }
});

test("existing custom-status timer clears stationary expired status without incoming commands", () => {
  mock.timers.enable({ apis: ["Date", "setInterval"], now: 100_000 });
  const player = new PlayerState(); player.customStatusText = "Reading"; player.customStatusExpiresAtMs = Date.now() + 1000;
  const events: unknown[] = [];
  const room = { onMessage() {}, broadcast(_event: string, payload: unknown) { events.push(payload); } };
  const messages = new AvailabilityMessages("office", room, { sessions: () => ["alice"], player: () => player, username: () => "alice", maintainer: () => false });
  const dispose = registerAvailabilityMessages(room, messages);
  try {
    mock.timers.tick(1000); assert.equal(player.customStatusText, ""); assert.equal(events.length, 1);
    dispose(); player.customStatusText = "Later"; player.customStatusExpiresAtMs = Date.now() + 1000;
    mock.timers.tick(1000); assert.equal(player.customStatusText, "Later");
  } finally { dispose(); mock.timers.reset(); }
});
