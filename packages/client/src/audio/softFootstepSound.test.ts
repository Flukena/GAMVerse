import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { SoftFootstepSound } from "./softFootstepSound";

class RecordingSource {
  buffer: AudioBuffer | null = null;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  stopped = false;
  disconnected = false;
  connect() {}
  start() {}
  stop() { this.stopped = true; }
  disconnect() { this.disconnected = true; }
}

class RecordingContext {
  static instances: RecordingContext[] = [];
  sampleRate = 48000;
  currentTime = 0;
  state: AudioContextState = "running";
  destination = {};
  buffers: AudioBuffer[] = [];
  sources: RecordingSource[] = [];
  gains: number[] = [];
  constructor() { RecordingContext.instances.push(this); }
  createBuffer(_channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length);
    const buffer = { length, sampleRate, copyToChannel: (samples: Float32Array) => data.set(samples) } as unknown as AudioBuffer;
    this.buffers.push(buffer);
    return buffer;
  }
  createBufferSource() {
    const source = new RecordingSource();
    this.sources.push(source);
    return source;
  }
  createGain() {
    const gain = { value: 0 };
    return { gain, connect: () => { this.gains.push(gain.value); }, disconnect() {} };
  }
  resume() { return Promise.resolve(); }
  close() { this.state = "closed"; return Promise.resolve(); }
}

function browserAudio(t: TestContext, constructor: typeof RecordingContext | undefined = RecordingContext) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  RecordingContext.instances = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { AudioContext: constructor } });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
}

test("gesture unlock caches PCM buffers once and footsteps vary through bounded single voices", (t) => {
  browserAudio(t);
  const sound = new SoftFootstepSound();
  sound.play();
  assert.equal(RecordingContext.instances.length, 0);
  sound.unlock();
  const context = RecordingContext.instances[0]!;
  assert.equal(context.buffers.length, 4, "cache original crunchy footfalls at unlock instead of playing sine oscillators");
  sound.unlock();
  for (let step = 0; step < 6; step++) sound.play();
  assert.equal(RecordingContext.instances.length, 1);
  assert.equal(context.buffers.length, 4, "walking reuses cached PCM rather than regenerating noise");
  assert.equal(context.sources.length, 6);
  for (let index = 1; index < context.sources.length; index++) {
    assert.notEqual(context.sources[index]!.buffer, context.sources[index - 1]!.buffer);
    assert.equal(context.sources[index - 1]!.stopped, true);
    assert.equal(context.sources[index - 1]!.disconnected, true);
  }
  assert.ok(new Set(context.sources.map((source) => source.playbackRate.value)).size > 1);
  assert.ok(context.sources.every((source) => source.playbackRate.value >= 0.9 && source.playbackRate.value <= 1.1));
  assert.ok(new Set(context.gains).size > 1);
  sound.dispose();
  assert.equal(context.sources.at(-1)!.stopped, true);
  assert.equal(context.state, "closed");
  sound.unlock();
  sound.play();
  assert.equal(RecordingContext.instances.length, 1);
  assert.equal(context.sources.length, 6);
});

test("unsupported browser audio stays harmless", (t) => {
  browserAudio(t);
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  const sound = new SoftFootstepSound();
  sound.unlock();
  sound.play();
  sound.dispose();
  assert.equal(RecordingContext.instances.length, 0);
});
