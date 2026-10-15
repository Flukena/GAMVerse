import assert from "node:assert/strict";
import test from "node:test";
import { pickMap2dPlayer, locateMap2d } from "./map2dInput";
import { Map2dRenderer, type Map2dFrame } from "./Map2dRenderer";
import { applyCameraView } from "../camera/cameraView";
import { cameraReducer, createCameraState } from "../camera/cameraState";
import type { Map2dProjection } from "./map2dProjection";
const PROJECTION: Map2dProjection = {
  center: { x: 4, z: -7 },
  pxPerM: 12,
  widthPx: 800,
  heightPx: 600,
  dpr: 2,
};
test("overlapping players pick nearest and distant clicks miss", () => {
  const players = new Map([
    ["far", { x: 4, z: -7 }],
    ["near", { x: 5, z: -7 }],
  ]);
  assert.equal(
    pickMap2dPlayer(PROJECTION, players, { x: 413, y: 300 }),
    "near",
  );
  assert.equal(pickMap2dPlayer(PROJECTION, players, { x: 0, y: 0 }), null);
});
test("locate switches to 2D detached and expires a pulse", () => {
  const state = locateMap2d({ x: 3, z: 9 }, "target", 100);
  assert.deepEqual(state.center, { x: 3, z: 9 });
  assert.equal(state.following, false);
  assert.equal(state.view, "2d");
  assert.ok(state.decoration.expiresAtMs > 100);
});

test("Locate and toolbar view requests leave FPP, persist view, and preserve orbit yaw", () => {
  const fpp = cameraReducer(createCameraState(true), { type: "toggle-fpp" });
  const orbitYawRad = Math.PI / 3;
  const framing = {
    yawRad: orbitYawRad,
    firstPerson: true,
    pointerLocked: true,
    persistedView: "3d",
  };
  const state = applyCameraView(fpp, "2d", {
    exitFirstPerson() {
      framing.firstPerson = false;
      framing.pointerLocked = false;
    },
    persistView(view) {
      framing.persistedView = view;
    },
  });
  assert.equal(state.mode, "map2d");
  assert.equal(framing.firstPerson, false);
  assert.equal(framing.pointerLocked, false);
  assert.equal(framing.persistedView, "2d");
  assert.equal(framing.yawRad, orbitYawRad);
});

const WHEEL_IN_DELTA_PX = -10;
const TEST_MAP_DIMENSION_M = 100;
test("threshold map canvas forwards wheel to overview ratio zoom only", () => {
  const { canvas, handlers } = createTestCanvas();
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => canvas } as unknown as Document;
  const overviewDeltas: number[] = [];
  const scaleRequests: number[] = [];
  try {
    const renderer = new Map2dRenderer(canvas, {
      pan() {},
      walk() {},
      selectPlayer() {},
      zoom(scale) {
        scaleRequests.push(scale);
      },
      zoomOverview(deltaYPx) {
        overviewDeltas.push(deltaYPx);
      },
    });
    const frame: Map2dFrame = {
      visible: true,
      view: "3d",
      layout: null,
      widthM: TEST_MAP_DIMENSION_M,
      depthM: TEST_MAP_DIMENSION_M,
      configVersion: 0,
      projection: PROJECTION,
      players: new Map(),
      localId: null,
      speaking: new Set(),
      decorations: [],
      nowMs: 0,
      deltaS: 0,
    };
    renderer.frame(frame);
    const wheel = handlers.get("wheel");
    assert.ok(wheel);
    wheel({
      deltaY: WHEEL_IN_DELTA_PX,
      clientX: 0,
      clientY: 0,
      preventDefault() {},
    } as unknown as WheelEvent);
    assert.deepEqual(overviewDeltas, [WHEEL_IN_DELTA_PX]);
    assert.deepEqual(scaleRequests, []);
    renderer.dispose();
  } finally {
    globalThis.document = originalDocument;
  }
});

function createTestCanvas() {
  const handlers = new Map<string, EventListener>();
  const canvas = {
    style: {},
    width: 0,
    height: 0,
    addEventListener(type: string, handler: EventListener) {
      handlers.set(type, handler);
    },
    removeEventListener(type: string) {
      handlers.delete(type);
    },
    setAttribute() {},
    focus() {},
    setPointerCapture() {},
    getContext() {
      return null;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0 };
    },
  } as unknown as HTMLCanvasElement;
  return { canvas, handlers };
}

