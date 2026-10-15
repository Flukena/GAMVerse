import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Minimap } from "./Minimap";

test("minimap anchors to the lower-left corner", () => {
  const runtimeGlobals = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtimeGlobals.React;
  runtimeGlobals.React = React;
  let markup: string;
  try {
    markup = renderToStaticMarkup(createElement(Minimap, {
      layout: null,
      configVersion: 0,
      playersRef: { current: new Map() },
      firstPersonViewRef: { current: false },
      hidden: false,
      onPan() {},
    }));
  } finally {
    runtimeGlobals.React = previousReact;
  }
  assert.match(markup, /left:12px/);
  assert.match(markup, /bottom:12px/);
  assert.doesNotMatch(markup, /right:12px/);
});
