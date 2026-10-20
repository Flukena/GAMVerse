import {
  CAMPUS_WORLD,
  campusWorldFromConfig,
  makeBlockerGrid,
  roomPropCollisionClearanceRadius,
  roomPropCollisionFootprint,
  type RoomLayout,
  type WorldConfig,
} from "@gammyverse/shared";
import { realtimeRuntimeMetrics } from "../infra/realtimeRuntimeMetrics.js";
import { propDefinitionByAsset } from "./roomSeatIndex.js";

type VehiclePose = { x: number; z: number; rotation: number };
type VehicleBlocker = Parameters<typeof makeBlockerGrid>[0][number];

/**
 * Caches map collision once per accepted revision and keeps movable/parked
 * vehicle collision in a separate spatial grid. Dynamic refreshes inspect only
 * catalogued vehicle props; they never normalize or rebuild the full map.
 */
export class VehicleCollisionIndex {
  private mapRevision = -1;
  private staticWorld: WorldConfig = CAMPUS_WORLD;
  private vehicleProps: RoomLayout["props"] = [];
  private poses = new Map<string, VehiclePose>();
  private world: WorldConfig = CAMPUS_WORLD;

  vehicleIdForProp(propId: string): string | undefined {
    const prop = this.vehicleProps.find((item) => item.id === propId);
    return prop && propDefinitionByAsset.get(prop.asset)?.vehicleId;
  }

  update(
    config: unknown,
    layout: RoomLayout,
    mapRevision: number,
    poseOverrides: ReadonlyMap<string, VehiclePose>,
  ): WorldConfig {
    if (this.mapRevision !== mapRevision) this.replaceMap(config, layout, mapRevision);
    if (this.updateDynamicVehicles(poseOverrides)) {
      this.world = {
        ...this.staticWorld,
        dynamicCollisionGrid: makeBlockerGrid(this.vehicleBlockers()),
      };
      realtimeRuntimeMetrics.increment("vehicleCollisionUpdates");
    }
    return this.world;
  }

  private replaceMap(config: unknown, layout: RoomLayout, mapRevision: number) {
    this.mapRevision = mapRevision;
    this.vehicleProps = layout.props.filter((prop) => Boolean(propDefinitionByAsset.get(prop.asset)?.vehicleId));
    const vehicleIds = new Set(this.vehicleProps.map((prop) => prop.id));
    // This is the sole full-world build for a map revision. Vehicle props are
    // omitted from the static layer and represented by the dynamic index.
    realtimeRuntimeMetrics.increment("mapParses");
    realtimeRuntimeMetrics.increment("vehicleWorldRebuilds");
    this.staticWorld = campusWorldFromConfig(config, vehicleIds);
    this.poses.clear();
    this.world = this.staticWorld;
  }

  private updateDynamicVehicles(overrides: ReadonlyMap<string, VehiclePose>) {
    let changed = false;
    const next = new Map<string, VehiclePose>();
    for (const prop of this.vehicleProps) {
      if (!prop.collision || prop.elevation) continue;
      const pose = overrides.get(prop.id) ?? { x: prop.x, z: prop.z, rotation: prop.rotation };
      next.set(prop.id, pose);
      const previous = this.poses.get(prop.id);
      if (!previous || previous.x !== pose.x || previous.z !== pose.z || previous.rotation !== pose.rotation) changed = true;
    }
    if (next.size !== this.poses.size) changed = true;
    if (!changed) return false;
    this.poses = next;
    return true;
  }

  private vehicleBlockers(): VehicleBlocker[] {
    const blockers: VehicleBlocker[] = [];
    for (const prop of this.vehicleProps) {
      const pose = this.poses.get(prop.id);
      if (!pose || !prop.collision || prop.elevation) continue;
      const footprint = roomPropCollisionFootprint({ ...prop, ...pose });
      const playerClearanceRadius = roomPropCollisionClearanceRadius(prop);
      blockers.push({
        x: pose.x,
        z: pose.z,
        width: footprint.width,
        depth: footprint.depth,
        ...(playerClearanceRadius !== CAMPUS_WORLD.playerRadius ? { playerClearanceRadius } : {}),
        vehiclePropId: prop.id,
      });
    }
    return blockers;
  }
}
