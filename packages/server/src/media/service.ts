import { createHash } from "node:crypto";
import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";

function liveKitConfig() {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) throw new Error("LiveKit is not configured.");
  return { url, apiKey, apiSecret };
}

let roomService: RoomServiceClient | undefined;
function getRoomService() {
  const { apiKey, apiSecret } = liveKitConfig();
  const host = process.env.LIVEKIT_INTERNAL_URL ?? "http://livekit:7880";
  roomService ??= new RoomServiceClient(host, apiKey, apiSecret);
  return roomService;
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

export async function createMeetingAudioToken(username: string, identity: string, officeId: string, meetingId: string) {
  const { url, apiKey, apiSecret } = liveKitConfig();
  const roomName = meetingRoomName(officeId, meetingId);
  const token = new AccessToken(apiKey, apiSecret, { identity, name: username, ttl: "5m" });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE],
    canSubscribe: true,
    canPublishData: false,
  });
  return { url, roomName, token: await token.toJwt() };
}

export async function revokeMeetingParticipant(officeId: string, meetingId: string, identity: string) {
  await getRoomService().removeParticipant(meetingRoomName(officeId, meetingId), identity, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) });
}

export async function createPrivateVoiceToken(username: string, identity: string, officeId: string, zoneId: string) {
  const { url, apiKey, apiSecret } = liveKitConfig();
  const roomName = privateVoiceRoomName(officeId, zoneId);
  const token = new AccessToken(apiKey, apiSecret, { identity, name: username, ttl: "1m" });
  token.addGrant({ roomJoin: true, room: roomName, canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE], canSubscribe: true, canPublishData: false });
  return { url, roomName, token: await token.toJwt() };
}

export async function revokePrivateVoiceParticipant(officeId: string, zoneId: string, identity: string) {
  await getRoomService().removeParticipant(privateVoiceRoomName(officeId, zoneId), identity, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) });
}

export async function createProximityAudioToken(username: string, identity: string, officeId: string, groupId: string) {
  const { url, apiKey, apiSecret } = liveKitConfig();
  const roomName = proximityRoomName(officeId, groupId);
  const token = new AccessToken(apiKey, apiSecret, { identity, name: username, ttl: "1m" });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE],
    canSubscribe: true,
    canPublishData: false,
  });
  return { url, roomName, token: await token.toJwt() };
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
