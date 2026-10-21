import { useRef, useState } from "react";
import type { Room } from "livekit-client";
import { RemoteMediaViewerState } from "./remoteMediaState";

export function useRemoteMediaViewer() {
  const state = useRef(new RemoteMediaViewerState()).current;
  const [snapshot, setSnapshot] = useState(state.snapshot);
  return {
    ...snapshot,
    availableTiles: state.availableTiles,
    roomChanged(room: Room | null) { state.setRoom(room); setSnapshot(state.snapshot); },
    participantsChanged(room: Room) { if (state.refresh(room)) setSnapshot({ ...state.snapshot }); },
    open(key: string) { state.open(key); setSnapshot({ ...state.snapshot }); },
    toggleSize() { state.toggleSize(); setSnapshot(state.snapshot); },
  };
}
