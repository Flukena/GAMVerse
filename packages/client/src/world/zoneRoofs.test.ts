import assert from "node:assert/strict";
import test from "node:test";
import { OrthographicCamera } from "three";
import type { RoomLayoutZone } from "@gammyverse/shared";
import { ZoneRoofs } from "./zoneRoofs";
class Element {
  style: Record<string, string> = {};
  children: Element[] = [];
  attributes: Record<string, string> = {};
  textContent = "";
  title = "";
  removed = false;
  clientWidth = 800;
  clientHeight = 600;
  append(...children: Element[]) { this.children.push(...children); }
  replaceChildren(...children: Element[]) { this.children = children; }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  remove() { this.removed = true; }
}
test("3D roof rows show left names and right status dots, update status, and reuse unchanged rows", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => new Element() } });
  const host = new Element();
  const zone: RoomLayoutZone = { id: "room", name: "Room", kind: "meeting", x: 0, z: 0, width: 10, depth: 10, color: "#fff" };
  const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  camera.position.z = 10;
  camera.updateMatrixWorld(true);
  const players = [{ x: 0, z: 0, username: "a", displayName: "Alice", status: "available" }];
  const roofs = new ZoneRoofs([zone], host as unknown as HTMLElement, { x: 0, z: 0 });
  try {
    roofs.update([zone], players, camera, true);
    const card = host.children[0];
    const row = card.children[0];
    assert.ok(card.style.cssText.includes("text-align:left"));
    assert.ok(row.style.cssText.includes("justify-content:space-between"));
    assert.equal(row.children[0].textContent, "Alice");
    assert.ok(row.children[1].style.cssText.includes("#2f9e62"));
    assert.equal(row.children[1].attributes["aria-label"], "Available");
    roofs.update([zone], players, camera, true);
    assert.equal(card.children[0], row);
    players[0].status = "do-not-disturb";
    roofs.update([zone], players, camera, true);
    assert.ok(card.children[0].children[1].style.cssText.includes("#dc3545"));
    assert.equal(card.children[0].children[0].textContent, "Alice");
    roofs.update([zone], players, camera, false);
    assert.equal(card.style.display, "none");
    assert.equal(roofs.root.children[0].visible, true, "hiding roster cards keeps the roof covered");
    roofs.update([zone], players, camera, true);
    assert.equal(card.style.display, "block", "roster returns when the 3D view resumes");
    roofs.update([], players, camera, true);
    assert.equal(card.children.length, 0);
    assert.equal(card.style.display, "none");
  } finally {
    roofs.dispose();
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  }
  assert.equal(host.children[0].removed, true);
});
