import assert from "node:assert/strict";
import test from "node:test";
import { mountLiquidGlassPreview, type GlassPreviewFactory } from "./liquidGlassPreview";

test("liquid glass preview tracks its target and releases all resources", () => {
  const listeners = new Map<string, EventListener>();
  const removedListeners: string[] = [];
  const appended: unknown[] = [];
  let disconnected = false;
  let destroyed = false;
  const positions: Array<[number, number]> = [];
  let bounds = { left: 20, top: 30, width: 220, height: 100 };
  const dialog = { append: (...nodes: unknown[]) => appended.push(...nodes) };
  const target = {
    clientWidth: 220,
    getBoundingClientRect: () => bounds,
    closest: () => dialog,
  } as unknown as HTMLElement;
  const fakeWindow = {
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    removeEventListener: (type: string) => removedListeners.push(type),
  };
  const originalWindow = globalThis.window;
  const originalResizeObserver = globalThis.ResizeObserver;
  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: class {
      observe() {}
      disconnect() { disconnected = true; }
    },
  });

  try {
    const createGlass: GlassPreviewFactory = (options) => {
      assert.equal(options.background, target);
      assert.equal(options.width, 160);
      assert.equal(options.height, 58);
      return {
        elements: [{}, {}, {}] as Node[],
        moveTo: (x, y) => { positions.push([x, y]); },
        destroy: () => { destroyed = true; },
      };
    };
    const cleanup = mountLiquidGlassPreview(target, target, createGlass);

    assert.deepEqual(positions, [[50, 51]]);
    assert.equal(appended.length, 3);
    assert.ok(listeners.has("scroll"));
    assert.ok(listeners.has("resize"));

    bounds = { left: 40, top: 50, width: 220, height: 100 };
    listeners.get("scroll")?.(new Event("scroll"));
    assert.deepEqual(positions.at(-1), [70, 71]);

    cleanup();
    assert.deepEqual(removedListeners.sort(), ["resize", "scroll"]);
    assert.equal(disconnected, true);
    assert.equal(destroyed, true);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: originalResizeObserver });
  }
});