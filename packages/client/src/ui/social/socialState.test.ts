import assert from "node:assert/strict";
import test from "node:test";
import {
  chatThreadKey,
  appendChatMessage,
  spotlightAudioVolume,
  mediaTileKey,
  canPublishSpotlight,
} from "./socialState";
import * as policy from "./socialState";

test("DM threads select the other person and office messages stay separate", () => {
  assert.equal(
    chatThreadKey(
      { scope: "dm", senderUsername: "alice", recipientUsername: "bob" },
      "alice",
    ),
    "dm:bob",
  );
  assert.equal(
    chatThreadKey(
      { scope: "dm", senderUsername: "bob", recipientUsername: "alice" },
      "alice",
    ),
    "dm:bob",
  );
  assert.equal(
    chatThreadKey({ scope: "office", senderUsername: "bob" }, "alice"),
    "office",
  );
});
test("history/live overlap is deduplicated without losing earlier messages", () => {
  assert.deepEqual(appendChatMessage([{ id: "a" }], { id: "a" }), [
    { id: "a" },
  ]);
  assert.deepEqual(appendChatMessage([{ id: "a" }], { id: "b" }), [
    { id: "a" },
    { id: "b" },
  ]);
});
test("DND silences spotlight and matching zone audio prevents duplicate playback", () => {
  assert.equal(spotlightAudioVolume(true, false), 0);
  assert.equal(spotlightAudioVolume(false, true), 0);
  assert.equal(spotlightAudioVolume(false, false), 1);
});
test("tile identity includes the room so a zone teardown cannot remove spotlight", () => {
  assert.notEqual(
    mediaTileKey("zone", "speaker", "camera"),
    mediaTileKey("spotlight", "speaker", "camera"),
  );
});

test("spotlight consent survives unrelated epoch changes and is not implied by membership", () => {
  assert.equal(canPublishSpotlight("epoch-a", "epoch-a", true), true);
  assert.equal(canPublishSpotlight("epoch-a", "epoch-b", true), true);
  assert.equal(canPublishSpotlight(null, "epoch-a", true), false);
  assert.equal(canPublishSpotlight("epoch-a", "epoch-a", false), false);
});

test("spotlight remains dormant until a populated authoritative epoch arrives", () => {
  assert.equal(policy.shouldConnectSpotlight("", ["alice"], false), false);
  assert.equal(policy.shouldConnectSpotlight("epoch", [], false), false);
  assert.equal(policy.shouldConnectSpotlight("epoch", ["alice"], true), false);
  assert.equal(policy.shouldConnectSpotlight("epoch", ["alice"], false), true);
});
test("spotlight session key ignores publisher count but follows epoch and pause", () => {
  assert.equal(policy.spotlightSessionKey("e1", ["a"], false), "e1");
  assert.equal(policy.spotlightSessionKey("e1", ["a", "b"], false), "e1");
  assert.equal(policy.spotlightSessionKey("e2", ["a"], false), "e2");
  assert.equal(policy.spotlightSessionKey("e1", ["a"], true), null);
  assert.equal(policy.spotlightSessionKey("e1", [], false), null);
});
test("DM selection uses account normalization", () => {
  assert.equal(policy.dmThreadForUsername("  ALIce  "), "dm:alice");
  assert.equal(policy.dmThreadForUsername("bad username"), null);
});

test("camera publishing intent survives an unrelated epoch but stops with spotlight removal", () => {
  assert.equal(policy.shouldRestoreSpotlightCamera("a", "b", true, true), true);
  assert.equal(
    policy.shouldRestoreSpotlightCamera("a", "b", false, true),
    false,
  );
  assert.equal(
    policy.shouldRestoreSpotlightCamera(null, "b", true, true),
    false,
  );
  assert.equal(
    policy.shouldRestoreSpotlightCamera("a", "b", true, false),
    false,
  );
});

test("realtime replacement keeps last spotlight snapshot only within the same office", () => {
  const snapshot = { epoch: "epoch", usernames: ["alice"] };
  assert.deepEqual(
    policy.spotlightAfterRoomChange(snapshot, "office", "office"),
    snapshot,
  );
  assert.deepEqual(
    policy.spotlightAfterRoomChange(snapshot, "office", "other"),
    { epoch: "", usernames: [] },
  );
});
test("spotlight consent belongs to one office and publisher session", () => {
  const consent = { epoch: "a", officeId: "office", sessionKey: "session" };
  assert.equal(
    policy.isSpotlightConsentCurrent(consent, "office", "session"),
    true,
  );
  assert.equal(
    policy.isSpotlightConsentCurrent(consent, "other", "session"),
    false,
  );
  assert.equal(
    policy.isSpotlightConsentCurrent(consent, "office", "replacement"),
    false,
  );
  assert.equal(
    policy.isSpotlightConsentCurrent(null, "office", "session"),
    false,
  );
});
