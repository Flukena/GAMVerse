import type { ComponentProps } from "react";
import { VoiceParticipantRoster } from "./VoiceParticipantRoster";
import { RemoteMediaViewer } from "./RemoteMediaViewer";
import type { useRemoteMediaViewer } from "./useRemoteMediaViewer";

type Props = Omit<ComponentProps<typeof VoiceParticipantRoster>, "canViewMedia" | "onViewMedia"> & { viewer: ReturnType<typeof useRemoteMediaViewer> };
export function VoiceMediaWorkspace({ viewer, ...roster }: Props) {
  return <>
    <VoiceParticipantRoster {...roster}
      cameraTiles={viewer.tiles}
      canViewMedia={(username, source) => viewer.tiles.some(tile => tile.username === username.toLocaleLowerCase() && tile.source === source)}
      onViewMedia={(username, source) => { const tile = viewer.tiles.find(tile => tile.username === username.toLocaleLowerCase() && tile.source === source); if (tile) viewer.open(tile.key); }} />
    <RemoteMediaViewer tiles={viewer.tiles} selected={viewer.selected} minimized={viewer.minimized} onToggleSize={viewer.toggleSize} onSelect={viewer.open} />
  </>;
}
