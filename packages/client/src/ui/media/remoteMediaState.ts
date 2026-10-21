import type { RemoteTrack, Room } from "livekit-client";
import { voiceParticipantUsername } from "./mediaIdentity";

export type RemoteMediaSource = "camera" | "screen_share";
export type RemoteMediaTile = { key: string; identity: string; username: string; name: string; source: RemoteMediaSource; track: RemoteTrack };
export type RemoteMediaSnapshot = { tiles: readonly RemoteMediaTile[]; selected: RemoteMediaTile | null; minimized: boolean };

export function remoteMediaTiles(room: Room): RemoteMediaTile[] {
  if (room.state !== "connected") return [];
  const tiles: RemoteMediaTile[] = [];
  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.videoTrackPublications.values()) {
      const track = publication.track;
      const { source } = publication;
      if (!track || track.kind !== "video" || !publication.isSubscribed || publication.isMuted || (source !== "camera" && source !== "screen_share")) continue;
      const username = voiceParticipantUsername(participant);
      tiles.push({ key: `${participant.identity}:${publication.trackSid}`, identity: participant.identity, username, name: participant.name?.trim() || username, source, track });
    }
  }
  return tiles.sort((a, b) => Number(b.source === "screen_share") - Number(a.source === "screen_share"));
}

/** The session owns subscriptions; this only selects already-subscribed remote video. */
export class RemoteMediaViewerState {
  snapshot: RemoteMediaSnapshot = { tiles: [], selected: null, minimized: false };
  private room: Room | null = null;

  setRoom(room: Room | null): void {
    this.room = room;
    this.snapshot = { tiles: [], selected: null, minimized: false };
  }
  refresh(room: Room): boolean {
    if (room !== this.room) return false;
    const tiles = remoteMediaTiles(room);
    const previous = this.snapshot.selected;
    const previousSelected = previous && tiles.find(tile => tile.key === previous.key);
    const screenShare = tiles.find(tile => tile.source === "screen_share");
    const selected = screenShare && previousSelected?.source !== "screen_share" ? screenShare : previousSelected ?? tiles[0] ?? null;
    const minimized = selected?.source === "screen_share" && previousSelected?.source !== "screen_share" || tiles.length > 0 && this.snapshot.minimized;
    this.snapshot = { tiles, selected, minimized };
    return true;
  }
  open(key: string): void {
    const selected = this.snapshot.tiles.find(tile => tile.key === key);
    if (!selected) return;
    this.snapshot = { ...this.snapshot, selected };
  }
  toggleSize(): void {
    if (!this.snapshot.selected) return;
    this.snapshot = { ...this.snapshot, minimized: !this.snapshot.minimized };
  }
}

export function screenCameraTile(tiles: readonly RemoteMediaTile[], selected: RemoteMediaTile | null): RemoteMediaTile | undefined {
  if (selected?.source !== "screen_share") return undefined;
  return tiles.find(tile => tile.source === "camera" && tile.identity === selected.identity);
}
