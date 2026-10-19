import assert from "node:assert/strict";
import test from "node:test";
import { createOfficeWithLayout, type CreatedOffice } from "./officeCreation.js";
import { type RoomLayout } from "@gammyverse/shared";

const ENDPOINT = "https://office.test";
const OFFICE: CreatedOffice = { id: "office-1", name: "Studio", ownerUsername: "alice", role: "owner" };
const PROP = { id: "starter-desk", asset: "kit:desk", x: 1, z: 2, rotation: 0, collision: true, width: 2, depth: 1 };
const furnishedLayout = (): RoomLayout => ({ props: [{ ...PROP }], zones: [], walls: [], doors: [] } as unknown as RoomLayout);
const emptyLayout = (): RoomLayout => ({ props: [], zones: [], walls: [], doors: [] } as unknown as RoomLayout);

type Call = { url: string; method: string; body: Record<string, unknown> };

function recorder(responses: Record<string, { status: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    const path = String(url).slice(ENDPOINT.length);
    calls.push({ url: path, method: init?.method ?? "GET", body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    const reply = responses[path] ?? { status: 404, body: { error: "unexpected request" } };
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

test("furnished creation saves the generated map and every generated prop", async () => {
  const layout = furnishedLayout();
  const { calls, fetcher } = recorder({
    "/offices": { status: 201, body: { office: OFFICE } },
    "/offices/office-1/map": { status: 200, body: { config: { version: 1 }, configVersion: 2 } },
    "/offices/office-1/props": { status: 200, body: { props: layout.props, configVersion: 2 } },
  });
  const outcome = await createOfficeWithLayout({ endpoint: ENDPOINT, name: "Studio", layout, fetcher });
  assert.deepEqual(outcome, { ok: true, office: OFFICE });
  assert.deepEqual(calls.map((call) => `${call.method} ${call.url}`), [
    "POST /offices",
    "PUT /offices/office-1/map",
    "PUT /offices/office-1/props",
  ]);
  assert.deepEqual(calls[2]!.body.props, layout.props);
  assert.equal(calls[1]!.body.configVersion, 1);
  assert.equal(calls[2]!.body.configVersion, 1);
});

test("empty creation still saves the map and an empty prop set", async () => {
  const { calls, fetcher } = recorder({
    "/offices": { status: 201, body: { office: OFFICE } },
    "/offices/office-1/map": { status: 200, body: { config: { version: 1 } } },
    "/offices/office-1/props": { status: 200, body: { props: [] } },
  });
  const outcome = await createOfficeWithLayout({ endpoint: ENDPOINT, name: "Studio", layout: emptyLayout(), fetcher });
  assert.equal(outcome.ok, true);
  assert.deepEqual(calls[2]!.body.props, []);
});

test("a rejected prop save fails the creation instead of opening an unfurnished office", async () => {
  const { fetcher } = recorder({
    "/offices": { status: 201, body: { office: OFFICE } },
    "/offices/office-1/map": { status: 200, body: { config: { version: 1 } } },
    "/offices/office-1/props": { status: 400, body: { error: "Place small props on a table or shelf." } },
  });
  const outcome = await createOfficeWithLayout({ endpoint: ENDPOINT, name: "Studio", layout: furnishedLayout(), fetcher });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.office?.id, OFFICE.id);
  assert.match(outcome.ok ? "" : outcome.error, /furniture could not be saved: Place small props/);
});

test("a prop save that drops furniture is reported as a failure", async () => {
  const { fetcher } = recorder({
    "/offices": { status: 201, body: { office: OFFICE } },
    "/offices/office-1/map": { status: 200, body: { config: { version: 1 } } },
    "/offices/office-1/props": { status: 200, body: { props: [] } },
  });
  const outcome = await createOfficeWithLayout({ endpoint: ENDPOINT, name: "Studio", layout: furnishedLayout(), fetcher });
  assert.equal(outcome.ok, false);
  assert.match(outcome.ok ? "" : outcome.error, /stored 0 of 1 items/);
});

test("a failed map save never sends the prop request", async () => {
  const { calls, fetcher } = recorder({
    "/offices": { status: 201, body: { office: OFFICE } },
    "/offices/office-1/map": { status: 409, body: { error: "The office map changed." } },
  });
  const outcome = await createOfficeWithLayout({ endpoint: ENDPOINT, name: "Studio", layout: furnishedLayout(), fetcher });
  assert.equal(outcome.ok, false);
  assert.equal(calls.some((call) => call.url.endsWith("/props")), false);
  assert.match(outcome.ok ? "" : outcome.error, /generated map could not be saved: The office map changed\./);
});

test("a failed office request reports the server error without an office", async () => {
  const { fetcher } = recorder({ "/offices": { status: 403, body: { error: "Office limit reached." } } });
  const outcome = await createOfficeWithLayout({ endpoint: ENDPOINT, name: "Studio", layout: furnishedLayout(), fetcher });
  assert.deepEqual(outcome, { ok: false, office: null, error: "Office limit reached." });
});
