import { useState, type ReactNode } from "react";
import { map2dTravelMessage, type Map2dTravelFeedback } from "./map2dTravelFeedback";
import { CAMERA_ZOOM_BUTTON_RATIO } from "../camera/constants";
import { MAP2D_DEFAULT_SCALE_PX_PER_M, MAP2D_MAX_SCALE_PX_PER_M, MAP2D_MIN_SCALE_PX_PER_M } from "./constants";
import "./Map2dControls.css";

const ZOOM_PERCENT_PER_RATIO = 100;
const ZOOM_LABEL = "Map zoom";
const GO_TO_DESK_LABEL = "Go to your desk";
const FOLLOWING_LABEL = "Following you";
const RECENTER_LABEL = "Recenter on you";
const FOLLOW_LABEL = "Follow character";
const STOP_FOLLOWING_LABEL = "Stop following character";
const CHARACTER_ACTIONS_LABEL = "Character actions";
const CANCEL_TRAVEL_LABEL = "Cancel travel";

export interface Map2dControlsProps {
  scalePxPerM: number;
  following: boolean;
  disabled?: boolean;
  hasDesk: boolean;
  atDesk: boolean;
  onZoom: (factor: number) => void;
  onFocus: () => void;
  onToggleFollow: () => void;
  onGoToDesk: () => void;
  tools?: ReactNode;
  travelFeedback?: Map2dTravelFeedback | null;
  onCancelTravel?: () => void;
}

export function Map2dControls({ scalePxPerM, following, disabled = false, hasDesk, atDesk, onZoom, onFocus, onToggleFollow, onGoToDesk, tools, travelFeedback, onCancelTravel }: Map2dControlsProps) {
  const [activeGroup, setActiveGroup] = useState<"character" | "zoom" | null>(null);
  const focusLabel = following ? FOLLOWING_LABEL : RECENTER_LABEL;
  const zoomPercent = Math.round(scalePxPerM / MAP2D_DEFAULT_SCALE_PX_PER_M * ZOOM_PERCENT_PER_RATIO);
  return <aside className="map2d-controls world-control-dock" aria-label="2D map controls">
    {travelFeedback?.status === "started" && <div className="map2d-travel-feedback">
      <span role="status" aria-live="polite">{map2dTravelMessage(travelFeedback)}</span>
      {onCancelTravel && <button type="button" disabled={disabled} onClick={onCancelTravel}>{CANCEL_TRAVEL_LABEL}</button>}
    </div>}
    <div className="map2d-control-stack">
      <div className={`world-control-group${activeGroup === "character" ? " is-active" : ""}`}>
        {activeGroup === "character" && <div className="world-control-actions map2d-character-actions" id="map2d-character-actions" role="group" aria-label={CHARACTER_ACTIONS_LABEL}>
          <button type="button" className="world-control-trigger" aria-label={focusLabel} title={focusLabel} disabled={disabled} onClick={onFocus}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>
          </button>
          <button data-tutorial-target="office-camera-lock" type="button" className={`world-control-trigger${following ? " is-following" : ""}`} aria-pressed={following} aria-label={following ? STOP_FOLLOWING_LABEL : FOLLOW_LABEL} title={following ? STOP_FOLLOWING_LABEL : FOLLOW_LABEL} disabled={disabled} onClick={onToggleFollow}>
            <svg aria-hidden="true" viewBox="0 0 24 24">{following ? <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0"/></> : <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.2-2.4"/></>}</svg>
          </button>
          {hasDesk && !atDesk && <button className="world-control-trigger" type="button" aria-label={GO_TO_DESK_LABEL} title={GO_TO_DESK_LABEL} disabled={disabled} onClick={onGoToDesk}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 11h18M5 11v9m14-9v9M7 11V4h10v7M10 7h4"/></svg>
          </button>}
        </div>}
        <button data-tutorial-target="office-focus-character" className="world-control-trigger" type="button" title={CHARACTER_ACTIONS_LABEL} aria-label={CHARACTER_ACTIONS_LABEL} aria-expanded={activeGroup === "character"} aria-controls="map2d-character-actions" onClick={() => setActiveGroup(group => group === "character" ? null : "character")}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-3.3 3-5 7-5s6.4 1.7 7 5"/></svg>
        </button>
      </div>
      {tools}
      <div className={`world-control-group${activeGroup === "zoom" ? " is-active" : ""}`}>
        {activeGroup === "zoom" && <div className="world-control-actions map2d-zoom-actions" id="map2d-zoom-actions" role="group" aria-label={ZOOM_LABEL}>
          <button type="button" aria-label="Zoom in" title="Zoom in" disabled={disabled || scalePxPerM >= MAP2D_MAX_SCALE_PX_PER_M} onClick={() => onZoom(CAMERA_ZOOM_BUTTON_RATIO)}>+</button>
          <output aria-label={ZOOM_LABEL}>{zoomPercent}%</output>
          <button type="button" aria-label="Zoom out" title="Zoom out" disabled={disabled || scalePxPerM <= MAP2D_MIN_SCALE_PX_PER_M} onClick={() => onZoom(1 / CAMERA_ZOOM_BUTTON_RATIO)}>−</button>
        </div>}
        <button className="world-control-trigger" type="button" title={ZOOM_LABEL} aria-label={ZOOM_LABEL} aria-expanded={activeGroup === "zoom"} aria-controls="map2d-zoom-actions" onClick={() => setActiveGroup(group => group === "zoom" ? null : "zoom")}>
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5M8 10.8h5.6M10.8 8v5.6"/></svg>
        </button>
      </div>
    </div>
  </aside>;
}
