import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test, { after } from "node:test";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PersonCardProps } from "./PersonCard";

// The shared-package test runner uses classic JSX; supply the real React runtime.
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
const { MapPersonDialog } = await import("./MapPersonDialog");
cssLoader.deregister();
const NO_ACTION = () => {};
const PROPS: PersonCardProps & { onClose(): void } = {
  entry: ["remote-session", { username: "remote", displayName: "Remote Member", characterId: "character-male-a", presence: "online", status: "available", nearby: true, handRaised: false }],
  localSessionId: "local-session", followingSessionId: null, spotlightUsernames: [], canSpotlight: false, disabled: false, canMeet: true,
  onMessage: NO_ACTION, onGoTo: NO_ACTION, onLocate: NO_ACTION, onFollow: NO_ACTION, onWave: NO_ACTION, onSpotlight: NO_ACTION,
  onClose: NO_ACTION,
};

test("person details render as a nonmodal panel so viewing does not globally block movement", () => {
  const html = renderToStaticMarkup(createElement(MapPersonDialog, PROPS));
  assert.doesNotMatch(html, /<dialog\b|aria-modal="true"/);
  assert.match(html, /<aside\b/);
  assert.match(html, /Remote Member/);
  assert.match(html, /Close person details/);
});
test("nonmodal details retain person actions and availability policy", () => {
  const html = renderToStaticMarkup(createElement(MapPersonDialog, { ...PROPS, entry: [PROPS.entry[0], { ...PROPS.entry[1], status: "do-not-disturb" }] }));
  assert.match(html, />Message<\/button>/);
  assert.match(html, />Go to<\/button>/);
  assert.match(html, /disabled=""[^>]*>Meet<\/button>/);
});
