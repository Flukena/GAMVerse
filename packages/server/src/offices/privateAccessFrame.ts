import type { PlayerState, RoomLayoutZone } from "@gammyverse/shared";
import type { SessionSecurity } from "./sessionSecurity.js";
import type { PrivateAccessFrame, PrivatePerson } from "./privateZoneAccess.js";
export function privateAccessFrame(zones: RoomLayoutZone[], players: ReadonlyMap<string, PlayerState>, security: SessionSecurity, mediaZones: ReadonlyMap<string, RoomLayoutZone>): PrivateAccessFrame {
  const people = new Map<string, PrivatePerson>();
  for (const [sessionId, player] of players)
    people.set(sessionId, { sessionId, username: player.username, displayName: player.displayName || player.username, online: player.presence === "online", active: !security.isRevoked(sessionId) && security.activeSession(player.username) === sessionId, sessionToken: security.token(sessionId) });
  return { zones, people, zoneBySession: new Map([...mediaZones].map(([id, zone]) => [id, zone.id])) };
}
