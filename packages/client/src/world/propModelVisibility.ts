import type { Object3D } from "three";
import type { RoomLayoutZone } from "@gammyverse/shared";
import { PROP_MODEL_LOAD_BATCH_SIZE, PROP_RENDER_CULL_INTERVAL_MS, shouldLoadPropModel, shouldRenderDistanceCulledProp } from "./propDistanceCulling";
import type { RoadsideSceneryVisibility } from "./roadsideScenery";
import { isCoveredPosition, type ZonePosition } from "./zoneVisibility";
export type DeferredPropModel = { propId: string; position: ZonePosition; started: boolean; start: () => void };
export class PropModelVisibility {
  private nextLoadAtMs = 0;
  private nextCullAtMs = 0;
  private coveredKey = "";
  update(now: number, editing: boolean, local: ZonePosition | undefined, roomKey: string, focus: ZonePosition,
    roadsideScenery: RoadsideSceneryVisibility, deferredPropModelLoads: readonly DeferredPropModel[], distanceCulledPropVisuals: readonly Object3D[],
    covered: readonly RoomLayoutZone[], offset: ZonePosition): void {
    const key = JSON.stringify(covered.map(zone => zone.id));
    if (this.coveredKey !== key) { this.nextLoadAtMs = 0; this.nextCullAtMs = 0; this.coveredKey = key; }
    const hidden = (position: ZonePosition) => isCoveredPosition({ x: position.x - offset.x, z: position.z - offset.z }, covered);
    if (now >= this.nextLoadAtMs) {
      this.nextLoadAtMs = now + PROP_RENDER_CULL_INTERVAL_MS;
      roadsideScenery.update(local, roomKey, editing);
      let remainingLoads = editing ? PROP_MODEL_LOAD_BATCH_SIZE * 4 : PROP_MODEL_LOAD_BATCH_SIZE;
      if (editing) {
        for (const pending of deferredPropModelLoads) {
          if (remainingLoads === 0) break;
          if (pending.started) continue;
          pending.start();
          remainingLoads -= 1;
        }
      } else {
        // Prioritise the closest props, so the area at the centre of the
        // screen fills first rather than following the saved props' order.
        const closest: Array<{ pending: typeof deferredPropModelLoads[number]; distanceSquared: number }> = [];
        for (const pending of deferredPropModelLoads) {
          if (pending.started || hidden(pending.position) || !(roadsideScenery.visibilityFor(pending.propId) ?? shouldLoadPropModel(pending.position, focus))) continue;
          const dx = pending.position.x - focus.x;
          const dz = pending.position.z - focus.z;
          const candidate = { pending, distanceSquared: dx * dx + dz * dz };
          const insertAt = closest.findIndex((entry) => candidate.distanceSquared < entry.distanceSquared);
          if (insertAt === -1) {
            if (closest.length < remainingLoads) closest.push(candidate);
          } else {
            closest.splice(insertAt, 0, candidate);
            if (closest.length > remainingLoads) closest.pop();
          }
        }
        for (const candidate of closest) candidate.pending.start();
      }
    }
    if (now >= this.nextCullAtMs) {
      this.nextCullAtMs = now + PROP_RENDER_CULL_INTERVAL_MS;
      for (const visual of distanceCulledPropVisuals) {
        if (editing) {
          visual.visible = true;
          continue;
        }
        visual.visible = !hidden(visual.position) && (roadsideScenery.visibilityFor(visual.userData.officeMapPropId)
          ?? shouldRenderDistanceCulledProp(visual.position, focus, visual.visible));
      }
    }
  }
}
