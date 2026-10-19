import assert from "node:assert/strict";
import test from "node:test";
import { handlePersonDetailEscape } from "./personDetailKeyboard";

test("Escape closes details without a movement cancellation action", () => {
  const actions: string[] = [];
  const handled = handlePersonDetailEscape({ key: "Escape", defaultPrevented: false,
    preventDefault: () => actions.push("prevent"), stopPropagation: () => actions.push("stop") }, false, () => actions.push("close"));
  assert.equal(handled, true);
  assert.deepEqual(actions, ["prevent", "stop", "close"]);
});
test("movement, consumed Escape and another modal are left untouched", () => {
  const unexpected = () => { throw new Error("Unrelated keyboard input must propagate"); };
  for (const [key, defaultPrevented, modalOpen] of [["w", false, false], ["Escape", true, false], ["Escape", false, true]] as const) {
    assert.equal(handlePersonDetailEscape({ key, defaultPrevented, preventDefault: unexpected, stopPropagation: unexpected }, modalOpen, unexpected), false);
  }
});
