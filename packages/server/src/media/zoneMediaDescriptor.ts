export type ZoneEpochKey = {
  officeId: string;
  roomIncarnationId: string;
  zoneId: string;
  kind: "meeting" | "private";
};
export type ZoneMediaDescriptor = Readonly<ZoneEpochKey & {
  generation: number;
  epoch: string;
  roomName: string;
  available: boolean;
  state: "ready" | "rotating" | "unavailable";
}>;
const EPOCH_HEX_PATTERN = /^[a-f0-9]{24}$/;
const ROOM_PREFIX_LABEL = "zone-";
export function zoneEpochKey(key: ZoneEpochKey) {
  return JSON.stringify([key.officeId, key.roomIncarnationId, key.zoneId, key.kind]);
}
export function zoneMediaReady(descriptor: ZoneMediaDescriptor) {
  return descriptor.available && descriptor.state === "ready" && Number.isSafeInteger(descriptor.generation) && descriptor.generation >= 0
    && EPOCH_HEX_PATTERN.test(descriptor.epoch) && descriptor.roomName === `${ROOM_PREFIX_LABEL}${descriptor.epoch}`;
}
