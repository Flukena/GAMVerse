import { useEffect, useRef, useState } from "react";
import { characterPortraitPreviewUrl } from "../../assets/characterPortraitPaths";
import type { MeetingParticipant, MeetingVideoTrack } from "./meetingViewState";

const INITIAL_LENGTH_CHARS = 2;
const YOU_LABEL = "You";
const CAMERA_OFF_LABEL = "Camera off";
const CONNECTING_LABEL = "Connecting media…";
const UNAVAILABLE_LABEL = "Media not connected";
const MIC_OFF_LABEL = "Microphone off";
const MIC_ON_LABEL = "Microphone on";
const SPEAKING_LABEL = "Speaking";
const PIN_LABEL = "Pin";
const UNPIN_LABEL = "Unpin";
const CAMERA_SUFFIX_LABEL = " camera";
const MIC_OFF_SHORT_LABEL = "Mic off";
const MIC_ON_SHORT_LABEL = "Mic on";

export function MeetingMediaVideo({ track, label, mirror = false }: {
  track: MeetingVideoTrack; label: string; mirror?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    track.attach(element);
    return () => { track.detach(element); };
  }, [track]);
  return <video className={mirror ? "meeting-video mirrored" : "meeting-video"} ref={ref} aria-label={label} autoPlay playsInline muted />;
}
function MeetingAvatar({ participant }: { participant: MeetingParticipant }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const previewUrl = participant.characterId ? characterPortraitPreviewUrl(participant.characterId) : null;
  const name = participant.displayName || participant.username;
  return <span className="meeting-avatar" aria-hidden="true">
    {previewUrl && previewUrl !== failedUrl
      ? <img src={previewUrl} alt="" onError={() => setFailedUrl(previewUrl)} />
      : Array.from(name).slice(0, INITIAL_LENGTH_CHARS).join("").toLocaleUpperCase()}
  </span>;
}
function placeholderLabel(participant: MeetingParticipant): string {
  if (participant.mediaState === "connecting") return CONNECTING_LABEL;
  return participant.mediaState === "unavailable" ? UNAVAILABLE_LABEL : CAMERA_OFF_LABEL;
}
export function MeetingParticipantTile({ participant, pinned, onPin }: {
  participant: MeetingParticipant; pinned: boolean; onPin(): void;
}) {
  const name = participant.displayName || participant.username;
  return <article className={`meeting-participant${participant.speaking ? " is-speaking" : ""}`} aria-label={name}>
    <div className="meeting-participant-media">
      {participant.cameraTrack
        ? <MeetingMediaVideo track={participant.cameraTrack} label={`${name}${CAMERA_SUFFIX_LABEL}`} mirror={participant.local} />
        : <div className="meeting-camera-placeholder"><MeetingAvatar participant={participant} /><span>{placeholderLabel(participant)}</span></div>}
    </div>
    <footer className="meeting-participant-footer">
      <span className="meeting-participant-name" title={name}>{name}{participant.local ? ` · ${YOU_LABEL}` : ""}</span>
      <span className="meeting-microphone-state" aria-label={participant.microphoneMuted ? MIC_OFF_LABEL : MIC_ON_LABEL} title={participant.microphoneMuted ? MIC_OFF_LABEL : MIC_ON_LABEL}>{participant.microphoneMuted ? MIC_OFF_SHORT_LABEL : MIC_ON_SHORT_LABEL}</span>
      {participant.speaking ? <span className="meeting-speaking-label">{SPEAKING_LABEL}</span> : null}
      <button type="button" aria-pressed={pinned} aria-label={`${pinned ? UNPIN_LABEL : PIN_LABEL} ${name}`} onClick={onPin}>{pinned ? UNPIN_LABEL : PIN_LABEL}</button>
    </footer>
  </article>;
}
