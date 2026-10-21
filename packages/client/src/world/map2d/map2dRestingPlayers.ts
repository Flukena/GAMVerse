import { isRoomPropBed, parseRoomPropSeatReference, roomPropSeatAnchors, type RoomLayoutProp } from "@gammyverse/shared";
import type { Map2dPlayer } from "./map2dAvatarVisual";

/** Resting players keep their authoritative standing position beside the furniture. */
export function map2dRestingPlayers(players: ReadonlyMap<string, Map2dPlayer>, props: readonly RoomLayoutProp[]): ReadonlyMap<string, Map2dPlayer> {
  let rendered: Map<string, Map2dPlayer> | undefined;
  for (const [id, player] of players) {
    const reference = player.sittingPropId ? parseRoomPropSeatReference(player.sittingPropId) : undefined;
    if (!reference) continue;
    const prop = props.find(prop => prop.id === reference.propId);
    if (!prop || !isRoomPropBed(prop.asset)) continue;
    const anchor = roomPropSeatAnchors(prop).find(anchor => anchor.index === reference.seatIndex);
    if (!anchor) continue;
    rendered ??= new Map(players);
    rendered.set(id, { ...player, x: anchor.x, z: anchor.z, rotation: anchor.rotation });
  }
  return rendered ?? players;
}
