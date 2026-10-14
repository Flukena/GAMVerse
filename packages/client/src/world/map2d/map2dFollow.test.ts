import assert from "node:assert/strict";
import test from "node:test";
import { Map2dRenderer, type Map2dFrame } from "./Map2dRenderer";
import { smoothAvatarPose } from "./avatarPoseSmoother";

const FRAME_DELTA_S = 1 / 60;
const POSITION_TOLERANCE_M = 1e-9;
const SERVER_STEP_FRAMES = 3;
const CLICK_OFFSET_PX = 200;
const SCALE_PX_PER_M = 12;
const VIEWPORT_WIDTH_PX = 800;
const VIEWPORT_HEIGHT_PX = 600;
function harness() {
  const handlers = new Map<string, EventListener>();
  const canvas = {
    style: {}, width: 0, height: 0,
    addEventListener(type: string, handler: EventListener) { handlers.set(type, handler); },
    removeEventListener(type: string) { handlers.delete(type); },
    setAttribute() {}, getContext() { return null; }, focus() {}, setPointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0 }; },
  } as unknown as HTMLCanvasElement;
  let walkedX = Number.NaN;
  const renderer = new Map2dRenderer(canvas, {
    pan() {}, zoom() {}, zoomOverview() {}, selectPlayer() {},
    walk(point) { walkedX = point.x; },
  });
  const frame: Map2dFrame & { following: boolean } = {
    visible: true, view: "2d", following: true, layout: null,
    widthM: 100, depthM: 100, configVersion: 0,
    projection: { center: { x: 0, z: 0 }, pxPerM: SCALE_PX_PER_M, widthPx: VIEWPORT_WIDTH_PX, heightPx: VIEWPORT_HEIGHT_PX, dpr: 1 },
    players: new Map(), localId: "local", speaking: new Set(), decorations: [], nowMs: 0, deltaS: FRAME_DELTA_S,
  };
  const clickCenterX = () => {
    const event = { pointerId: 1, button: 0, clientX: VIEWPORT_WIDTH_PX / 2 + CLICK_OFFSET_PX, clientY: VIEWPORT_HEIGHT_PX / 2 } as unknown as PointerEvent;
    handlers.get("pointerdown")?.(event);
    handlers.get("pointerup")?.(event);
    return walkedX - CLICK_OFFSET_PX / SCALE_PX_PER_M;
  };
  return { renderer, frame, clickCenterX, canvas };
}
function withDocument(run: (value: ReturnType<typeof harness>) => void): void {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => null }) } as unknown as Document;
  const value = harness();
  try { run(value); } finally { value.renderer.dispose(); globalThis.document = previous; }
}
test("50ms server steps follow the smoothed local pose for every intervening render frame", () => {
  withDocument(({ renderer, frame, clickCenterX }) => {
    let pose = { x: 0, z: 0, rotation: 0 };
    frame.players = new Map([["local", { ...pose, username: "local", displayName: "Local" }]]);
    renderer.frame(frame);
    for (const rawX of [1, 2]) {
      for (let step = 0; step < SERVER_STEP_FRAMES; step += 1) {
        const target = { x: rawX, z: 0, rotation: 0 };
        frame.players = new Map([["local", { ...target, username: "local", displayName: "Local" }]]);
        frame.projection.center.x = rawX;
        pose = smoothAvatarPose(pose, target, FRAME_DELTA_S, true);
        renderer.frame(frame);
        assert.ok(Math.abs(clickCenterX() - pose.x) < POSITION_TOLERANCE_M, `frame ${step}: center follows smoothed pose`);
      }
    }
  });
});
test("detached pan and Locate center are preserved", () => {
  withDocument(({ renderer, frame, clickCenterX }) => {
    frame.following = false;
    frame.projection.center.x = 8;
    frame.players = new Map([["local", { x: 0, z: 0, rotation: 0, username: "local", displayName: "Local" }]]);
    renderer.frame(frame);
    assert.ok(Math.abs(clickCenterX() - 8) < POSITION_TOLERANCE_M);
  });
});
test("map frame dirty detection does not serialize all players", () => {
  withDocument(({ renderer, frame }) => {
    const stringify = JSON.stringify;
    JSON.stringify = () => { throw new Error("per-frame serialization"); };
    try { assert.doesNotThrow(() => renderer.frame(frame)); }
    finally { JSON.stringify = stringify; }
  });
});
