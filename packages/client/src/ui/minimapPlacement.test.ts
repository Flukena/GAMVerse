import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Minimap } from "./Minimap";

test("minimap combines the map, compass, and centered player marker", () => {
  const runtimeGlobals = globalThis as typeof globalThis & { React?: typeof React };
  const previousReact = runtimeGlobals.React;
  runtimeGlobals.React = React;
  let markup: string;
  try {
    markup = renderToStaticMarkup(createElement(Minimap, {
      layout: null,
      configVersion: 0,
      playersRef: { current: new Map() },
      localSessionIdRef: { current: null },
      cameraYawRef: { current: 0 },
      hidden: false,
    }));
  } finally {
    runtimeGlobals.React = previousReact;
  }
  assert.match(markup, /office-minimap-frame/);
  assert.match(markup, /office-minimap-compass-rose/);
  assert.match(markup, /office-minimap-player/);
});
