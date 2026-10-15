import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { deleteSpatialMediaRoom, ZONE_MEDIA_REQUEST_TIMEOUT_SECONDS } from "./service.js";
import { PRIVATE_MEDIA_RETRY_INTERVAL_MS } from "@gammyverse/shared";
import assert from "node:assert/strict";
import test from "node:test";
import { PrivateMediaEpochs, zoneMediaReady, type ZoneEpochKey } from "./privateMediaEpoch.js";
const FIXTURE_SIGNING_SECRET_BYTES_COUNT = 32;
const SDK_TIMEOUT_WATCHDOG_MULTIPLIER = 2;
const MILLISECONDS_PER_SECOND = 1000;
const KEY: ZoneEpochKey = { officeId: "office", roomIncarnationId: "incarnation", zoneId: "desk", kind: "private" };
function fixture(removeRoom: (room: string) => Promise<void>) {
  let timeMs = 100_000; let epoch = 0;
  const epochs = new PrivateMediaEpochs({ removeRoom, nowMs: () => timeMs, epoch: () => (++epoch).toString(16).padStart(24, "0") });
  return { epochs, advance: (elapsedMs: number) => { timeMs += elapsedMs; } };
}
test("rotation synchronously blocks minting and coalesces latest generation without deleting unpublished candidates", async () => {
  let release!: () => void;
  const removed: string[] = [];
  const f = fixture(room => { removed.push(room); return new Promise(resolve => { release = resolve; }); });
  const original = f.epochs.current(KEY);
  const first = f.epochs.invalidate(KEY);
  assert.equal(zoneMediaReady(first.descriptor), false);
  const latest = f.epochs.invalidate(KEY);
  assert.equal(latest.descriptor.generation, first.descriptor.generation + 1);
  assert.deepEqual(removed, [original.roomName]);
  release(); await first.settled;
  const ready = await latest.settled;
  assert.equal(zoneMediaReady(ready), true);
  assert.equal(ready.generation, latest.descriptor.generation);
  assert.equal(ready.roomName, latest.descriptor.roomName);
  assert.equal(first.descriptor.state, "rotating", "a stale transition snapshot cannot become ready");
  assert.equal(removed.includes(first.descriptor.roomName), false);
});
test("two failures keep the zone unavailable; policy churn cannot retry before explicit generation-checked cooldown", async () => {
  let attempts = 0; let fails = true;
  const f = fixture(async () => { attempts += 1; if (fails) throw new Error("Network unavailable"); });
  const failed = await f.epochs.invalidate(KEY).settled;
  assert.equal(attempts, 2); assert.equal(failed.state, "unavailable");
  const changed = await f.epochs.invalidate(KEY).settled;
  assert.equal(attempts, 2); assert.equal(changed.state, "unavailable");
  assert.throws(() => f.epochs.retry(KEY, changed.generation), /too soon/);
  f.advance(PRIVATE_MEDIA_RETRY_INTERVAL_MS); fails = false;
  assert.throws(() => f.epochs.retry(KEY, failed.generation), /unavailable/);
  assert.equal((await f.epochs.retry(KEY, changed.generation).settled).state, "ready");
  assert.equal(attempts, 3);
});
test("disposal while rotation is pending cannot publish a ready epoch", async () => {
  let release!: () => void;
  const f = fixture(() => new Promise(resolve => { release = resolve; }));
  const rotation = f.epochs.invalidate(KEY);
  const closing = f.epochs.close(KEY);
  assert.equal(f.epochs.current(KEY).state, "unavailable");
  release(); await rotation.settled; await closing;
  assert.equal(zoneMediaReady(f.epochs.current(KEY)), false);
  assert.equal((await f.epochs.invalidate(KEY).settled).state, "unavailable");
});
test("epochs are isolated by office, room incarnation, zone and kind", () => {
  const f = fixture(async () => {});
  const descriptors = [KEY, { ...KEY, officeId: "other" }, { ...KEY, roomIncarnationId: "new-room" }, { ...KEY, zoneId: "other" }, { ...KEY, kind: "meeting" as const }].map(key => f.epochs.current(key));
  assert.equal(new Set(descriptors.map(descriptor => descriptor.roomName)).size, descriptors.length);
});


test("the real SDK aborts a hung room deletion within its configured request deadline", async () => {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const saved = {
    LIVEKIT_URL: process.env.LIVEKIT_URL,
    LIVEKIT_INTERNAL_URL: process.env.LIVEKIT_INTERNAL_URL,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
  };
  process.env.LIVEKIT_URL = `ws://127.0.0.1:${address.port}`;
  process.env.LIVEKIT_INTERNAL_URL = `http://127.0.0.1:${address.port}`;
  process.env.LIVEKIT_API_KEY = "fixture-key";
  process.env.LIVEKIT_API_SECRET = randomBytes(FIXTURE_SIGNING_SECRET_BYTES_COUNT).toString("hex");
  const watchdogTimeoutMs = ZONE_MEDIA_REQUEST_TIMEOUT_SECONDS * SDK_TIMEOUT_WATCHDOG_MULTIPLIER * MILLISECONDS_PER_SECOND;
  const watchdog = setTimeout(() => server.closeAllConnections(), watchdogTimeoutMs);
  try {
    await assert.rejects(deleteSpatialMediaRoom("fixture-room"), (error: unknown) => error instanceof Error && error.name === "TimeoutError");
  } finally {
    clearTimeout(watchdog);
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
