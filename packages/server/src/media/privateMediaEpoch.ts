import { PRIVATE_MEDIA_RETRY_INTERVAL_MS } from "@gammyverse/shared";
import { randomBytes } from "node:crypto";
import { deleteSpatialMediaRoom } from "./service.js";
import { zoneEpochKey, type ZoneEpochKey, type ZoneMediaDescriptor } from "./zoneMediaDescriptor.js";
export type { ZoneEpochKey, ZoneMediaDescriptor } from "./zoneMediaDescriptor.js";
export { zoneMediaReady } from "./zoneMediaDescriptor.js";
const EPOCH_RANDOM_BYTES_COUNT = 12;
const MAX_DELETE_ATTEMPTS_COUNT = 2;
const RETRY_UNAVAILABLE_LABEL = "Zone media retry is unavailable or too soon.";
type EpochEntry = {
  descriptor: ZoneMediaDescriptor;
  readyRoomName: string | null;
  inFlight: Promise<ZoneMediaDescriptor> | null;
  failedAtMs: number | null;
  closed: boolean;
};
type EpochDependencies = {
  removeRoom(roomName: string): Promise<void>;
  nowMs(): number;
  epoch(): string;
};
export type ZoneMediaTransition = {
  descriptor: ZoneMediaDescriptor;
  settled: Promise<ZoneMediaDescriptor>;
};
export class PrivateMediaEpochs {
  private readonly entries = new Map<string, EpochEntry>();
  private readonly dependencies: EpochDependencies;
  constructor(dependencies: Partial<EpochDependencies> = {}) {
    this.dependencies = {
      removeRoom: deleteSpatialMediaRoom,
      nowMs: Date.now,
      epoch: () => randomBytes(EPOCH_RANDOM_BYTES_COUNT).toString("hex"),
      ...dependencies,
    };
  }
  private descriptor(key: ZoneEpochKey, generation: number, state: ZoneMediaDescriptor["state"]): ZoneMediaDescriptor {
    const epoch = this.dependencies.epoch();
    return Object.freeze({ ...key, generation, epoch, roomName: `zone-${epoch}`, available: state === "ready", state });
  }
  private entry(key: ZoneEpochKey): EpochEntry {
    const id = zoneEpochKey(key);
    let entry = this.entries.get(id);
    if (!entry) {
      const descriptor = this.descriptor(key, 0, "ready");
      entry = { descriptor, readyRoomName: descriptor.roomName, inFlight: null, failedAtMs: null, closed: false };
      this.entries.set(id, entry);
    }
    return entry;
  }
  current(key: ZoneEpochKey): ZoneMediaDescriptor {
    return this.entry(key).descriptor;
  }
  invalidate(key: ZoneEpochKey): ZoneMediaTransition {
    const entry = this.entry(key);
    if (entry.closed) return { descriptor: entry.descriptor, settled: Promise.resolve(entry.descriptor) };
    const state = entry.failedAtMs !== null && !entry.inFlight ? "unavailable" : "rotating";
    entry.descriptor = this.descriptor(key, entry.descriptor.generation + 1, state);
    if (state === "unavailable") return { descriptor: entry.descriptor, settled: Promise.resolve(entry.descriptor) };
    return this.transition(entry);
  }
  retry(key: ZoneEpochKey, expectedGeneration: number): ZoneMediaTransition {
    const entry = this.entry(key);
    if (entry.closed || entry.descriptor.state !== "unavailable" || entry.descriptor.generation !== expectedGeneration
      || entry.failedAtMs === null || this.dependencies.nowMs() - entry.failedAtMs < PRIVATE_MEDIA_RETRY_INTERVAL_MS) throw new Error(RETRY_UNAVAILABLE_LABEL);
    entry.descriptor = Object.freeze({ ...entry.descriptor, state: "rotating", available: false });
    return this.transition(entry);
  }
  private transition(entry: EpochEntry): ZoneMediaTransition {
    entry.inFlight ??= this.rotate(entry).finally(() => {
      entry.inFlight = null;
    });
    return { descriptor: entry.descriptor, settled: entry.inFlight };
  }
  private async removeRoom(roomName: string | null) {
    if (!roomName) return true;
    for (let attempt = 0; attempt < MAX_DELETE_ATTEMPTS_COUNT; attempt += 1) {
      const removed = await this.dependencies.removeRoom(roomName).then(() => true, () => false);
      if (removed) return true;
    }
    return false;
  }
  private async rotate(entry: EpochEntry): Promise<ZoneMediaDescriptor> {
    const removed = await this.removeRoom(entry.readyRoomName);
    if (!removed) {
      entry.failedAtMs = this.dependencies.nowMs();
      entry.descriptor = Object.freeze({ ...entry.descriptor, available: false, state: "unavailable" });
      return entry.descriptor;
    }
    entry.readyRoomName = null;
    entry.failedAtMs = null;
    if (entry.closed) return entry.descriptor;
    entry.descriptor = Object.freeze({ ...entry.descriptor, available: true, state: "ready" });
    entry.readyRoomName = entry.descriptor.roomName;
    return entry.descriptor;
  }
  async close(key: ZoneEpochKey) {
    const entry = this.entry(key);
    if (!entry.closed) {
      entry.closed = true;
      entry.descriptor = this.descriptor(key, entry.descriptor.generation + 1, "unavailable");
    }
    await this.transition(entry).settled;
  }
}
