import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { AMBIENT_SOUND_PREFERENCE_EVENT, readAmbientSoundsEnabled, setAmbientSoundsEnabled } from "./ambientSoundPreference";

function browserStorage(t: TestContext) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage;
  const target = new EventTarget();
  Object.assign(target, { localStorage });
  Object.defineProperty(globalThis, "window", { configurable: true, value: target as Window });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  return { values, target };
}

test("ambient sounds default to enabled and migrate the existing footsteps preference", (t) => {
  const { values } = browserStorage(t);
  assert.equal(readAmbientSoundsEnabled(), true);
  values.set("gamverse.footsteps.enabled", "false");
  assert.equal(readAmbientSoundsEnabled(), false);
  values.set("gamverse.ambient-sounds.enabled", "true");
  assert.equal(readAmbientSoundsEnabled(), true, "the new ambient preference takes precedence");
});

test("ambient preference is persisted and broadcasts changes to live audio", (t) => {
  const { values, target } = browserStorage(t);
  let received: boolean | undefined;
  target.addEventListener(AMBIENT_SOUND_PREFERENCE_EVENT, (event) => { received = (event as CustomEvent<boolean>).detail; });
  setAmbientSoundsEnabled(false);
  assert.equal(values.get("gamverse.ambient-sounds.enabled"), "false");
  assert.equal(received, false);
  setAmbientSoundsEnabled(true);
  assert.equal(readAmbientSoundsEnabled(), true);
  assert.equal(received, true);
});
