import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { RemoteVideoTrack, Track, TrackEvent } from "livekit-client";
import { createVoiceRoom } from "./voiceRoomSdk";

const VIEWER_WIDTH_CSS_PX = 960;
const VIEWER_HEIGHT_CSS_PX = 540;
const DEVICE_PIXEL_RATIOS = [1, 2];
const TEST_TIMEOUT_MS = 2_000;
const SCREEN_TRACK_ID = "screen-quality-test";

for (const devicePixelRatio of DEVICE_PIXEL_RATIOS) {
  test(`screen subscriptions request physical pixels at device pixel ratio ${devicePixelRatio}`, { timeout: TEST_TIMEOUT_MS }, async (context) => {
    const { room } = await createVoiceRoom();
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
    let track: RemoteVideoTrack | undefined;
    let elementInfo: Parameters<RemoteVideoTrack["observeElementInfo"]>[0] | undefined;
    context.after(async () => {
      if (track && elementInfo) track.stopObservingElementInfo(elementInfo);
      if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
      else Reflect.deleteProperty(globalThis, "window");
      if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor);
      else Reflect.deleteProperty(globalThis, "document");
      await room.disconnect();
    });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { devicePixelRatio } });
    Object.defineProperty(globalThis, "document", { configurable: true, value: { visibilityState: "visible" } });
    const adaptiveStream = room.options.adaptiveStream;
    track = new RemoteVideoTrack(
      { id: SCREEN_TRACK_ID, kind: "video" } as MediaStreamTrack,
      SCREEN_TRACK_ID,
      {} as RTCRtpReceiver,
      typeof adaptiveStream === "object" ? adaptiveStream : {},
    );
    track.source = Track.Source.ScreenShare;
    elementInfo = {
      element: {}, width: () => VIEWER_WIDTH_CSS_PX, height: () => VIEWER_HEIGHT_CSS_PX,
      visible: true, pictureInPicture: false, visibilityChangedAt: 0,
      observe() {}, stopObserving() {},
    };
    const dimensionsChanged = once(track, TrackEvent.VideoDimensionsChanged);
    track.observeElementInfo(elementInfo);
    const [dimensions] = await dimensionsChanged;
    assert.deepEqual(dimensions, {
      width: VIEWER_WIDTH_CSS_PX * devicePixelRatio,
      height: VIEWER_HEIGHT_CSS_PX * devicePixelRatio,
    });
    assert.equal(room.options.dynacast, true);
    assert.equal(room.options.stopLocalTrackOnUnpublish, false);
  });
}
