import assert from "node:assert/strict";
import test from "node:test";
import { buildPersonActions } from "./personActions";
import type { DirectoryEntry } from "./peopleDirectory";

const PERSON: DirectoryEntry = ["remote-session", { username: "remote", displayName: "Remote", presence: "online", status: "available", nearby: false, handRaised: false }];
const CONTEXT = { localSessionId: "local-session", followingSessionId: null, spotlightUsernames: [], canSpotlight: false, disabled: false, canMeet: true, localStatus: "available" } as const;
test("meet actions appear when integrated and availability disables interruptions without disabling navigation", () => {
  const available = buildPersonActions(PERSON, CONTEXT);
  assert.equal(available.find(action => action.id === "meet")?.disabled, false);
  assert.equal(available.find(action => action.id === "inviteToJoin")?.disabled, false);
  const busy = buildPersonActions([PERSON[0], { ...PERSON[1], status: "do-not-disturb" }], CONTEXT);
  assert.equal(busy.find(action => action.id === "meet")?.disabled, true);
  assert.ok(busy.find(action => action.id === "meet")?.disabledReason);
  assert.equal(busy.find(action => action.id === "message")?.disabled, false);
  assert.equal(busy.find(action => action.id === "goTo")?.disabled, false);
  assert.equal(buildPersonActions(PERSON, { ...CONTEXT, localStatus: "away" }).find(action => action.id === "inviteToJoin")?.disabled, true);
});
test("self/offline and pending meet states never offer an enabled invitation", () => {
  assert.equal(buildPersonActions(PERSON, { ...CONTEXT, localSessionId: PERSON[0] }).some(action => action.id === "meet"), false);
  assert.equal(buildPersonActions([PERSON[0], { ...PERSON[1], presence: "offline" }], CONTEXT).find(action => action.id === "meet")?.disabled, true);
  assert.equal(buildPersonActions(PERSON, { ...CONTEXT, meetPending: true }).find(action => action.id === "meet")?.disabled, true);
});
