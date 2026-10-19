import assert from "node:assert/strict";
import test from "node:test";
import { buildPeopleDirectory, mergeOfficeDirectory, personPresenceLabel, type DirectoryPerson } from "./peopleDirectory";

import { buildPersonActions } from "./personActions";

const ONLINE_PERSON: DirectoryPerson = {
  username: "alex.username", displayName: "Alex Lee", presence: "online",
  status: "available", nearby: false, handRaised: false,
};

test("directory matches display names and usernames without dropping the reconnecting group", () => {
  const people: [string, DirectoryPerson][] = [
    ["alex", ONLINE_PERSON],
    ["away", { ...ONLINE_PERSON, username: "alex.offline", displayName: "Returning", presence: "away", nearby: true }],
    ["other", { ...ONLINE_PERSON, username: "other", displayName: "Someone else" }],
  ];
  const groups = buildPeopleDirectory(people, "alex", "  ALEX.  ");
  assert.deepEqual(groups.flatMap((group) => group.people.map(([id]) => id)), ["alex", "away"]);
  assert.equal(groups.at(-1)?.label, "Reconnecting");
  assert.equal(buildPeopleDirectory(people, "alex", "LEE").flatMap((group) => group.people).length, 1);
});

test("nearby groups exclude away people and local available presence never claims a desk", () => {
  const groups = buildPeopleDirectory([
    ["far", ONLINE_PERSON],
    ["near", { ...ONLINE_PERSON, nearby: true }],
    ["self", ONLINE_PERSON],
    ["away", { ...ONLINE_PERSON, presence: "away", nearby: true }],
  ], "self", "");
  assert.deepEqual(groups.map((group) => [group.label, group.people.map(([id]) => id)]), [
    ["You", ["self"]], ["Nearby", ["near"]], ["In the office", ["far"]], ["Reconnecting", ["away"]],
  ]);
  assert.equal(personPresenceLabel(ONLINE_PERSON), "In the office");
  assert.equal(personPresenceLabel({ ...ONLINE_PERSON, status: "do-not-disturb" }), "Do not disturb");
  assert.equal(personPresenceLabel({ ...ONLINE_PERSON, status: "in-meeting", presence: "away" }), "Reconnecting");
});

test("authorized directory merges offline members, prefers online sessions and removes former members", () => {
  const entries = mergeOfficeDirectory([
    ["away", { ...ONLINE_PERSON, presence: "away" }], ["live", ONLINE_PERSON],
    ["removed", { ...ONLINE_PERSON, username: "former" }],
  ], [{ username: ONLINE_PERSON.username }, { username: "offline" }]);
  assert.deepEqual(entries.map(([id, person]) => [id, person.username, person.presence]), [
    ["live", ONLINE_PERSON.username, "online"], ["offline:offline", "offline", "offline"],
  ]);
  assert.equal(buildPeopleDirectory(entries, null, "OFFLINE")[0]?.label, "Offline");
});

test("offline members can message but cannot use live actions, and self has no DM action", () => {
  const entry = ["offline:alex", { ...ONLINE_PERSON, presence: "offline" }] as const;
  const context = { localSessionId: null, localUsername: "someone", followingSessionId: null, spotlightUsernames: [], canSpotlight: true, disabled: false };
  const actions = buildPersonActions(entry, context);
  assert.equal(actions.find((action) => action.id === "message")?.disabled, false);
  assert.ok(actions.filter((action) => action.id !== "message").every((action) => action.disabled));
  assert.deepEqual(buildPersonActions(entry, { ...context, localUsername: ONLINE_PERSON.username, canSpotlight: false }), []);
  assert.ok(buildPersonActions(entry, { ...context, disabled: true }).every((action) => action.disabled));
});

test("explicit away availability remains distinct from reconnecting transport presence", () => {
  assert.equal(personPresenceLabel({ ...ONLINE_PERSON, status: "away" as DirectoryPerson["status"] }), "Away");
  assert.equal(personPresenceLabel({ ...ONLINE_PERSON, presence: "away" }), "Reconnecting");
});
