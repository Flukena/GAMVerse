import assert from "node:assert/strict";
import test from "node:test";
import { openMicrophoneMeter } from "./DeviceSettingsAudioMeter";

const unusedStream = {} as MediaStream;

test("meter setup failure closes a partially created context and reports unavailable", async () => {
  let closedCount = 0;
  let unavailableCount = 0;
  const context = {
    createMediaStreamSource() { throw new DOMException("No active audio track", "InvalidStateError"); },
    close: async () => { closedCount++; },
  } as unknown as AudioContext;
  const meter = openMicrophoneMeter(unusedStream, () => { unavailableCount++; }, () => context);
  await Promise.resolve();
  assert.equal(meter, null);
  assert.equal(closedCount, 1);
  assert.equal(unavailableCount, 1);
});

test("context construction failure stays inside the meter and reports unavailable", () => {
  let unavailableCount = 0;
  const meter = openMicrophoneMeter(unusedStream, () => { unavailableCount++; }, () => { throw new DOMException("Audio unavailable", "NotSupportedError"); });
  assert.equal(meter, null);
  assert.equal(unavailableCount, 1);
});

test("analyser setup failure disconnects the created source and handles close rejection", async () => {
  let disconnectedCount = 0;
  let unavailableCount = 0;
  const context = {
    createMediaStreamSource: () => ({ disconnect() { disconnectedCount++; } }),
    createAnalyser() { throw new DOMException("Audio unavailable", "NotSupportedError"); },
    close: async () => { throw new DOMException("Already closed", "InvalidStateError"); },
  } as unknown as AudioContext;
  assert.equal(openMicrophoneMeter(unusedStream, () => { unavailableCount++; }, () => context), null);
  await Promise.resolve();
  assert.equal(disconnectedCount, 1);
  assert.equal(unavailableCount, 2);
});
