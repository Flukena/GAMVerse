import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalEmbedUrl,
  isValidPropInteraction,
  normalizePropInteraction,
  nearestInteractiveProp,
} from "./propInteraction.js";

test("interaction validator rejects unsafe URLs and bounds text", () => {
  for (const url of [
    "http://youtube.com/watch?v=abcdefghijk",
    "https://user:pass@youtube.com/watch?v=abcdefghijk",
    "https://youtube.com:444/watch?v=abcdefghijk",
    "javascript:alert(1)",
    "https://youtube.com:444/watch?v=abcdefghijk",
    "https://xn--yutube-9za.com/watch?v=abcdefghijk",
  ])
    assert.equal(
      isValidPropInteraction({ kind: "embed", title: "Video", url }),
      false,
    );
  assert.equal(
    isValidPropInteraction({
      kind: "link",
      title: "Default TLS port",
      url: "https://example.com:443",
    }),
    true,
  );
  assert.equal(
    isValidPropInteraction({ kind: "note", title: "Note", text: "hello" }),
    true,
  );
  assert.equal(
    isValidPropInteraction({ kind: "note", title: "Note", text: 1 }),
    false,
  );
  assert.equal(
    isValidPropInteraction({
      kind: "link",
      title: "Site",
      url: "https://example.com",
    }),
    true,
  );
});
test("canonical embed converter recognizes exact providers and downgrades look-alike hosts", () => {
  const cases = [
    [
      "https://youtu.be/abcdefghijk",
      "https://www.youtube.com/embed/abcdefghijk",
    ],
    [
      "https://docs.google.com/document/d/abc/edit",
      "https://docs.google.com/document/d/abc/preview",
    ],
    [
      "https://docs.google.com/presentation/d/abc/edit",
      "https://docs.google.com/presentation/d/abc/embed",
    ],
    [
      "https://www.figma.com/design/abc/My-file",
      "https://www.figma.com/embed?embed_host=share&url=https%3A%2F%2Fwww.figma.com%2Fdesign%2Fabc",
    ],
    [
      "https://miro.com/app/board/abc=/",
      "https://miro.com/app/live-embed/abc%3D/",
    ],
    [
      "https://excalidraw.com/#room=abc,key",
      "https://excalidraw.com/#room=abc,key",
    ],
  ];
  for (const [url, expected] of cases)
    assert.equal(canonicalEmbedUrl(url), expected);
  for (const url of [
    "https://youtube.com.evil.test/watch?v=abcdefghijk",
    "https://xn--youtube-9za.com/watch?v=abcdefghijk",
    "https://example.com",
    "https://docs.google.com.evil.test/document/d/abc/edit",
    "https://figma.com.evil.test/design/abc/Foo",
    "https://miro.com.evil.test/app/board/abc/",
    "https://excalidraw.com.evil.test/",
    "https://youtube.com/watch?v=invalid",
    "https://docs.google.com/spreadsheets/d/abc/edit",
    "https://www.figma.com/community",
    "https://miro.com/app/dashboard/",
    "https://excalidraw.com/evil",
  ]) {
    assert.equal(canonicalEmbedUrl(url), null);
    assert.equal(
      normalizePropInteraction({ kind: "embed", title: "Link", url })?.kind,
      "link",
    );
  }
});
test("nearest interactive picker ignores non-interactive and distant props", () => {
  const props = [
    {
      id: "far",
      x: 20,
      z: 0,
      interaction: { kind: "note" as const, title: "far", text: "far" },
    },
    {
      id: "near",
      x: 1,
      z: 0,
      interaction: { kind: "note" as const, title: "near", text: "near" },
    },
    { id: "empty", x: 0, z: 0 },
  ];
  assert.equal(nearestInteractiveProp(props, { x: 0, z: 0 })?.id, "near");
  assert.equal(nearestInteractiveProp(props, { x: -20, z: 0 }), null);
});

test("Figma embeds rebuild only supported kind and identifier without input query or fragment", () => {
  for (const kind of ["file", "design", "proto"]) {
    const canonical = `https://www.figma.com/${kind}/abc-123`;
    const source = `https://figma.com/${kind}/abc-123/Display-name?redirect=https://evil.test/#sensitive-secret`;
    assert.equal(
      canonicalEmbedUrl(source),
      `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(canonical)}`,
    );
  }
});

test("Excalidraw embeds retain only validated collaborative room fragments", () => {
  assert.equal(
    canonicalEmbedUrl(
      "https://excalidraw.com/?redirect=https://evil.test/#room=board-123,key_456",
    ),
    "https://excalidraw.com/#room=board-123,key_456",
  );
  for (const fragment of [
    "",
    "#json=abc,key",
    "#room=abc",
    "#room=abc,key&redirect=evil",
    "#room=abc,key/extra",
  ]) {
    const url = `https://excalidraw.com/${fragment}`;
    assert.equal(canonicalEmbedUrl(url), null);
    assert.equal(
      normalizePropInteraction({ kind: "embed", title: "Board", url })?.kind,
      "link",
    );
  }
});

test("a parseable punycode provider look-alike is a link and never an embed", () => {
  const url = "https://xn--youtube-9za.com/watch?v=abcdefghijk";
  assert.equal(URL.canParse(url), true);
  assert.equal(new URL(url).hostname, "xn--youtube-9za.com");
  assert.equal(canonicalEmbedUrl(url), null);
  assert.equal(
    normalizePropInteraction({ kind: "embed", title: "Look-alike", url })?.kind,
    "link",
  );
});
