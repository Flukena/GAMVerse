import assert from "node:assert/strict";
import test from "node:test";
import { registerMap2dShortcut, shouldToggleMap2d, type Map2dShortcutState } from "./map2dShortcut";

const READY: Map2dShortcutState = { paused: false, buildMode: false, mapEditMode: false };
const MAP_KEY = { code: "KeyM", repeat: false };

test("M toggles 2D, V does not, and repeated M is ignored", () => {
  const toggles: string[] = [];
  const press = (code: string, repeat = false) => {
    if (shouldToggleMap2d({ code, repeat }, READY, null)) toggles.push("toggle");
  };
  press("KeyV");
  assert.deepEqual(toggles, []);
  press("KeyM");
  assert.deepEqual(toggles, ["toggle"]);
  press("KeyM", true);
  assert.deepEqual(toggles, ["toggle"]);
});

test("M is blocked while paused, building, or editing the map", () => {
  assert.equal(shouldToggleMap2d(MAP_KEY, { ...READY, paused: true }, null), false);
  assert.equal(shouldToggleMap2d(MAP_KEY, { ...READY, buildMode: true }, null), false);
  assert.equal(shouldToggleMap2d(MAP_KEY, { ...READY, mapEditMode: true }, null), false);
});

test("M ignores text controls and editable content, but accepts toolbar and canvas focus", () => {
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
    assert.equal(shouldToggleMap2d(MAP_KEY, READY, { tagName, isContentEditable: false }), false);
  }
  assert.equal(shouldToggleMap2d(MAP_KEY, READY, { tagName: "DIV", isContentEditable: true }), false);
  for (const tagName of ["BODY", "BUTTON", "CANVAS"]) {
    assert.equal(shouldToggleMap2d(MAP_KEY, READY, { tagName, isContentEditable: false }), true);
  }
});

test("window shortcut toggles once without canvas focus and unregisters", () => {
  const originalHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = class {} as typeof HTMLElement;
  const handlers = new Map<string, EventListener>();
  const windowTarget = {
    addEventListener(type: string, handler: EventListener) { handlers.set(type, handler); },
    removeEventListener(type: string, handler: EventListener) {
      assert.equal(handlers.get(type), handler);
      handlers.delete(type);
    },
  } as unknown as Window;
  const toggles: string[] = [];
  let prevented = false;
  try {
    const remove = registerMap2dShortcut(windowTarget, {
      state: () => READY,
      toggle() { toggles.push("toggle"); },
    });
    const keyDown = handlers.get("keydown");
    assert.ok(keyDown);
    const press = (code: string, repeat = false) => keyDown({
      code, repeat, target: null, preventDefault() { prevented = true; },
    } as unknown as KeyboardEvent);
    press("KeyV");
    assert.deepEqual(toggles, []);
    assert.equal(prevented, false);
    press("KeyM");
    assert.deepEqual(toggles, ["toggle"]);
    assert.equal(prevented, true);
    press("KeyM", true);
    assert.deepEqual(toggles, ["toggle"]);
    remove();
    assert.equal(handlers.has("keydown"), false);
  } finally { globalThis.HTMLElement = originalHTMLElement; }
});

test("M ignores focus inside an ARIA dialog or native dialog", () => {
  for (const dialogTag of ["[role=dialog]", "dialog"]) {
    const target = {
      tagName: "BUTTON", isContentEditable: false,
      closest(selector: string) { return selector.includes(dialogTag) ? {} : null; },
    };
    assert.equal(shouldToggleMap2d(MAP_KEY, READY, target), false);
  }
});
