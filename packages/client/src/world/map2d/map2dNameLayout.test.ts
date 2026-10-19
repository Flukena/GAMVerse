import assert from "node:assert/strict";
import test from "node:test";
import { fitMap2dName, layoutMap2dNames, type Map2dNameCandidate } from "./map2dNameLayout";

const viewport = { widthPx: 800, heightPx: 600 };
function candidate(sessionId: string, xPx = 400): Map2dNameCandidate {
  return { sessionId, text: sessionId, xPx, topPx: 250, widthPx: 100, heightPx: 20, local: false, speaking: false, handRaised: false };
}
test("dense labels prefer local, speaking and raised hands with deterministic ties", () => {
  const ordinary = candidate("a");
  const local = { ...candidate("z"), local: true };
  assert.deepEqual(layoutMap2dNames([ordinary, local], viewport).map(item => item.sessionId), ["z"]);
  const speaker = { ...candidate("speaker"), speaking: true };
  const raised = { ...candidate("raised"), handRaised: true };
  assert.deepEqual(layoutMap2dNames([ordinary, raised, speaker], viewport).map(item => item.sessionId), ["speaker"]);
  assert.deepEqual(layoutMap2dNames([ordinary, raised], viewport).map(item => item.sessionId), ["raised"]);
  assert.deepEqual(layoutMap2dNames([candidate("b"), ordinary], viewport), layoutMap2dNames([ordinary, candidate("b")], viewport));
});
test("separated names stay visible, edge names stay bounded and offscreen names are culled", () => {
  const result = layoutMap2dNames([candidate("left", 5), candidate("right", 795), candidate("outside", -200)], viewport);
  assert.equal(result.length, 2);
  for (const label of result) {
    assert.ok(label.leftPx >= 0);
    assert.ok(label.leftPx + label.widthPx <= viewport.widthPx);
  }
});
test("names cannot cover avatar obstacles and very long Unicode names use an ellipsis", () => {
  const names = layoutMap2dNames([candidate("hidden")], viewport, [{ leftPx: 360, topPx: 245, widthPx: 80, heightPx: 30 }]);
  assert.equal(names.length, 0);
  const measure = (text: string) => Array.from(text).length * 10;
  const text = fitMap2dName("Alice 👩🏽‍💻 Engineering", 80, measure);
  assert.ok(text.endsWith("…"));
  assert.ok(measure(text) <= 80);
  assert.equal(fitMap2dName("Alice", 80, measure), "Alice");
});
