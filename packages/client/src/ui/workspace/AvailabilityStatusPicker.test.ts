import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test, { after } from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { USER_STATUSES } from "@gammyverse/shared";
import { USER_STATUS_PRESENTATIONS } from "../../presencePresentation";

const previousReact = (globalThis as { React?: typeof React }).React;
Object.assign(globalThis, { React });
after(() => {
  if (previousReact) Object.assign(globalThis, { React: previousReact });
  else Reflect.deleteProperty(globalThis, "React");
});
const cssLoader = registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith(".css")) return { format: "module", source: "", shortCircuit: true };
  return nextLoad(url, context);
} });
const { AvailabilityMenu } = await import("./AvailabilityMenu");
const { AvailabilityDialog } = await import("./AvailabilityDialog");
cssLoader.deregister();
const NO_ACTION = () => {};
const SAVE_ERROR_LABEL = "Status could not be saved.";

test("quick status selection exposes every status with its shared icon, color and label", () => {
  const html = renderToStaticMarkup(createElement(AvailabilityMenu, {
    status: "away", onStatusChange: NO_ACTION, onEditCustomStatus: NO_ACTION,
  }));
  assert.match(html, /<legend[^>]*>Availability<\/legend>/);
  assert.equal((html.match(/type="radio"/g) ?? []).length, USER_STATUSES.length);
  assert.equal((html.match(/checked=""/g) ?? []).length, 1);
  assert.match(html, /<input[^>]*checked=""[^>]*value="away"/);
  for (const status of USER_STATUSES) {
    const presentation = USER_STATUS_PRESENTATIONS[status];
    assert.ok(html.includes(presentation.label));
    assert.ok(html.includes(presentation.color));
    assert.ok(html.includes(presentation.icon));
  }
});

test("disconnected quick status selection disables the entire group and custom action", () => {
  const html = renderToStaticMarkup(createElement(AvailabilityMenu, {
    status: "available", disabled: true, onStatusChange: NO_ACTION, onEditCustomStatus: NO_ACTION,
  }));
  assert.match(html, /<fieldset[^>]*disabled=""/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Set custom status<\/button>/);
});

test("status editor preserves pending and save errors and describes manual microphone control", () => {
  const html = renderToStaticMarkup(createElement(AvailabilityDialog, {
    status: "in-meeting", customStatus: { text: "Deep work", emoji: "🎯", expiresAtMs: null },
    pending: true, error: SAVE_ERROR_LABEL, onSave: NO_ACTION, onClose: NO_ACTION,
  }));
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /<fieldset[^>]*disabled=""/);
  assert.match(html, /role="alert">Status could not be saved\.<\/p>/);
  assert.match(html, />Saving…<\/button>/);
  assert.match(html, /value="Deep work"/);
  assert.match(html, /microphone button/i);
  assert.doesNotMatch(html, /turn off automatic audio|keeps your microphone and camera off/i);
  assert.match(html, /<input[^>]*checked=""[^>]*value="in-meeting"/);
});
