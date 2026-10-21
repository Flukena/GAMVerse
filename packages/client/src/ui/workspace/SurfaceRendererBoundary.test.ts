import assert from "node:assert/strict";
import test, { after } from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRendererOrReportFailure, SurfaceRendererFallback } from "./SurfaceRendererBoundary";

const previousReact = (globalThis as { React?: typeof React }).React;
Object.assign(globalThis, { React });
after(() => {
  if (previousReact) Object.assign(globalThis, { React: previousReact });
  else Reflect.deleteProperty(globalThis, "React");
});

test("renderer fallback keeps a static preview and an accessible retry action", () => {
  const html = renderToStaticMarkup(createElement(SurfaceRendererFallback, { onRetry: () => {} }));

  assert.match(html, /class="surface-preview-static"/);
  assert.match(html, /aria-label="Retry material preview"/);
  assert.match(html, />Retry preview<\/button>/);
});

test("renderer initialization failures report to the local fallback and return no renderer", () => {
  let failureReported = false;
  const renderer = createRendererOrReportFailure(() => {
    throw new Error("WebGL initialization failed");
  }, () => {
    failureReported = true;
  });

  assert.equal(renderer, null);
  assert.equal(failureReported, true);
});