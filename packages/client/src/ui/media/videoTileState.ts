interface VideoTileIdentity {
  key: string;
  track: unknown;
}

/** Generic media refreshes and microphone publications leave the viewer alone. */
export function publishedVideoTile<T extends VideoTileIdentity>(tiles: readonly T[], publishedVideoTrack?: unknown): T | undefined {
  if (!publishedVideoTrack) return undefined;
  return tiles.find(tile => tile.track === publishedVideoTrack);
}
