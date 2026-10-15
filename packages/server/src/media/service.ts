import { zoneMediaReady, type ZoneMediaDescriptor } from "./zoneMediaDescriptor.js";
import type { ConversationTokenMode } from "@gammyverse/shared";
import { createHash } from "node:crypto";
import { AccessToken, RoomServiceClient, TrackSource, ServerError } from "livekit-server-sdk";

function liveKitConfig() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) throw new Error("LiveKit is not configured.");
  return { url, apiKey, apiSecret };
}

export const ZONE_MEDIA_REQUEST_TIMEOUT_SECONDS = 2;
let roomService: RoomServiceClient | undefined;
let zoneRoomService: RoomServiceClient | undefined;
function createRoomService(requestTimeoutSeconds?: number) {
  const { apiKey, apiSecret } = liveKitConfig();
  const host = process.env.LIVEKIT_INTERNAL_URL ?? "http://livekit:7880";
  return new RoomServiceClient(host, apiKey, apiSecret, requestTimeoutSeconds === undefined ? undefined : { requestTimeout: requestTimeoutSeconds, failover: false });
}
function getRoomService() {
  roomService ??= createRoomService();
  return roomService;
}
function getZoneRoomService() {
  zoneRoomService ??= createRoomService(ZONE_MEDIA_REQUEST_TIMEOUT_SECONDS);
  return zoneRoomService;
}

export function liveKitIdentity(username: string, sessionToken: string) {
  const suffix = createHash("sha256").update(sessionToken).digest("hex").slice(0, 16);
  return `${username}-${suffix}`;
}

export function meetingRoomName(officeId: string, meetingId: string) {
  return `office-${officeId}-meeting-${meetingId}`;
}

export function proximityRoomName(officeId: string, groupId: string) {
  if (!/^[a-f0-9]{24}$/.test(groupId)) throw new Error("Invalid proximity group.");
  return `office-${officeId}-proximity-${groupId}`;
}

export function privateVoiceRoomName(officeId: string, zoneId: string) {
  // Office map zones can use stable readable IDs (for example
  // "team-3-office-12") as well as legacy UUIDs.
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/i.test(zoneId)) throw new Error("Invalid private room.");
  return `office-${officeId}-private-${zoneId}`;
}

const MEETING_TOKEN_TTL_SECONDS = 300;
const SPATIAL_TOKEN_TTL_SECONDS = 60;
async function createSpatialMediaToken(username: string, identity: string, roomName: string, ttlSeconds: number, mode: ConversationTokenMode) {
  const { url, apiKey, apiSecret } = liveKitConfig();
  const token = new AccessToken(apiKey, apiSecret, { identity, name: username, ttl: ttlSeconds });
  const publish = mode === "join";
  token.addGrant({ roomJoin: true, room: roomName, canPublish: publish,
    canPublishSources: publish ? [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE] : [],
    canSubscribe: true, canPublishData: false });
  return { url, roomName, token: await token.toJwt() };
}
const ZONE_MEDIA_NOT_READY_LABEL = "Zone media is not ready.";
function assertReadyZone(descriptor: ZoneMediaDescriptor, kind: ZoneMediaDescriptor["kind"]) {
  if (descriptor.kind !== kind || !zoneMediaReady(descriptor)) throw new Error(ZONE_MEDIA_NOT_READY_LABEL);
}
export async function createMeetingAudioToken(username: string, identity: string, descriptor: ZoneMediaDescriptor, mode: ConversationTokenMode = "join") {
  assertReadyZone(descriptor, "meeting");
  return createSpatialMediaToken(username, identity, descriptor.roomName, MEETING_TOKEN_TTL_SECONDS, mode);
}

export async function revokeMeetingParticipant(officeId: string, meetingId: string, identity: string) {
  await getRoomService().removeParticipant(meetingRoomName(officeId, meetingId), identity, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) });
}