test("map canvas leaves M to the single window handler", () => {
  const { canvas, handlers } = createTestCanvas();
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => canvas } as unknown as Document;
  try {
    const renderer = new Map2dRenderer(canvas, {
      pan() {}, walk() {}, selectPlayer() {}, zoom() {}, zoomOverview() {},
    });
    assert.equal(handlers.has("keydown"), false);
    renderer.dispose();
  } finally { globalThis.document = originalDocument; }
});

const PRIMARY_POINTER_ID = 1;
const SECONDARY_POINTER_ID = 2;
const CLICK_CLIENT_PX = 200;
const DRAG_END_CLIENT_PX = 240;

function pointerEvent(pointerId: number, clientX = CLICK_CLIENT_PX): PointerEvent {
  return { pointerId, clientX, clientY: CLICK_CLIENT_PX, button: 0, buttons: 0 } as PointerEvent;
}

function withPointerRenderer(check: (handlers: Map<string, EventListener>, walks: unknown[], pans: unknown[], renderer: Map2dRenderer, frame: Map2dFrame) => void): void {
  const { canvas, handlers } = createTestCanvas();
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => canvas } as unknown as Document;
  const walks: unknown[] = [];
  const pans: unknown[] = [];
  const renderer = new Map2dRenderer(canvas, {
    walk(destination) { walks.push(destination); },
    pan(center) { pans.push(center); },
    selectPlayer() {}, zoom() {}, zoomOverview() {},
  });
  const frame: Map2dFrame = {
    visible: true, view: "2d", layout: null, widthM: TEST_MAP_DIMENSION_M,
    depthM: TEST_MAP_DIMENSION_M, configVersion: 0, projection: PROJECTION,
    players: new Map(), localId: null, speaking: new Set(), decorations: [], nowMs: 0, deltaS: 0,
  };
  try {
    renderer.frame(frame);
    check(handlers, walks, pans, renderer, frame);
  } finally {
    renderer.dispose();
    globalThis.document = originalDocument;
  }
}

test("map travel clicks are independent from drag gestures", () => {
  withPointerRenderer((handlers, walks) => {
    handlers.get("pointerdown")!(pointerEvent(PRIMARY_POINTER_ID));
    handlers.get("pointerup")!(pointerEvent(PRIMARY_POINTER_ID));
    assert.equal(walks.length, 1);
    handlers.get("pointerdown")!(pointerEvent(PRIMARY_POINTER_ID));
    handlers.get("pointerup")!(pointerEvent(PRIMARY_POINTER_ID));
    assert.equal(walks.length, 2);
    handlers.get("pointerdown")!(pointerEvent(PRIMARY_POINTER_ID));
    handlers.get("pointerup")!(pointerEvent(PRIMARY_POINTER_ID, DRAG_END_CLIENT_PX));
    assert.equal(walks.length, 2);
  });
});

test("another pointer cannot pan or release the active map gesture", () => {
  withPointerRenderer((handlers, walks, pans) => {
    handlers.get("pointerdown")!(pointerEvent(PRIMARY_POINTER_ID));
    handlers.get("pointermove")!(pointerEvent(SECONDARY_POINTER_ID, DRAG_END_CLIENT_PX));
    handlers.get("pointerup")!(pointerEvent(SECONDARY_POINTER_ID));
    assert.equal(pans.length, 0);
    assert.equal(walks.length, 0);
    handlers.get("pointerup")!(pointerEvent(PRIMARY_POINTER_ID));
    assert.equal(walks.length, 1);
  });
});

for (const cancelEvent of ["pointercancel", "lostpointercapture"]) {
  test(`${cancelEvent} ends a gesture without walking`, () => {
    withPointerRenderer((handlers, walks) => {
      handlers.get("pointerdown")!(pointerEvent(PRIMARY_POINTER_ID));
      handlers.get(cancelEvent)?.(pointerEvent(PRIMARY_POINTER_ID));
      handlers.get("pointerup")!(pointerEvent(PRIMARY_POINTER_ID));
      assert.equal(walks.length, 0);
    });
  });
}

test("hiding the map invalidates a pending click", () => {
  withPointerRenderer((handlers, walks, _pans, renderer, frame) => {
    handlers.get("pointerdown")!(pointerEvent(PRIMARY_POINTER_ID));
    renderer.frame({ ...frame, visible: false });
    renderer.frame(frame);
    handlers.get("pointerup")!(pointerEvent(PRIMARY_POINTER_ID));
    assert.equal(walks.length, 0);
  });
});
