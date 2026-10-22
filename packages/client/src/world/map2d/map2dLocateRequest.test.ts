import assert from "node:assert/strict";
import test from "node:test";
import { LOCATE_PULSE_MS } from "./constants";
import { Map2dLocateRequests } from "./map2dLocateRequest";

const NOW_MS = 100;
const REQUEST_ID = 1;
const PLAYER_CENTER = { x: 3, z: 9 };
const EXPLICIT_CENTER = { x: -2, z: 7 };
const PLAYERS = new Map([["target", PLAYER_CENTER]]);

test("new locate request resolves the current player and starts one pulse", () => {
  const requests = new Map2dLocateRequests();
  const result = requests.consume({ requestId: REQUEST_ID, sessionId: "target" }, PLAYERS, NOW_MS);
  assert.deepEqual(result, {
    center: PLAYER_CENTER,
    following: false,
    view: "2d",
    decoration: { sessionId: "target", text: "◎", expiresAtMs: NOW_MS + LOCATE_PULSE_MS },
  });
  assert.equal(requests.consume({ requestId: REQUEST_ID, sessionId: "target" }, PLAYERS, NOW_MS), null);
});

test("an explicit center wins over the player's live position", () => {
  const requests = new Map2dLocateRequests();
  assert.deepEqual(requests.consume({ requestId: REQUEST_ID, sessionId: "target", center: EXPLICIT_CENTER }, PLAYERS, NOW_MS)?.center, EXPLICIT_CENTER);
});

test("center-only requests keep an empty pulse session ID", () => {
  const requests = new Map2dLocateRequests();
  assert.equal(requests.consume({ requestId: REQUEST_ID, center: EXPLICIT_CENTER }, PLAYERS, NOW_MS)?.decoration.sessionId, "");
});

test("a missing player consumes the request even if the player appears later", () => {
  const requests = new Map2dLocateRequests();
  const request = { requestId: REQUEST_ID, sessionId: "target" };
  assert.equal(requests.consume(request, new Map(), NOW_MS), null);
  assert.equal(requests.consume(request, PLAYERS, NOW_MS), null);
  assert.deepEqual(requests.consume({ ...request, requestId: REQUEST_ID + 1 }, PLAYERS, NOW_MS)?.center, PLAYER_CENTER);
});

test("absent requests and the initial zero request leave the consumer untouched", () => {
  const requests = new Map2dLocateRequests();
  assert.equal(requests.consume(undefined, PLAYERS, NOW_MS), null);
  assert.equal(requests.consume(null, PLAYERS, NOW_MS), null);
  assert.equal(requests.consume({ requestId: 0, sessionId: "target" }, PLAYERS, NOW_MS), null);
  assert.ok(requests.consume({ requestId: REQUEST_ID, sessionId: "target" }, PLAYERS, NOW_MS));
});