export async function createPrivateVoiceToken(username: string, identity: string, descriptor: ZoneMediaDescriptor, mode: ConversationTokenMode = "join") {
  assertReadyZone(descriptor, "private");
  return createSpatialMediaToken(username, identity, descriptor.roomName, SPATIAL_TOKEN_TTL_SECONDS, mode);
}
export async function deleteSpatialMediaRoom(roomName: string, service: Pick<RoomServiceClient, "deleteRoom"> = getZoneRoomService()) {
  try { await service.deleteRoom(roomName); }
  catch (error) { if (!(error instanceof ServerError) || error.code !== "not_found") throw error; }
}

export async function revokePrivateVoiceParticipant(officeId: string, zoneId: string, identity: string) {
  await getRoomService().removeParticipant(privateVoiceRoomName(officeId, zoneId), identity, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) });
}

export async function createProximityAudioToken(username: string, identity: string, officeId: string, groupId: string, mode: ConversationTokenMode = "join") {
  return createSpatialMediaToken(username, identity, proximityRoomName(officeId, groupId), SPATIAL_TOKEN_TTL_SECONDS, mode);
}

export async function revokeProximityParticipants(officeId: string, groupId: string, identities: string[]) {
  if (identities.length === 0) return;
  const roomName = proximityRoomName(officeId, groupId);
  const service = getRoomService();
  const rooms = await service.listRooms([roomName]);
  if (rooms.length === 0) return;
  const participants = await service.listParticipants(roomName);
  const activeIdentities = new Set(participants.map((participant) => participant.identity));
  const revokeTokenTs = BigInt(Math.floor(Date.now() / 1000));
  await Promise.all(identities.filter((identity) => activeIdentities.has(identity)).map((identity) =>
    service.removeParticipant(roomName, identity, { revokeTokenTs }),
  ));
}

const SPOTLIGHT_TOKEN_TTL_SECONDS = 60;
const TOKEN_TIMESTAMP_DIVISOR_MS = 1000;
export async function createSpotlightToken(username: string, identity: string, roomName: string, publish: boolean) {
  const { url, apiKey, apiSecret } = liveKitConfig();
  const token = new AccessToken(apiKey, apiSecret, { identity, name: username, ttl: SPOTLIGHT_TOKEN_TTL_SECONDS });
  token.addGrant({roomJoin:true, room:roomName, canPublish:publish, canPublishSources:publish ? [TrackSource.MICROPHONE,TrackSource.CAMERA] : [], canSubscribe:true, canPublishData:false});
  return {url,roomName,token:await token.toJwt()};
}
export async function revokeSpotlightParticipant(roomName: string, identity: string, service: Pick<RoomServiceClient, "removeParticipant"> = getRoomService()) {
  try { await service.removeParticipant(roomName, identity, {revokeTokenTs:BigInt(Math.floor(Date.now()/TOKEN_TIMESTAMP_DIVISOR_MS))}); }
  catch (error) {
    if (!(error instanceof ServerError) || error.code !== "not_found") throw error;
  }
}
export function voiceRoomNameForModeration(officeId: string, kind: "meeting" | "private" | "proximity", id: string) {
  if (kind === "meeting") return meetingRoomName(officeId, id);
  if (kind === "private") return privateVoiceRoomName(officeId, id);
  return proximityRoomName(officeId, id);
}

export async function muteVoiceParticipantTracks(roomName: string, identities: string[], source: "microphone" | "camera" | "screen_share") {
  if (identities.length === 0) return 0;
  const sourceValue = source === "microphone" ? TrackSource.MICROPHONE : source === "camera" ? TrackSource.CAMERA : TrackSource.SCREEN_SHARE;
  const service = getRoomService();
  const rooms = await service.listRooms([roomName]);
  if (rooms.length === 0) return 0;
  const identitySet = new Set(identities);
  const participants = (await service.listParticipants(roomName)).filter((participant) => identitySet.has(participant.identity));
  let mutedCount = 0;
  for (const participant of participants) {
    const tracks = participant.tracks.filter((track) => track.source === sourceValue && !track.muted);
    for (const track of tracks) {
      await service.mutePublishedTrack(roomName, participant.identity, track.sid, true);
      mutedCount += 1;
    }
  }
  return mutedCount;
}
