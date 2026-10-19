import assert from "node:assert/strict";
import test from "node:test";
import { registerShareLinkEndpoints } from "./shareLinkEndpoints.js";
import type { HttpRequest, HttpResponse } from "./middleware.js";
import { OfficeShareLinks } from "../offices/shareLinks.js";

test("every share endpoint rejects an unauthenticated request before accessing storage", async () => {
  const handlers: Parameters<Parameters<typeof registerShareLinkEndpoints>[0]["post"]>[1][] = [];
  const register = (_path: string, handler: typeof handlers[number]) => { handlers.push(handler); };
  registerShareLinkEndpoints({ get: register, post: register, delete: register }, { session: async () => null });
  const HTTP_UNAUTHORIZED_STATUS = 401;
  for (const handler of handlers) {
    let status: number | undefined;
    const response = { setHeader() {}, status(value: number) { status = value; return this; }, json(body: unknown) { assert.deepEqual(body, { error: "Authentication required." }); } } as unknown as HttpResponse;
    await handler({} as HttpRequest, response);
    assert.equal(status, HTTP_UNAUTHORIZED_STATUS);
  }
  const SHARE_ENDPOINTS_COUNT = 4;
  assert.equal(handlers.length, SHARE_ENDPOINTS_COUNT);
});
test("share acceptance rejects malformed tokens before storage", async () => {
  const store = new OfficeShareLinks(null);
  await assert.rejects(store.accept("alice", { token: "not-a-token" }), /invalid or expired/);
});
