import assert from "node:assert/strict";
import test from "node:test";
import { acceptOfficeEntryLink, acceptPendingOfficeInvite, getInviteRouteToken, getOfficeShareRouteToken } from "./officeEntryLink";

const TOKEN = "a".repeat(43);
test("share links survive route parsing without becoming single-use invitations", () => {
  assert.equal(getOfficeShareRouteToken(`/share/${TOKEN}`), TOKEN);
  assert.equal(getInviteRouteToken(`/share/${TOKEN}`), null);
  assert.equal(getInviteRouteToken(`/join/${TOKEN}`), TOKEN);
  assert.equal(getOfficeShareRouteToken(`/join/${TOKEN}`), null);
});
test("reusable and single-use recipients submit to their respective authenticated endpoints", async () => {
  for (const [route, path] of [["share", "/office-invites/share-links/accept"], ["join", "/office-invites/accept"]]) {
    const officeId = await acceptOfficeEntryLink("https://api.example", `/${route}/${TOKEN}`, async (url, init) => {
      assert.equal(url, `https://api.example${path}`);
      assert.equal(init.credentials, "include");
      assert.deepEqual(JSON.parse(String(init.body)), { token: TOKEN });
      return new Response(JSON.stringify({ officeId: "office-a" }));
    });
    assert.equal(officeId, "office-a");
  }
});
test("malformed, revoked and unavailable share links never enter an office", async () => {
  let requests = 0;
  const request = async () => { requests += 1; return new Response(JSON.stringify({ error: "Share link expired or revoked." }), { status: 404 }); };
  await assert.rejects(acceptOfficeEntryLink("https://api.example", "/share/short", request), /invalid/i);
  assert.equal(requests, 0);
  await assert.rejects(acceptOfficeEntryLink("https://api.example", `/share/${TOKEN}`, request), /expired or revoked/i);
  assert.equal(await acceptOfficeEntryLink("https://api.example", "/", request), null);
  assert.equal(requests, 1);
});

test("a direct office link accepts a pending invitation for that office before entry", async () => {
  const accepted = await acceptPendingOfficeInvite("https://api.example", "office-b", [
    { id: "invite-a", officeId: "office-a" },
    { id: "invite-b", officeId: "office-b" },
  ], async (url, init) => {
    assert.equal(url, "https://api.example/office-invites/accept");
    assert.equal(init.method, "POST");
    assert.equal(init.credentials, "include");
    assert.deepEqual(JSON.parse(String(init.body)), { inviteId: "invite-b" });
    return new Response(JSON.stringify({ officeId: "office-b" }));
  });
  assert.equal(accepted, true);
});

test("a direct office link does not accept an invitation for another office", async () => {
  let requested = false;
  const accepted = await acceptPendingOfficeInvite("https://api.example", "office-b", [
    { id: "invite-a", officeId: "office-a" },
  ], async () => { requested = true; return new Response("{}"); });
  assert.equal(accepted, false);
  assert.equal(requested, false);
});
