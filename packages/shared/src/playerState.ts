import { schema, t } from "@colyseus/schema";

export type MediaActivity = { microphone: boolean; camera: boolean; screenShare: boolean };

export const PLAYER_SPATIAL_VIEW_TAG = 1;

export function isValidMediaActivity(value: unknown): value is MediaActivity {
  if (typeof value !== "object" || value === null) return false;
  const activity = value as Record<string, unknown>;
  return typeof activity.microphone === "boolean" && typeof activity.camera === "boolean" && typeof activity.screenShare === "boolean";
}

export const PlayerState = schema(
  {
    x: t.float32().view(PLAYER_SPATIAL_VIEW_TAG),
    z: t.float32().view(PLAYER_SPATIAL_VIEW_TAG),
    rotation: t.float32().view(PLAYER_SPATIAL_VIEW_TAG),
    worldVersion: t.uint8(),
    displayName: t.string(),
    username: t.string(),
    characterId: t.string(),
    petId: t.string(),
    vehicleId: t.string(),
    vehicleMode: t.string(),
    vehiclePropId: t.string(),
    vehiclePropX: t.float32().view(PLAYER_SPATIAL_VIEW_TAG),
    vehiclePropZ: t.float32().view(PLAYER_SPATIAL_VIEW_TAG),
    vehiclePropRotation: t.float32().view(PLAYER_SPATIAL_VIEW_TAG),
    sittingPropId: t.string(),
    dancing: t.boolean(),
    handRaised: t.boolean(),
    weaponId: t.string(),
    status: t.string(),
    presence: t.string(),
    microphoneEnabled: t.boolean(),
    cameraEnabled: t.boolean(),
    screenShareEnabled: t.boolean(),
    // Append schema fields so existing field indexes remain stable.
    isMaintainer: t.boolean().default(false),
    customStatusText: t.string(),
    customStatusEmoji: t.string(),
    customStatusExpiresAtMs: t.float64(),
    hasDetailedPosition: t.boolean().view(PLAYER_SPATIAL_VIEW_TAG),
    markerX: t.float32(),
    markerZ: t.float32(),
    markerRotation: t.float32(),
  },
  "PlayerState",
);

export const OfficeState = schema(
  {
    players: t.map(PlayerState),
    spotlightUsernames: t.map("boolean"),
    spotlightEpoch: t.string(),
  },
  "OfficeState",
);

export type PlayerState = InstanceType<typeof PlayerState>;
export type OfficeState = InstanceType<typeof OfficeState>;
