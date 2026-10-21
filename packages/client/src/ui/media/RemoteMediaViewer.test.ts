import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test, { after } from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RemoteTrack } from "livekit-client";
import type { RemoteMediaTile } from "./remoteMediaState";
const previousReact = (globalThis as { React?: typeof React }).React;
Object.assign(globalThis, { React });
after(() => {
  if (previousReact) Object.assign(globalThis, { React: previousReact });
  else Reflect.deleteProperty(globalThis, "React");
});
const cssLoader = registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith(".css")) return { format: "module", source: "", shortCircuit: true };
  return nextLoad(url, context);
} });
const { RemoteMediaViewer } = await import("./RemoteMediaViewer");
cssLoader.deregister();
const camera: RemoteMediaTile = { key: "camera", identity: "alice-session", username: "alice", name: "Alice", source: "camera", track: {} as RemoteTrack };
const screen: RemoteMediaTile = { ...camera, key: "screen", source: "screen_share" };
const NO_ACTION = () => {};
test("video viewer is nonmodal, with inline muted video and source selection without a close action", () => {
  const html = renderToStaticMarkup(createElement(RemoteMediaViewer, { tiles: [camera, screen], selected: screen, onToggleSize: NO_ACTION, onSelect: NO_ACTION, minimized: false }));
  assert.match(html, /<aside\b/);
  assert.doesNotMatch(html, /<dialog\b|aria-modal="true"/);
  assert.match(html, /<video[^>]+autoPlay=""[^>]+muted=""[^>]+playsInline=""[^>]+controls=""/);
  assert.doesNotMatch(html, /<select\b|Media to view/);
  assert.doesNotMatch(html, /Close media viewer/);
  assert.match(html, /aria-label="Minimize media viewer"/);
  assert.match(html, /Alice · Screen/);
});
test("viewer renders no stage when there are no active remote streams", () => {
  assert.equal(renderToStaticMarkup(createElement(RemoteMediaViewer, { tiles: [], selected: null, onToggleSize: NO_ACTION, onSelect: NO_ACTION, minimized: false })), "");
});
test("roster camera and screen icons offer viewing instead of stopping another person's media", async () => {
  const { VoiceParticipantRoster } = await import("./VoiceParticipantRoster");
  const html = renderToStaticMarkup(createElement(VoiceParticipantRoster, {
    people: [{ sessionId: "alice", username: "alice", displayName: "Alice", status: "available", presence: "online", local: false, nearby: true }],
    speakingUsernames: new Set<string>(), activities: new Map([["alice", { microphone: true, camera: true, screenShare: true }]]),
    audioLevels: new Map<string, number>(), canMuteAll: false, canViewMedia: () => true, onViewMedia: NO_ACTION,
    onSetAudioLevel: NO_ACTION, onModeratePerson: NO_ACTION, onMuteAll: NO_ACTION,
    cameraTiles: [camera],
  }));
  assert.match(html, /aria-label="View Alice&#x27;s camera"/);
  assert.match(html, /aria-label="View Alice&#x27;s screen share"/);
  assert.doesNotMatch(html, /Turn off Alice&#x27;s camera|Stop Alice&#x27;s screen share/);
  assert.match(html, /class="voice-participant-camera-background"/);
  assert.match(html, /class="has-camera-background"/);
});

test("minimized viewer keeps the selected video and provides an expand action without close", () => {
  const html = renderToStaticMarkup(createElement(RemoteMediaViewer, { tiles: [camera], selected: camera, onToggleSize: NO_ACTION, onSelect: NO_ACTION, minimized: true }));
  assert.match(html, /class="remote-media-viewer is-minimized"/);
  assert.match(html, /aria-label="Expand media viewer"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Alice&#x27;s camera/);
  assert.doesNotMatch(html, /Close media viewer/);
});

test("screen sharing includes the same remote publisher's camera PiP only", () => {
  const render = (tiles: RemoteMediaTile[], selected: RemoteMediaTile) => renderToStaticMarkup(createElement(RemoteMediaViewer, {
    tiles, selected, minimized: false, onToggleSize: NO_ACTION, onSelect: NO_ACTION,
  }));
  const together = render([screen, camera], screen);
  assert.equal((together.match(/<video\b/g) ?? []).length, 2);
  assert.match(together, /class="remote-media-pip"/);
  assert.match(together, /Alice&#x27;s camera picture in picture/);
  assert.equal((together.match(/muted=""/g) ?? []).length, 2);
  assert.equal((render([screen, camera], camera).match(/<video\b/g) ?? []).length, 1);
  const otherCamera = { ...camera, key: "bob-camera", identity: "bob-session", name: "Bob", username: "bob" };
  assert.equal((render([screen, otherCamera], screen).match(/<video\b/g) ?? []).length, 1);
});

test("multiple screen shares show previous and next controls with a position indicator", () => {
  const otherScreen = { ...screen, key: "bob-screen", identity: "bob-session", username: "bob", name: "Bob" };
  const html = renderToStaticMarkup(createElement(RemoteMediaViewer, {
    tiles: [screen, otherScreen], selected: screen, minimized: false, onToggleSize: NO_ACTION, onSelect: NO_ACTION,
  }));
  assert.match(html, /aria-label="Previous screen share"/);
  assert.match(html, /aria-label="Next screen share"/);
  assert.match(html, /1 \/ 2/);
});
