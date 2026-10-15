import assert from "node:assert/strict";
import test from "node:test";
import { OfficeState, PlayerState } from "@gammyverse/shared";
import {
  registerSocialMessages,
  socialPeople,
  unregisterSocialMessages,
} from "./socialMessages.js";
function roomFixture() {
  const handlers = new Map<
    string,
    (
      client: {
        sessionId: string;
        send: (event: string, payload: unknown) => void;
      },
      payload: unknown,
    ) => void
  >();
  const state = new OfficeState();
  return {
    state,
    onMessage: (
      event: string,
      handler: (
        client: {
          sessionId: string;
          send: (event: string, payload: unknown) => void;
        },
        payload: unknown,
      ) => void,
    ) => {
      handlers.set(event, handler);
    },
    broadcast: () => {},
    handlers,
  };
}
test("office instances share spotlight epoch and durable schema", () => {
  const first = roomFixture();
  const second = roomFixture();
  const player = new PlayerState();
  first.state.players.set("alice-session", player);
  const state = {
    username: () => "alice",
    player: () => player,
    people: () => [],
    client: () => undefined,
  };
  const one = registerSocialMessages(first, "fixture-office", state);
  const two = registerSocialMessages(second, "fixture-office", state);
  assert.equal(one, two);
  assert.equal(first.state.spotlightEpoch, second.state.spotlightEpoch);
  unregisterSocialMessages(first, "fixture-office");
  assert.equal(two.grant("alice", false)!.epoch, second.state.spotlightEpoch);
  unregisterSocialMessages(second, "fixture-office");
});

test("social failures expose fixed labels and never raw exception text", async () => {
  const room = roomFixture();
  const state = {
    username: () => "alice",
    player: () => undefined,
    people: () => [],
    client: () => undefined,
  };
  registerSocialMessages(room, "error-fixture", state);
  const sent: unknown[] = [];
  const client = {
    sessionId: "a",
    send: (_event: string, payload: unknown) => {
      sent.push(payload);
    },
  };
  room.handlers.get("chat")!(client, { text: "invalid" });
  room.handlers.get("spotlight")!(client, { invalid: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(sent, [
    { error: "Chat could not be sent." },
    { error: "Spotlight command failed." },
  ]);
  unregisterSocialMessages(room, "error-fixture");
});

test("revoked physical occupants are isolated from private Nearby chat audiences", () => {
  const first = new PlayerState();first.username="alice";first.presence="online";
  const second = new PlayerState();second.username="guest";second.presence="online";
  const people = socialPeople([["alice",first],["guest",second]],new Map([["alice",{id:"private-zone"}],["guest",{id:"private-zone"}]]),new Map(),new Set(["alice"]));
  assert.notEqual(people.find(person=>person.sessionId==="alice")?.channel,people.find(person=>person.sessionId==="guest")?.channel);
});
