import { parseMap2dPresentationPreference, type Map2dPresentationPreference } from "./map2dPresentation";
import type { ReactNode } from "react";
import { map2dTravelMessage, type Map2dTravelFeedback } from "./map2dTravelFeedback";
import { CAMERA_ZOOM_BUTTON_RATIO } from "../camera/constants";
import { MAP2D_DEFAULT_SCALE_PX_PER_M, MAP2D_MAX_SCALE_PX_PER_M, MAP2D_MIN_SCALE_PX_PER_M } from "./constants";
import "./Map2dControls.css";

const PRESENTATION_LABEL = "Map presentation";
const PRESENTATION_STYLE_LABEL = "Map style";
const PRESENTATION_AUTO_LABEL = "Auto";
const PRESENTATION_SIMPLIFIED_LABEL = "Simplified";
const PRESENTATION_IMMERSIVE_LABEL = "Immersive";
const ZOOM_PERCENT_PER_RATIO = 100;
const ZOOM_LABEL = "Map zoom";
const NO_DESK_LABEL = "Claim a desk to use Go to desk";
const AT_DESK_LABEL = "You are already at your desk";
const GO_TO_DESK_LABEL = "Go to your desk";
const FOLLOWING_LABEL = "Following you";
const RECENTER_LABEL = "Recenter on you";
const SWITCH_VIEW_LABEL = "Switch to 3D view (M)";
const CANCEL_TRAVEL_LABEL = "Cancel travel";
const NAVIGATION_HINT = "Click to walk · Drag to pan · Scroll to zoom";

export interface Map2dControlsProps {
  preference: Map2dPresentationPreference;
  onPreferenceChange: (preference: Map2dPresentationPreference) => void;
  scalePxPerM: number;
  following: boolean;
  disabled?: boolean;
  hasDesk: boolean;
  atDesk: boolean;
  onZoom: (factor: number) => void;
  onFocus: () => void;
  onGoToDesk: () => void;
  onSwitchView: () => void;
  tools?: ReactNode;
  travelFeedback?: Map2dTravelFeedback | null;
  onCancelTravel?: () => void;
}

export function Map2dControls({ preference, onPreferenceChange, scalePxPerM, following, disabled = false, hasDesk, atDesk, onZoom, onFocus, onGoToDesk, onSwitchView, tools, travelFeedback, onCancelTravel }: Map2dControlsProps) {
  const deskLabel = hasDesk ? (atDesk ? AT_DESK_LABEL : GO_TO_DESK_LABEL) : NO_DESK_LABEL;
  const focusLabel = following ? FOLLOWING_LABEL : RECENTER_LABEL;
  const zoomPercent = Math.round(scalePxPerM / MAP2D_DEFAULT_SCALE_PX_PER_M * ZOOM_PERCENT_PER_RATIO);
  return <aside className="map2d-controls" aria-label="2D map controls">
    {travelFeedback && <div className="map2d-travel-feedback">
      <span role="status" aria-live="polite">{map2dTravelMessage(travelFeedback)}</span>
      {travelFeedback.status === "started" && onCancelTravel && <button type="button" disabled={disabled} onClick={onCancelTravel}>{CANCEL_TRAVEL_LABEL}</button>}
    </div>}
    <p className="map2d-controls-hint">{NAVIGATION_HINT}</p>
    <div className="map2d-controls-row">
      {tools}
      <label className="map2d-presentation-control">{PRESENTATION_STYLE_LABEL}
        <select aria-label={PRESENTATION_LABEL} value={preference} disabled={disabled}
          onChange={(event) => onPreferenceChange(parseMap2dPresentationPreference(event.target.value))}>
          <option value="auto">{PRESENTATION_AUTO_LABEL}</option>
          <option value="simplified">{PRESENTATION_SIMPLIFIED_LABEL}</option>
          <option value="immersive">{PRESENTATION_IMMERSIVE_LABEL}</option>
        </select>
      </label>
      <button type="button" title={SWITCH_VIEW_LABEL} aria-label={SWITCH_VIEW_LABEL} disabled={disabled} onClick={onSwitchView}>3D <span aria-hidden="true">↗</span></button>
      <button data-tutorial-target="office-focus-character" type="button" className={following ? "is-following" : undefined} aria-pressed={following} aria-label={focusLabel} title={focusLabel} disabled={disabled} onClick={onFocus}>
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>
      </button>
      <span title={deskLabel} className="map2d-desk-action"><button type="button" aria-label={deskLabel} disabled={disabled || !hasDesk || atDesk} onClick={onGoToDesk}>
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 11h18M5 11v9m14-9v9M7 11V4h10v7M10 7h4"/></svg><span>My desk</span>
      </button></span>
      <div className="map2d-zoom-controls" role="group" aria-label={ZOOM_LABEL}>
        <button type="button" aria-label="Zoom out" title="Zoom out" disabled={disabled || scalePxPerM <= MAP2D_MIN_SCALE_PX_PER_M} onClick={() => onZoom(1 / CAMERA_ZOOM_BUTTON_RATIO)}>−</button>
        <output aria-label={ZOOM_LABEL}>{zoomPercent}%</output>
        <button type="button" aria-label="Zoom in" title="Zoom in" disabled={disabled || scalePxPerM >= MAP2D_MAX_SCALE_PX_PER_M} onClick={() => onZoom(CAMERA_ZOOM_BUTTON_RATIO)}>+</button>
      </div>
    </div>
  </aside>;
}
