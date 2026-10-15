import assert from "node:assert/strict";
import test from "node:test";
import { publishedVideoTile } from "./videoTileState.ts";

test("microphone or device updates with unchanged local video do not refocus the viewer", () => {
  const camera = { key: "camera", track: {} };
  assert.equal(publishedVideoTile([camera]), undefined);
});

test("a newly published screen share opens the viewer; stopping it does not refocus camera", () => {
  const camera = { key: "camera", track: {} };
  const screen = { key: "screen", track: {} };
  assert.equal(publishedVideoTile([camera, screen], screen.track), screen);
  assert.equal(publishedVideoTile([camera]), undefined);
});

test("republishing a source with a new track opens it", () => {
  const previous = { key: "camera", track: {} };
  const replacement = { key: "camera", track: {} };
  assert.equal(publishedVideoTile([replacement], replacement.track), replacement);
  assert.equal(publishedVideoTile([replacement], previous.track), undefined);
});

test("a microphone publication cannot focus an existing camera", () => {
  const camera = { key: "camera", track: {} };
  const microphoneTrack = {};
  assert.equal(publishedVideoTile([camera], microphoneTrack), undefined);
});
