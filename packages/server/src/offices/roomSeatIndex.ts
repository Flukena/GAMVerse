import { realtimeRuntimeMetrics } from "../infra/realtimeRuntimeMetrics.js";
import { ROOM_PROP_CATALOG, parseRoomPropSeatReference, roomPropSeatAnchors, roomPropSeatReference, type RoomLayoutProp } from "@gammyverse/shared";

const SEAT_BUCKET_SIZE_M = 8;
const SEAT_EDGE_HALF_WIDTH_M = 0.45;

// Keep the first definition, matching Array.find even if a pack repeats an asset.
export const propDefinitionByAsset = new Map<string, (typeof ROOM_PROP_CATALOG)[number]>();
for (const definition of ROOM_PROP_CATALOG) {
  if (!propDefinitionByAsset.has(definition.asset)) propDefinitionByAsset.set(definition.asset, definition);
}

type IndexedSeat = {
  prop: RoomLayoutProp; seatId: string; seatIndex: number; order: number;
  cos: number; sin: number; anchorAlong: number;
};

/** Immutable per-map seat metadata. Bucket insertion covers each seat's entire
 * edge footprint, including rotated/deep benches, rather than just its center. */
export class RoomSeatIndex {
  private buckets = new Map<string, IndexedSeat[]>();
  private seats = new Map<string, IndexedSeat>();

  constructor(props: readonly RoomLayoutProp[]) {
    for (const prop of props) {
      const definition = propDefinitionByAsset.get(prop.asset);
      if (definition?.interaction !== "sit") continue;
      const cos = Math.cos(prop.rotation), sin = Math.sin(prop.rotation);
      for (const anchor of roomPropSeatAnchors(prop, definition)) {
        const anchorAlong = prop.width >= prop.depth ? anchor.localX : anchor.localZ;
        const seat: IndexedSeat = { prop, seatId: roomPropSeatReference(prop.id, anchor.index), seatIndex: anchor.index, order: this.seats.size, cos, sin, anchorAlong };
        this.seats.set(seat.seatId, seat);
        const halfAcross = Math.min(prop.width, prop.depth) / 2;
        const halfX = prop.width >= prop.depth ? SEAT_EDGE_HALF_WIDTH_M : halfAcross;
        const halfZ = prop.width >= prop.depth ? halfAcross : SEAT_EDGE_HALF_WIDTH_M;
        // Invert the original edge-distance transform; keep its rotation semantics.
        const centerX = prop.x + cos * anchor.localX - sin * anchor.localZ;
        const centerZ = prop.z + sin * anchor.localX + cos * anchor.localZ;
        const extentX = Math.abs(cos) * halfX + Math.abs(sin) * halfZ;
        const extentZ = Math.abs(sin) * halfX + Math.abs(cos) * halfZ;
        for (let x = Math.floor((centerX - extentX) / SEAT_BUCKET_SIZE_M); x <= Math.floor((centerX + extentX) / SEAT_BUCKET_SIZE_M); x++) {
          for (let z = Math.floor((centerZ - extentZ) / SEAT_BUCKET_SIZE_M); z <= Math.floor((centerZ + extentZ) / SEAT_BUCKET_SIZE_M); z++) {
            const key = `${x},${z}`;
            const bucket = this.buckets.get(key) ?? [];
            bucket.push(seat); this.buckets.set(key, bucket);
          }
        }
      }
    }
  }

  has(reference: string) {
    const seat = parseRoomPropSeatReference(reference);
    return this.seats.has(roomPropSeatReference(seat.propId, seat.seatIndex));
  }

  nearest(position: { x: number; z: number }, radiusM: number, occupied: ReadonlySet<string>) {
    const candidates = new Set<IndexedSeat>();
    for (let x = Math.floor((position.x - radiusM) / SEAT_BUCKET_SIZE_M); x <= Math.floor((position.x + radiusM) / SEAT_BUCKET_SIZE_M); x++) {
      for (let z = Math.floor((position.z - radiusM) / SEAT_BUCKET_SIZE_M); z <= Math.floor((position.z + radiusM) / SEAT_BUCKET_SIZE_M); z++) {
        for (const seat of this.buckets.get(`${x},${z}`) ?? []) candidates.add(seat);
      }
    }
    realtimeRuntimeMetrics.increment("seatCandidates", candidates.size);
    let best: (IndexedSeat & { distanceFromEdge: number }) | undefined;
    for (const seat of candidates) {
      if (occupied.has(seat.seatId)) continue;
      const { prop, cos, sin } = seat;
      const dx = position.x - prop.x, dz = position.z - prop.z;
      const localX = dx * cos + dz * sin, localZ = -dx * sin + dz * cos;
      const along = prop.width >= prop.depth ? localX : localZ;
      const across = prop.width >= prop.depth ? localZ : localX;
      const distanceFromEdge = Math.hypot(Math.max(0, Math.abs(along - seat.anchorAlong) - SEAT_EDGE_HALF_WIDTH_M), Math.max(0, Math.abs(across) - Math.min(prop.width, prop.depth) / 2));
      if (distanceFromEdge <= radiusM && (!best || distanceFromEdge < best.distanceFromEdge || distanceFromEdge === best.distanceFromEdge && seat.order < best.order)) best = { ...seat, distanceFromEdge };
    }
    return best;
  }
}
