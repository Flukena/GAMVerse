import assert from "node:assert/strict";
import test from "node:test";
import { blocksCommandPalette, isCommandPaletteShortcut } from "./commandPaletteShortcut";
import { buildCommandCatalog } from "./commandCatalog";
import { searchCommands, resolveCommand, nextCommandId, type WorkspaceCommand } from "./commandSearch";

const COMMANDS: WorkspaceCommand[] = [
  { id: "room:design", kind: "room", label: "Design room", keywords: ["upstairs"] },
  { id: "person:alex", kind: "person", label: "Alex Design", detail: "@alex" },
  { id: "action:design", kind: "action", label: "Design", disabledReason: "Admin only" },
];

test("search ranks exact labels before prefixes and matches every query token across metadata", () => {
  assert.deepEqual(searchCommands(COMMANDS, " DESIGN ").map(({ id }) => id), ["action:design", "room:design", "person:alex"]);
  assert.deepEqual(searchCommands(COMMANDS, "room upstairs").map(({ id }) => id), ["room:design"]);
  assert.deepEqual(searchCommands(COMMANDS, "alex @ALEX").map(({ id }) => id), ["person:alex"]);
  assert.deepEqual(searchCommands(COMMANDS, "missing"), []);
});

test("current command resolution rejects removed and denied results", () => {
  assert.equal(resolveCommand(COMMANDS, "person:alex")?.label, "Alex Design");
  assert.equal(resolveCommand(COMMANDS, "action:design"), null);
  assert.equal(resolveCommand([], "person:alex"), null);
  assert.equal(resolveCommand(COMMANDS, "person:alex", "Reconnecting"), null);
});

test("keyboard navigation wraps predictably and handles empty and removed selections", () => {
  assert.equal(nextCommandId(COMMANDS, "room:design", -1), "action:design");
  assert.equal(nextCommandId(COMMANDS, "action:design", 1), "room:design");
  assert.equal(nextCommandId(COMMANDS, "removed", 1), "room:design");
  assert.equal(nextCommandId([], null, 1), null);
});


test("catalog offers locate and authoritative navigation intents with reconnecting destinations denied", () => {
  const catalog = buildCommandCatalog({
    people: [{ sessionId: "alex", username: "alex.user", displayName: "Alex", presence: "away" }],
    rooms: [{ id: "meeting", name: "Meeting room", kind: "meeting" }],
  });
  const personActions = catalog.filter(({ kind }) => kind === "person");
  assert.deepEqual(personActions.map(({ intent, targetId }) => [intent, targetId]), [["locate-person", "alex"], ["go-to-person", "alex"]]);
  for (const command of personActions) assert.equal(resolveCommand(catalog, command.id), null);
  assert.equal(resolveCommand(catalog, "go-to-room:meeting")?.targetId, "meeting");
  assert.deepEqual(catalog.filter(({ intent }) => intent === "open-panel").map(({ targetId }) => targetId), ["people", "chat", "office", "activity"]);
  const disconnected = buildCommandCatalog({ people: [], rooms: [{ id: "room", name: "Room" }], disabledReason: "Reconnecting" });
  assert.equal(resolveCommand(disconnected, "go-to-room:room"), null);
  assert.ok(resolveCommand(disconnected, "open-panel:people"));
});


test("command shortcut gives an existing modal precedence and accepts both platform modifiers", () => {
  const shortcut = { key: "K", metaKey: true, ctrlKey: false, altKey: false, repeat: false, isComposing: false };
  assert.equal(isCommandPaletteShortcut(shortcut, true, false), true);
  assert.equal(isCommandPaletteShortcut({ ...shortcut, metaKey: false, ctrlKey: true }, true, false), true);
  assert.equal(isCommandPaletteShortcut(shortcut, true, true), false);
  assert.equal(isCommandPaletteShortcut(shortcut, false, false), false);
  assert.equal(isCommandPaletteShortcut({ ...shortcut, isComposing: true }, true, false), false);
  assert.equal(isCommandPaletteShortcut({ ...shortcut, repeat: true }, true, false), false);
  assert.equal(isCommandPaletteShortcut({ ...shortcut, altKey: true }, true, false), false);
});


test("semantic settings dialogs block command search while the palette itself and nonmodal panels do not", () => {
  const settings = { nativeOpen: false, role: "dialog", ariaModal: "true", isCommandPalette: false };
  assert.equal(blocksCommandPalette(settings), true);
  assert.equal(blocksCommandPalette({ ...settings, ariaModal: "false" }), false);
  assert.equal(blocksCommandPalette({ ...settings, role: "region" }), false);
  assert.equal(blocksCommandPalette({ ...settings, isCommandPalette: true }), false);
  assert.equal(blocksCommandPalette({ ...settings, role: null, ariaModal: null, nativeOpen: true }), true);
});
