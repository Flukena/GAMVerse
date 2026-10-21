import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3, type Camera } from "three";
import type { RoomLayoutZone, RoomLayoutWall } from "@gammyverse/shared";
import { zoneRoofColor, zoneRoofHeightM, zoneOccupantRows, type ZoneOccupant } from "./zoneVisibility";

const ZONE_ROOF_THICKNESS_M = 0.16;
const ZONE_ROOF_LABEL_OFFSET_M = 0.3;

/** Roof geometry stays in the scene; only visibility and changed label text update. */
export class ZoneRoofs {
  readonly root = new Group();
  private readonly projection = new Vector3();
  private readonly entries = new Map<string, { roof: Mesh; label: HTMLDivElement; zone: RoomLayoutZone; rowsKey: string }>();
  constructor(zones: readonly RoomLayoutZone[], private readonly host: HTMLElement, offset: { x: number; z: number }, walls: readonly RoomLayoutWall[] = []) {
    this.root.name = "Covered zone roofs";
    for (const zone of zones) {
      const roof = new Mesh(new BoxGeometry(zone.width, ZONE_ROOF_THICKNESS_M, zone.depth), new MeshStandardMaterial({ color: zoneRoofColor(zone, walls), roughness: 1 }));
      roof.position.set(zone.x + offset.x, zoneRoofHeightM(zone, walls) + ZONE_ROOF_THICKNESS_M / 2, zone.z + offset.z);
      roof.visible = false;
      roof.receiveShadow = true;
      this.root.add(roof);
      const label = document.createElement("div");
      label.style.cssText = "position:absolute;transform:translate(-50%,-100%);pointer-events:none;text-align:left;background:rgba(255,253,247,0.94);color:#10212c;border-radius:6px;padding:4px 8px;font:600 8px system-ui;display:none";
      host.append(label);
      this.entries.set(zone.id, { roof, label, zone, rowsKey: "" });
    }
  }
  update(covered: readonly RoomLayoutZone[], players: Iterable<ZoneOccupant>, camera: Camera, visible: boolean): void {
    const ids = new Set(covered.map(zone => zone.id));
    const occupants = [...players];
    for (const [id, entry] of this.entries) {
      const { roof, label, zone } = entry;
      roof.visible = ids.has(id);
      const rows = roof.visible ? zoneOccupantRows(zone, occupants) : [];
      const rowsKey = JSON.stringify(rows);
      if (entry.rowsKey !== rowsKey) {
        entry.rowsKey = rowsKey;
        label.replaceChildren(...rows.map(({ name, color, statusLabel }) => {
          const row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;line-height:16px";
          const text = document.createElement("span");
          text.textContent = name;
          const dot = document.createElement("span");
          dot.style.cssText = `width:8px;height:8px;flex:none;border-radius:50%;background:${color}`;
          dot.setAttribute("role", "img");
          dot.setAttribute("aria-label", statusLabel);
          dot.title = statusLabel;
          row.append(text, dot);
          return row;
        }));
      }
      this.projection.set(roof.position.x, roof.position.y + ZONE_ROOF_LABEL_OFFSET_M, roof.position.z).project(camera);
      const inView = visible && rows.length > 0 && this.projection.z >= -1 && this.projection.z <= 1 && Math.abs(this.projection.x) <= 1 && Math.abs(this.projection.y) <= 1;
      label.style.display = inView ? "block" : "none";
      if (inView) {
        label.style.left = `${(this.projection.x + 1) * this.host.clientWidth / 2}px`;
        label.style.top = `${(1 - this.projection.y) * this.host.clientHeight / 2}px`;
      }
    }
  }
  dispose(): void {
    for (const { roof, label } of this.entries.values()) {
      label.remove();
      roof.geometry.dispose();
      (roof.material as MeshStandardMaterial).dispose();
    }
    this.root.removeFromParent();
    this.entries.clear();
  }
}
