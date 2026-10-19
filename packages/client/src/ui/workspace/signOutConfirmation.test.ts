import assert from "node:assert/strict";
import test from "node:test";
import { SignOutConfirmation } from "./signOutConfirmation";

const ENDPOINT = "https://office.example";
const failedResponse = () => Promise.resolve(new Response(null, { status: 503 }));

test("sign out requires a request and explicit confirmation; cancellation never submits", async () => {
  const confirmation = new SignOutConfirmation();
  let requests = 0;
  const logout = async () => { requests += 1; return new Response(null); };
  assert.equal(await confirmation.confirm(ENDPOINT, logout), false);
  confirmation.request();
  assert.equal(confirmation.snapshot.open, true);
  assert.equal(requests, 0);
  confirmation.cancel();
  assert.equal(confirmation.snapshot.open, false);
  assert.equal(await confirmation.confirm(ENDPOINT, logout), false);
  assert.equal(requests, 0);
});
test("confirmation submits one credentialed logout while repeated clicks and cancellation are blocked", async () => {
  const confirmation = new SignOutConfirmation();
  let finish!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { finish = resolve; });
  const requests: { url: string; init: RequestInit }[] = [];
  confirmation.request();
  const signingOut = confirmation.confirm(ENDPOINT, async (url, init) => {
    requests.push({ url, init });
    return response;
  });
  assert.equal(confirmation.snapshot.pending, true);
  confirmation.cancel();
  assert.equal(confirmation.snapshot.open, true);
  assert.equal(await confirmation.confirm(ENDPOINT, failedResponse), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${ENDPOINT}/auth/logout`);
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.credentials, "include");
  finish(new Response(null));
  assert.equal(await signingOut, true);
  assert.deepEqual(confirmation.snapshot, { open: false, pending: false, error: null });
});
test("server and network failures preserve confirmation and permit retry", async () => {
  for (const logout of [failedResponse, () => Promise.reject(new TypeError("Network unavailable"))]) {
    const confirmation = new SignOutConfirmation();
    confirmation.request();
    assert.equal(await confirmation.confirm(ENDPOINT, logout), false);
    assert.equal(confirmation.snapshot.open, true);
    assert.equal(confirmation.snapshot.pending, false);
    assert.match(confirmation.snapshot.error!, /try again/i);
    assert.equal(await confirmation.confirm(ENDPOINT, async () => new Response(null)), true);
  }
});
test("resetting for an unmounted or changed account ignores a late logout result", async () => {
  const confirmation = new SignOutConfirmation();
  let finish!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { finish = resolve; });
  confirmation.request();
  const signingOut = confirmation.confirm(ENDPOINT, () => response);
  confirmation.reset();
  finish(new Response(null));
  assert.equal(await signingOut, false);
  assert.deepEqual(confirmation.snapshot, { open: false, pending: false, error: null });
});
