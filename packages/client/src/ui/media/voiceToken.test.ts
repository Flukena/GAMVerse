import assert from "node:assert/strict";
import test from "node:test";
import { fetchVoiceToken } from "./voiceToken";
import type { VoiceTarget } from "./voiceTarget";

test("token request includes full authoritative binding and refuses partial binding", async () => {
  const requests: unknown[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ url: "wss://media.example", token: "synthetic" }));
  };
  const target: VoiceTarget = { kind: "meeting", id: "zone", officeId: "office", sessionKey: "session",
    conversationId: "conversation", conversationGeneration: 2, roomIncarnationId: "incarnation" };
  try {
    await fetchVoiceToken("https://api.example", target, new AbortController().signal);
    assert.deepEqual(requests, [{ officeId: "office", roomKey: "zone", conversationId: "conversation", conversationGeneration: 2, roomIncarnationId: "incarnation" }]);
    await assert.rejects(fetchVoiceToken("https://api.example", { ...target, roomIncarnationId: undefined }, new AbortController().signal));
    assert.equal(requests.length, 1);
  } finally { globalThis.fetch = original; }
});


test("Listen requests subscriber authorization instead of silently reusing Join grants", async () => {
  const original = globalThis.fetch;
  let request: Record<string, unknown> = {};
  globalThis.fetch = async (_url, init) => {
    request = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ url: "wss://media.example", token: "synthetic" }));
  };
  try {
    await fetchVoiceToken("https://api.example", { kind: "meeting", id: "zone", officeId: "office", sessionKey: "session", mode: "listen" }, new AbortController().signal);
    assert.equal(request.mode, "listen");
  } finally { globalThis.fetch = original; }
});
