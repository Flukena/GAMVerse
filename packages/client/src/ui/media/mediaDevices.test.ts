import assert from "node:assert/strict";
import test from "node:test";
import { MediaDeviceController, type MediaDeviceAdapter, type MediaDeviceEntry } from "./mediaDevices.ts";
import { applyMediaDevicePreferences, defaultMediaDevicePreferences, mediaDeviceCaptureDefaults, MEDIA_DEVICE_STORAGE_KEY, readMediaDevicePreferences } from "./mediaDevicePreferences.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function streamFixture() {
  let stops = 0;
  const track = new EventTarget() as MediaStreamTrack;
  track.stop = () => { stops++; };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  return { stream, track, stopped: () => stops };
}
function fixture() {
  const stored = new Map<string, string>();
  const storage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); } };
  const requests: ReturnType<typeof deferred<MediaStream>>[] = [];
  const constraints: MediaStreamConstraints[] = [];
  let devices: MediaDeviceEntry[] = [];
  let deviceChange = () => {};
  let detached = false;
  const adapter: MediaDeviceAdapter = {
    enumerateDevices: async () => devices,
    getUserMedia: request => { constraints.push(request); const pending = deferred<MediaStream>(); requests.push(pending); return pending.promise; },
    speakerSelectionSupported: false,
    onDeviceChange: listener => { deviceChange = listener; return () => { detached = true; }; },
  };
  const controller = new MediaDeviceController(adapter, storage);
  return { controller, storage, stored, requests, constraints, setDevices: (value: MediaDeviceEntry[]) => { devices = value; }, deviceChange: () => deviceChange(), detached: () => detached };
}

test("preview capture requires an explicit start and stale completion stops its tracks", async () => {
  const f = fixture();
  await f.controller.refresh();
  f.controller.select("audioinput", "microphone-a");
  assert.equal(f.requests.length, 0);
  const pending = f.controller.startPreview({ audio: true, video: false });
  assert.deepEqual(f.constraints, [{ audio: { deviceId: { exact: "microphone-a" } }, video: false }]);
  f.controller.stopPreview();
  const preview = streamFixture();
  f.requests[0]!.resolve(preview.stream);
  await pending;
  assert.equal(preview.stopped(), 1);
  assert.equal(f.controller.snapshot.preview, null);
  assert.equal(f.controller.snapshot.busy, false);
});

test("newer preview wins out of order capture and dispose stops all local resources", async () => {
  const f = fixture();
  const oldPending = f.controller.startPreview({ audio: true, video: true });
  const newPending = f.controller.startPreview({ audio: false, video: true });
  const oldPreview = streamFixture();
  const newPreview = streamFixture();
  f.requests[1]!.resolve(newPreview.stream);
  await newPending;
  f.requests[0]!.resolve(oldPreview.stream);
  await oldPending;
  assert.equal(oldPreview.stopped(), 1);
  assert.equal(f.controller.snapshot.preview, newPreview.stream);
  f.controller.dispose();
  assert.equal(newPreview.stopped(), 1);
  assert.equal(f.controller.snapshot.preview, null);
  assert.equal(f.detached(), true);
});

test("permission denial can be retried without publishing or retaining a stale error", async () => {
  const f = fixture();
  const denied = f.controller.startPreview({ audio: true, video: false });
  const error = new Error("denied"); error.name = "NotAllowedError";
  f.requests[0]!.reject(error);
  await denied;
  assert.match(f.controller.snapshot.error!, /permission was denied/);
  const retry = f.controller.startPreview({ audio: true, video: false });
  const preview = streamFixture(); f.requests[1]!.resolve(preview.stream);
  await retry;
  assert.equal(f.controller.snapshot.error, null);
  assert.equal(f.controller.snapshot.preview, preview.stream);
  f.controller.dispose();
});

test("preferences persist, hidden device ids retain selection, and unplug falls back to default", async () => {
  const f = fixture();
  f.controller.select("audioinput", "microphone-a");
  await f.controller.refresh();
  assert.equal(f.controller.snapshot.preferences.audioinput, "microphone-a");
  assert.equal(readMediaDevicePreferences(f.storage).audioinput, "microphone-a");
  f.setDevices([{ kind: "audioinput", deviceId: "microphone-a", label: "Microphone A" }]);
  await f.controller.refresh();
  f.setDevices([]);
  await f.controller.refresh();
  assert.equal(f.controller.snapshot.preferences.audioinput, "default");
  assert.equal(readMediaDevicePreferences(f.storage).audioinput, "default");
  f.controller.select("audiooutput", "speaker-a");
  assert.equal(f.controller.snapshot.preferences.audiooutput, "default");
  f.controller.dispose();
});

