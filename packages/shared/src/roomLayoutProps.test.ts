import assert from "node:assert/strict";
import test from "node:test";
import { readRoomLayout, ROOM_PROP_CATALOG } from "./roomLayout.js";

test("read layout preserves normalized interaction without trusting extra metadata", () => {
  const asset = ROOM_PROP_CATALOG[0].asset;
  const layout = readRoomLayout({
    layout: {
      props: [
        {
          id: "p",
          asset,
          x: 0,
          z: 0,
          interaction: {
            kind: "embed",
            title: " link ",
            url: "https://example.com",
          },
        },
      ],
    },
  });
  assert.deepEqual(layout.props[0].interaction, {
    kind: "link",
    title: "link",
    url: "https://example.com/",
  });
});

test("shower catalog height renders a full-size shower instead of normalizing it to one meter", () => {
  const shower = ROOM_PROP_CATALOG.find((item) => item.asset === "kit:shower");
  assert.ok(shower);
  assert.equal(shower.height, 2);
  assert.equal(shower.width, 1);
  assert.equal(shower.depth, 1);
});

test("campus trees are scaled fifty percent above their previous size", () => {
  for (const [asset, sourceHeight] of [
    ["kit-mini-forest-tree", 1.684],
    ["kit-mini-forest-tree-high", 2.284],
  ] as const) {
    const tree = ROOM_PROP_CATALOG.find((item) => item.asset === asset);
    assert.ok(tree);
    assert.ok(Math.abs(tree.height - sourceHeight * 1.9 * 1.5) < 1e-9);
  }
});
