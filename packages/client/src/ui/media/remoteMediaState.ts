import type { RemoteTrack, RemoteTrackPublication, Room } from "livekit-client";
import { voiceParticipantUsername } from "./mediaIdentity";

export type RemoteMediaSource = "camera" | "screen_share";
export type RemoteMediaSelection = { key: string; identity: string; username: string; name: string; source: RemoteMediaSource; track?: RemoteTrack };
export type RemoteMediaTile = RemoteMediaSelection & { track: RemoteTrack };
type RemoteMediaChoice = RemoteMediaSelection & { publication: RemoteTrackPublication };
export type RemoteMediaSnapshot = { tiles: readonly RemoteMediaTile[]; selected: RemoteMediaSelection | null; minimized: boolean };

function remoteMediaChoices(room: Room): RemoteMediaChoice[] {
  if (room.state !== "connected") return [];
  const tiles: RemoteMediaChoice[] = [];
  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.videoTrackPublications.values()) {
      const { source } = publication;
      if (publication.isMuted || (source !== "camera" && source !== "screen_share")) continue;
      const username = voiceParticipantUsername(participant);
      tiles.push({ key: `${participant.identity}:${publication.trackSid}`, identity: participant.identity, username, name: participant.name?.trim() || username, source, track: publication.track, publication });
    }
  }
  return tiles.sort((a, b) => Number(b.source === "screen_share") - Number(a.source === "screen_share"));
}

export function remoteMediaTiles(room: Room): RemoteMediaTile[] {
  return remoteMediaChoices(room).flatMap(({ publication, track, ...tile }) =>
    track && track.kind === "video" && publication.isSubscribed ? [{ ...tile, track }] : []);
}

/** Selects video publications and keeps only the visible source subscribed. */
export class RemoteMediaViewerState {
  snapshot: RemoteMediaSnapshot = { tiles: [], selected: null, minimized: false };
  availableTiles: readonly RemoteMediaSelection[] = [];
  private room: Room | null = null;

  setRoom(room: Room | null): void {
    this.room = room;
    this.availableTiles = [];
    this.snapshot = { tiles: [], selected: null, minimized: false };
  }
  refresh(room: Room): boolean {
    if (room !== this.room) return false;
    const choices = remoteMediaChoices(room);
    this.availableTiles = choices.map(({ publication: _publication, ...tile }) => tile);
    const tiles = choices.flatMap(({ publication, track, ...tile }) =>
      track && track.kind === "video" && publication.isSubscribed ? [{ ...tile, track }] : []);
    const previous = this.snapshot.selected;
    const previousSelected = previous && this.availableTiles.find(tile => tile.key === previous.key);
    const screenShare = this.availableTiles.find(tile => tile.source === "screen_share");
    const selected = screenShare && previousSelected?.source !== "screen_share" ? screenShare : previousSelected ?? this.availableTiles[0] ?? null;
    const minimized = selected?.source === "screen_share" && previousSelected?.source !== "screen_share" || this.availableTiles.length > 0 && this.snapshot.minimized;
    this.snapshot = { tiles, selected, minimized };
    this.syncSubscriptions(choices, selected);
    return true;
  }
  open(key: string): void {
    const selected = this.availableTiles.find(tile => tile.key === key);
    if (!selected) return;
    this.snapshot = { ...this.snapshot, selected };
    if (this.room) this.syncSubscriptions(remoteMediaChoices(this.room), selected);
  }
  toggleSize(): void {
    if (!this.snapshot.selected) return;
    this.snapshot = { ...this.snapshot, minimized: !this.snapshot.minimized };
  }

  private syncSubscriptions(choices: readonly RemoteMediaChoice[], selected: RemoteMediaSelection | null): void {
    const keep = new Set<string>();
    if (selected) {
      keep.add(selected.key);
      if (selected.source === "screen_share") {
        const camera = choices.find(tile => tile.source === "camera" && tile.identity === selected.identity);
        if (camera) keep.add(camera.key);
      }
    }
    for (const participant of this.room?.remoteParticipants.values() ?? []) {
      for (const publication of participant.videoTrackPublications.values()) {
        const shouldSubscribe = keep.has(`${participant.identity}:${publication.trackSid}`) && !publication.isMuted;
        if (publication.isDesired !== shouldSubscribe) publication.setSubscribed(shouldSubscribe);
      }
    }
  }
}

export function screenCameraTile(tiles: readonly RemoteMediaTile[], selected: RemoteMediaSelection | null): RemoteMediaTile | undefined {
  if (selected?.source !== "screen_share") return undefined;
  return tiles.find(tile => tile.source === "camera" && tile.identity === selected.identity);
}
