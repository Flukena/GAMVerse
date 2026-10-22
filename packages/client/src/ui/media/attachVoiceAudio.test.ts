import assert from "node:assert/strict";
import test from "node:test";
import { RemoteAudioTrack } from "livekit-client";
import { attachVoiceAudio } from "./attachVoiceAudio";

const MUTED_VOLUME = 0;
const ATTENUATED_VOLUME = 0.4;
const DEFAULT_GAIN = 1;
const AUDIO_TRACK_ID = "deafened-subscription-test";

class TestMediaStream {
  private readonly tracks = new Set<MediaStreamTrack>();
  addTrack(track: MediaStreamTrack): void { this.tracks.add(track); }
  removeTrack(track: MediaStreamTrack): void { this.tracks.delete(track); }
  getTracks(): MediaStreamTrack[] { return [...this.tracks]; }
  getAudioTracks(): MediaStreamTrack[] { return this.getTracks().filter(track => track.kind === "audio"); }
  getVideoTracks(): MediaStreamTrack[] { return this.getTracks().filter(track => track.kind === "video"); }
}

class TestAudioElement {
  srcObject: MediaStream | null = null;
  volume = DEFAULT_GAIN;
  muted = false;
  autoplay = false;
  parentElement = {};
  async play(): Promise<void> {}
  pause(): void {}
}

class TestVideoElement {}

class TestAudioContext {
  readonly state = "running";
  readonly destination = {};
  readonly gain = {
    value: DEFAULT_GAIN,
    setTargetAtTime(value: number): void { this.value = value; },
  };
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createGain() { return { gain: this.gain, connect() {}, disconnect() {} }; }
}

for (const volume of [MUTED_VOLUME, ATTENUATED_VOLUME]) {
  test(`new remote audio subscriptions apply Web Audio volume ${volume} when attaching`, context => {
    const replacements = {
      document: { createElement: () => new TestAudioElement(), removeEventListener() {} },
      MediaStream: TestMediaStream,
      HTMLAudioElement: TestAudioElement,
      HTMLVideoElement: TestVideoElement,
    };
    const descriptors = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    let track: RemoteAudioTrack | undefined;
    context.after(() => {
      track?.detach();
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    });
    for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value });
    const audioContext = new TestAudioContext();
    track = new RemoteAudioTrack(
      { id: AUDIO_TRACK_ID, kind: "audio" } as MediaStreamTrack,
      AUDIO_TRACK_ID,
      {} as RTCRtpReceiver,
      audioContext as unknown as AudioContext,
    );
    const element = attachVoiceAudio(track, volume);
    assert.ok(element instanceof TestAudioElement);
    assert.equal(audioContext.gain.value, volume, "the actual Web Audio gain must match the requested listening volume");
    assert.equal(element.muted, true, "Web Audio owns playback; the HTML element stays silent");
  });
}