test("preview device ended stops sibling tracks and allows explicit recovery", async () => {
  const f = fixture();
  const pending = f.controller.startPreview({ audio: true, video: true });
  const preview = streamFixture(); f.requests[0]!.resolve(preview.stream);
  await pending;
  preview.track.dispatchEvent(new Event("ended"));
  assert.equal(preview.stopped(), 1);
  assert.equal(f.controller.snapshot.preview, null);
  assert.match(f.controller.snapshot.error!, /disconnected/);
  f.controller.dispose();
});

test("invalid persisted data uses defaults and storage denial keeps selection usable", () => {
  const f = fixture(); f.stored.set(MEDIA_DEVICE_STORAGE_KEY, "not-json");
  assert.deepEqual(readMediaDevicePreferences(f.storage), defaultMediaDevicePreferences());
  const storage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  const controller = new MediaDeviceController({ enumerateDevices: async () => [], getUserMedia: async () => streamFixture().stream, onDeviceChange: () => () => {}, speakerSelectionSupported: true }, storage);
  controller.select("videoinput", "camera-a");
  assert.equal(controller.snapshot.preferences.videoinput, "camera-a");
  controller.dispose();
});

test("applying saved devices only switches devices and omits unsupported output", async () => {
  const calls: Array<[MediaDeviceKind, string]> = [];
  const room = { switchActiveDevice: async (kind: MediaDeviceKind, id: string) => { calls.push([kind, id]); return true; } };
  await applyMediaDevicePreferences(room, { audioinput: "microphone-a", videoinput: "camera-a", audiooutput: "speaker-a" }, false);
  assert.deepEqual(calls, [["audioinput", "microphone-a"], ["videoinput", "camera-a"]]);
});

test("unavailable device switch is reported to the caller", async () => {
  await assert.rejects(applyMediaDevicePreferences({ switchActiveDevice: async () => false }, defaultMediaDevicePreferences()), /unavailable/);
});


test("capture defaults use the browser fallback and require explicitly selected hardware", () => {
  assert.deepEqual(mediaDeviceCaptureDefaults({ audioinput: "default", videoinput: "camera-a", audiooutput: "default" }), {
    audioCaptureDefaults: { deviceId: { ideal: "default" } },
    videoCaptureDefaults: { deviceId: { exact: "camera-a" } },
  });
});

test("switching to browser defaults uses nonexact constraints", async () => {
  const calls: boolean[] = [];
  await applyMediaDevicePreferences({ switchActiveDevice: async (_kind, _id, exact) => { calls.push(exact!); return true; } }, defaultMediaDevicePreferences());
  assert.deepEqual(calls, [false, false, false]);
});

test("successful enumeration retry clears only its enumeration error", async () => {
  let fail = true;
  const controller = new MediaDeviceController({
    enumerateDevices: async () => { if (fail) throw new Error("enumeration failed"); return []; },
    getUserMedia: async () => streamFixture().stream,
    onDeviceChange: () => () => {},
    speakerSelectionSupported: true,
  });
  await controller.refresh();
  assert.match(controller.snapshot.error!, /list media devices/);
  fail = false;
  await controller.refresh();
  assert.equal(controller.snapshot.error, null);
  controller.dispose();
});


test("device preferences retain upstream Sound selections before the first AV save", () => {
  const values = new Map([["gammyverse.audioInputDeviceId", "legacy-microphone"], ["gammyverse.audioOutputDeviceId", "legacy-speaker"]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.deepEqual(readMediaDevicePreferences(storage), { audioinput: "legacy-microphone", audiooutput: "legacy-speaker", videoinput: "default" });
  values.set(MEDIA_DEVICE_STORAGE_KEY, JSON.stringify({ audioinput: "new-microphone", audiooutput: "new-speaker", videoinput: "camera" }));
  assert.deepEqual(readMediaDevicePreferences(storage), { audioinput: "new-microphone", audiooutput: "new-speaker", videoinput: "camera" });
});
