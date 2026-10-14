import type { SessionSecurity } from "./sessionSecurity.js";

type PeerSessionAccess = Pick<SessionSecurity, "activeSession" | "isRevoked">;

export function disposedRoomSpotlightUsernames(usernames: Iterable<string>, peers: Iterable<PeerSessionAccess>, presenters?: readonly string[]) {
  const peerSessions = [...peers];
  return [...new Set(usernames)].filter(username => (presenters === undefined || presenters.includes(username)) && !peerSessions.some(peer => {
    const sessionId = peer.activeSession(username);
    return sessionId !== undefined && !peer.isRevoked(sessionId);
  }));
}
