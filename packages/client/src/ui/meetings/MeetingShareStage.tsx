import { useEffect, useId, useRef, useState } from "react";
import { MeetingMediaVideo } from "./MeetingParticipantTile";
import type { MeetingScreenShare } from "./meetingViewState";
import { createMeetingShareState, fitMeetingShare, MEETING_SHARE_FIT_PERCENT, MEETING_SHARE_MAX_ZOOM_PERCENT, reconcileMeetingShareState, zoomMeetingShare } from "./meetingShareState";
import "./MeetingShareStage.css";

const ZOOM_CONTROLS_LABEL = "Screen share zoom";
const ZOOM_IN_LABEL = "Zoom in";
const ZOOM_OUT_LABEL = "Zoom out";
const FIT_LABEL = "Fit";
const VIEWPORT_LABEL = "Shared screen; use arrow keys to scroll when zoomed";
const SCREEN_SUFFIX_LABEL = " · Screen";
const SCROLL_ORIGIN_PX = 0;

export type MeetingShareStageProps = {
  conversationKey: string | null;
  share: MeetingScreenShare;
  participantName: string;
};

export function MeetingShareStage({ conversationKey, share, participantName }: MeetingShareStageProps) {
  const [selection, setSelection] = useState(() => createMeetingShareState(conversationKey, share.id));
  const state = reconcileMeetingShareState(selection, conversationKey, share.id);
  if (state !== selection) setSelection(state);
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewportId = useId();
  const label = share.label ?? `${participantName}${SCREEN_SUFFIX_LABEL}`;
  const fitted = state.zoomPercent === MEETING_SHARE_FIT_PERCENT;
  useEffect(() => {
    if (fitted && viewportRef.current) {
      viewportRef.current.scrollLeft = SCROLL_ORIGIN_PX;
      viewportRef.current.scrollTop = SCROLL_ORIGIN_PX;
    }
  }, [fitted, share.id, conversationKey]);
  return <article className="meeting-share-stage meeting-share-zoom-stage">
    <div className="meeting-share-toolbar"><strong>{label}</strong>
      <div className="meeting-share-zoom-controls" role="group" aria-label={ZOOM_CONTROLS_LABEL}>
        <button type="button" aria-controls={viewportId} disabled={fitted} onClick={() => setSelection(current => zoomMeetingShare(current, -1))}>{ZOOM_OUT_LABEL}</button>
        <output aria-live="polite" aria-label={ZOOM_CONTROLS_LABEL}>{state.zoomPercent}%</output>
        <button type="button" aria-controls={viewportId} disabled={state.zoomPercent === MEETING_SHARE_MAX_ZOOM_PERCENT} onClick={() => setSelection(current => zoomMeetingShare(current, 1))}>{ZOOM_IN_LABEL}</button>
        <button type="button" aria-controls={viewportId} disabled={fitted} onClick={() => setSelection(fitMeetingShare)}>{FIT_LABEL}</button>
      </div>
    </div>
    <div id={viewportId} ref={viewportRef} className="meeting-share-viewport" role="region" aria-label={VIEWPORT_LABEL} tabIndex={0}>
      <div className="meeting-share-surface" style={{ width: `${state.zoomPercent}%`, height: `${state.zoomPercent}%` }}>
        <MeetingMediaVideo track={share.track} label={label} />
      </div>
    </div>
  </article>;
}
