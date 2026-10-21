import { USER_STATUS_PRESENTATIONS } from "../presencePresentation";
import type { RoomLayout, RoomLayoutZone, RoomLayoutWall } from "@gammyverse/shared";

export type ZonePosition = { x: number; z: number };
export type ZoneOccupant = ZonePosition & { displayName: string; username: string; status?: string };

export function isInsideZone(position: ZonePosition, zone: RoomLayoutZone): boolean {
  return Math.abs(position.x - zone.x) <= zone.width / 2 && Math.abs(position.z - zone.z) <= zone.depth / 2;
}

export function coveredZones(zones: readonly RoomLayoutZone[], local: ZonePosition | undefined, editing = false): RoomLayoutZone[] {
  return editing ? [] : zones.filter(zone => !local || !isInsideZone(local, zone));
}

export function isCoveredPosition(position: ZonePosition, zones: readonly RoomLayoutZone[]): boolean {
  return zones.some(zone => isInsideZone(position, zone));
}

export function zoneOccupantRows(zone: RoomLayoutZone, players: Iterable<ZoneOccupant>): { name: string; color: string; statusLabel: string }[] {
  return [...players].filter(player => isInsideZone(player, zone)).map(player => {
    const presentation = Object.entries(USER_STATUS_PRESENTATIONS).find(([status]) => status === player.status)?.[1] ?? USER_STATUS_PRESENTATIONS.available;
    return { name: player.displayName.trim() || player.username, color: presentation.color, statusLabel: presentation.label };
  });
}

/** Keeps the expensive 2D static bitmap stable while players walk within a zone. */
export class ZoneVisibleLayout {
  private source: RoomLayout | null | undefined;
  private coveredKey = "";
  private layout: RoomLayout | null = null;
  update(source: RoomLayout | null, covered: readonly RoomLayoutZone[]): RoomLayout | null {
    const key = JSON.stringify(covered.map(zone => zone.id));
    if (this.source !== source || this.coveredKey !== key) {
      this.source = source;
      this.coveredKey = key;
      this.layout = source && covered.length ? { ...source, props: source.props.filter(prop => !isCoveredPosition(prop, covered)) } : source;
    }
    return this.layout;
  }
}

export const DEFAULT_ZONE_ROOF_HEIGHT_M = 2.5;
export function zoneRoofHeightM(zone: RoomLayoutZone, walls: readonly RoomLayoutWall[]): number {
  const heights = walls.filter(wall => isInsideZone(wall, zone)).map(wall => wall.height);
  return heights.length ? Math.max(...heights) : DEFAULT_ZONE_ROOF_HEIGHT_M;
}

export function zoneRoofColor(zone: RoomLayoutZone, walls: readonly RoomLayoutWall[]): string {
  return walls.find(wall => isInsideZone(wall, zone))?.color ?? "#63bbd0";
}
