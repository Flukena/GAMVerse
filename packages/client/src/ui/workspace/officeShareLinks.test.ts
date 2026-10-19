import assert from "node:assert/strict";
import test from "node:test";
import { OfficeShareLinks, canManageOfficeShareLinks } from "./officeShareLinks";

const OFFICE = { id: "office-a", name: "Team office", role: "admin" };
const LINK = { id: "link-a", createdAt: "2026-10-19T00:00:00Z", expiresAt: "2026-10-26T00:00:00Z" };
const TOKEN = "a".repeat(43);
const response = (value: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(value), { status }));

test("office sharing exposes management only to privileged roles", () => {
  for (const role of ["owner", "admin", "maintainer"]) assert.equal(canManageOfficeShareLinks(role), true);
  for (const role of ["user", "", "OWNER"]) assert.equal(canManageOfficeShareLinks(role), false);
});
test("opening lists reusable links, creation retains the URL when clipboard access fails", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const shares = new OfficeShareLinks("https://api.example", "https://office.example", async (url, init) => {
    calls.push({ url, init });
    return init.method === "POST" ? response({ link: { ...LINK, token: TOKEN } }, 201) : response({ links: [] });
  });
  await shares.open(OFFICE);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "GET");
  await shares.create();
  const url = `https://office.example/share/${TOKEN}`;
  assert.equal(shares.snapshot.url, url);
  assert.equal(calls[1].init.credentials, "include");
  assert.equal(calls[1].init.body, undefined, "share links never accept a client-selected admin role");
  await shares.copy(async () => { throw new Error("Clipboard blocked"); });
  assert.equal(shares.snapshot.url, url);
  assert.match(shares.snapshot.copyMessage!, /select.*copy/i);
  await shares.copy(async value => { assert.equal(value, url); });
  assert.equal(shares.snapshot.copyMessage, "Link copied.");
});
test("the dialog can create a public multi-person link and a separate one-person link", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const shares = new OfficeShareLinks("https://api.example", "https://office.example", async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/invites")) return response({ invite: { token: TOKEN, role: "user" } }, 201);
    return init.method === "POST" ? response({ link: { ...LINK, token: TOKEN } }, 201) : response({ links: [] });
  });
  await shares.open(OFFICE);
  await shares.create();
  assert.equal(shares.snapshot.url, `https://office.example/share/${TOKEN}`);
  await shares.createOneTime();
  assert.equal(shares.snapshot.oneTimeUrl, `https://office.example/join/${TOKEN}`);
  assert.equal(calls[2].url, "https://api.example/offices/office-a/invites");
  assert.deepEqual(JSON.parse(String(calls[2].init.body)), { role: "user" });
  await shares.copyOneTime(async url => { assert.equal(url, shares.snapshot.oneTimeUrl); });
  assert.equal(shares.snapshot.copyMessage, "Link copied.");
});
test("failed revocation leaves the active link visible and successful retry clears its raw URL", async () => {
  let fail = true;
  const shares = new OfficeShareLinks("https://api.example", "https://office.example", async (_url, init) => {
    if (init.method === "POST") return response({ link: { ...LINK, token: TOKEN } }, 201);
    if (init.method === "DELETE") return fail ? response({ error: "Could not revoke link." }, 503) : Promise.resolve(new Response(null, { status: 204 }));
    return response({ links: [] });
  });
  await shares.open(OFFICE); await shares.create();
  await shares.revoke(LINK.id);
  assert.equal(shares.snapshot.links.length, 1);
  assert.ok(shares.snapshot.url);
  assert.match(shares.snapshot.error!, /revoke/i);
  fail = false;
  await shares.revoke(LINK.id);
  assert.deepEqual(shares.snapshot.links, []);
  assert.equal(shares.snapshot.url, null);
});
test("closed or replaced offices ignore late responses and duplicate creation clicks", async () => {
  let resolve!: (response: Response) => void;
  const pending = new Promise<Response>(finish => { resolve = finish; });
  let posts = 0;
  const shares = new OfficeShareLinks("https://api.example", "https://office.example", async (_url, init) => {
    if (init.method === "GET") return response({ links: [] });
    posts += 1; return pending;
  });
  await shares.open(OFFICE);
  const creating = shares.create();
  await shares.create();
  assert.equal(posts, 1);
  shares.close();
  resolve(new Response(JSON.stringify({ link: { ...LINK, token: TOKEN } }), { status: 201 }));
  await creating;
  assert.equal(shares.snapshot.office, null);
  assert.equal(shares.snapshot.url, null);
});
test("list errors stay retryable and ordinary members cannot open management", async () => {
  const shares = new OfficeShareLinks("https://api.example", "https://office.example", () => Promise.reject(new TypeError("offline")));
  await shares.open({ ...OFFICE, role: "user" });
  assert.equal(shares.snapshot.office, null);
  await shares.open(OFFICE);
  assert.ok(shares.snapshot.error);
  assert.equal(shares.snapshot.busy, null);
});

test("old list and revoke completions cannot replace another office or expose its previous link", async () => {
  for (const delayedMethod of ["GET", "DELETE"]) {
    let finish!: (value: Response) => void;
    const delayed = new Promise<Response>(resolve => { finish = resolve; });
    let delay = false;
    const shares = new OfficeShareLinks("https://api.example", "https://office.example", async (_url, init) => {
      if (delay && init.method === delayedMethod) return delayed;
      return response({ links: [LINK] });
    });
    await shares.open(OFFICE);
    delay = true;
    const previous = delayedMethod === "GET" ? shares.refresh() : shares.revoke(LINK.id);
    delay = false;
    await shares.open({ ...OFFICE, id: "office-b", name: "Another office" });
    finish(delayedMethod === "GET" ? new Response(JSON.stringify({ links: [] })) : new Response(null, { status: 204 }));
    await previous;
    assert.equal(shares.snapshot.office?.id, "office-b");
    assert.equal(shares.snapshot.links.length, 1);
    assert.equal(shares.snapshot.url, null);
  }
});
test("malformed creation responses cannot produce a share URL and permit retry", async () => {
  const shares = new OfficeShareLinks("https://api.example", "https://office.example", async (_url, init) =>
    init.method === "POST" ? response({ link: { ...LINK, token: "invalid" } }, 201) : response({ links: [] }));
  await shares.open(OFFICE);
  await shares.create();
  assert.equal(shares.snapshot.url, null);
  assert.ok(shares.snapshot.error);
  assert.equal(shares.snapshot.busy, null);
});

test("reloading links clears the displayed URL after expiry or another admin revokes it", async () => {
  const shares = new OfficeShareLinks("https://api.example", "https://office.example", async (_url, init) =>
    init.method === "POST" ? response({ link: { ...LINK, token: TOKEN } }, 201) : response({ links: [] }));
  await shares.open(OFFICE); await shares.create();
  assert.ok(shares.snapshot.url);
  await shares.refresh();
  assert.equal(shares.snapshot.url, null);
  assert.equal(shares.snapshot.freshId, null);
});
