import assert from "node:assert/strict";
import test from "node:test";
import { handleWorkspacePanelEscape } from "./useWorkspacePanelFocus";

test("sidebar Escape closes and restores focus after consuming the event", () => {
  const actions: string[] = [];
  handleWorkspacePanelEscape({ key: "Escape", defaultPrevented: false,
    preventDefault: () => actions.push("prevent"), stopPropagation: () => actions.push("stop") },
  () => actions.push("close"), () => actions.push("focus"));
  assert.deepEqual(actions, ["prevent", "stop", "close", "focus"]);
});

test("a consumed Escape and typing keys leave the sidebar open", () => {
  let closes = 0;
  const unexpected = () => { throw new Error("Unhandled keys must propagate"); };
  for (const input of [{ key: "Escape", defaultPrevented: true }, { key: "w", defaultPrevented: false }]) {
    handleWorkspacePanelEscape({ ...input, preventDefault: unexpected, stopPropagation: unexpected }, () => closes++, unexpected);
  }
  assert.equal(closes, 0);
});
