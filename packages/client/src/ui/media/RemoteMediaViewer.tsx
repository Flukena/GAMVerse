import { useEffect, useRef } from "react";
import { screenCameraTile, type RemoteMediaSelection, type RemoteMediaSnapshot } from "./remoteMediaState";
import "./RemoteMediaViewer.css";

function ViewerSizeGlyph({ expanded }: { expanded: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{expanded ? <path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4M3 7l5-5m9 5-5-5M3 13l5 5m9-5-5 5"/> : <path d="M3 7V3h4m6 0h4v4M7 17H3v-4m14 0v4h-4"/>}</svg>;
}

function ScreenShareArrow({ direction }: { direction: "previous" | "next" }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={direction === "previous" ? "m12 4-6 6 6 6" : "m8 4 6 6-6 6"} /></svg>;
}

export function RemoteMediaViewer({ tiles, availableTiles = tiles, selected, minimized, onToggleSize, onSelect }: RemoteMediaSnapshot & { availableTiles?: readonly RemoteMediaSelection[]; onToggleSize(): void; onSelect(key: string): void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const track = selected?.track;
  const camera = screenCameraTile(tiles, selected);
  const cameraRef = useRef<HTMLVideoElement>(null);
  const cameraTrack = camera?.track;
  const screenShares = availableTiles.filter(tile => tile.source === "screen_share");
  const screenIndex = screenShares.findIndex(tile => tile.key === selected?.key);
  useEffect(() => {
    const video = videoRef.current;
    if (!track || !video) return;
    track.attach(video);
    return () => { track.detach(video); video.srcObject = null; };
  }, [track]);
  useEffect(() => {
    const video = cameraRef.current;
    if (!cameraTrack || !video) return;
    cameraTrack.attach(video);
    return () => { cameraTrack.detach(video); video.srcObject = null; };
  }, [cameraTrack]);
  if (!selected) return null;
  return <aside className={`remote-media-viewer${minimized ? " is-minimized" : ""}`} aria-label="Camera and screen viewer" onPointerDown={event => event.stopPropagation()}>
    <header>
      <strong>{selected.name} · {selected.source === "screen_share" ? "Screen" : "Camera"}</strong>
      <button type="button" title={minimized ? "Expand" : "Minimize"} aria-label={minimized ? "Expand media viewer" : "Minimize media viewer"} aria-expanded={!minimized} onClick={onToggleSize}><ViewerSizeGlyph expanded={minimized} /></button>
    </header>
    <div className="remote-media-stage">
      {track ? <video ref={videoRef} autoPlay muted playsInline controls aria-label={`${selected.name}'s ${selected.source === "screen_share" ? "screen share" : "camera"}`} /> : <div className="remote-media-loading" role="status">Connecting video…</div>}
      {screenIndex >= 0 && screenShares.length > 1 && <>
        <button type="button" className="remote-media-switcher previous" aria-label="Previous screen share" onClick={() => onSelect(screenShares[(screenIndex - 1 + screenShares.length) % screenShares.length]!.key)}><ScreenShareArrow direction="previous" /></button>
        <span className="remote-media-position" aria-live="polite">{screenIndex + 1} / {screenShares.length}</span>
        <button type="button" className="remote-media-switcher next" aria-label="Next screen share" onClick={() => onSelect(screenShares[(screenIndex + 1) % screenShares.length]!.key)}><ScreenShareArrow direction="next" /></button>
      </>}
      {camera && <video ref={cameraRef} className="remote-media-pip" autoPlay muted playsInline aria-label={`${camera.name}'s camera picture in picture`} />}
    </div>
  </aside>;
}
