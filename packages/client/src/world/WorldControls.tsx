import type { Map2dTravelFeedback } from "./map2d/map2dTravelFeedback";
import type { RoomLayoutZone } from "@gammyverse/shared";
import type { Dispatch, SetStateAction } from "react";
import { cameraZoomButtonEvent } from "./camera/cameraInput";
import type { CameraEvent, CameraState } from "./camera/cameraState";
import { CAMERA_ZOOM_BUTTON_RATIO } from "./camera/constants";
import { distanceZoomButtons, type DistanceZoomButton } from "./camera/distanceZoom";
import { Map2dControls } from "./map2d/Map2dControls";

interface WorldControlsProps {
  cameraState: CameraState;
  campusOverview: boolean;
  firstPersonView: boolean;
  appPaused: boolean;
  personalDeskZone: RoomLayoutZone | null;
  currentPrivateZoneId: string | null;
  activeFloatingGroup: "character" | "edit" | "view" | "zoom" | null;
  setActiveFloatingGroup: Dispatch<SetStateAction<"character" | "edit" | "view" | "zoom" | null>>;
  canEditMap: boolean;
  mapEditorUsername: string | null;
  mapEditLockPending: boolean;
  onEditMap?: () => void;
  onModifyProps?: () => void;
  weaponInventoryOpen: boolean;
  onToggleWeaponInventory: () => void;
  toggleCameraView: () => void;
  dispatchCamera: (event: CameraEvent) => void;
  onGoToDesk: () => void;
  tppZoomMaxDistanceM: number;
  travelFeedback?: Map2dTravelFeedback | null;
  onCancelTravel?: () => void;
}

function EditingControls({ canEditMap, onEditMap, onModifyProps, activeFloatingGroup, setActiveFloatingGroup, mapEditorUsername, mapEditLockPending, appPaused }: WorldControlsProps) {
  if (!(canEditMap && onEditMap || onModifyProps)) return null;
  const editMapLabel = mapEditorUsername ? `Map is being edited by ${mapEditorUsername}` : "Edit map";
  return <div className={`world-control-group${activeFloatingGroup === "edit" ? " is-active" : ""}`}>
          {activeFloatingGroup === "edit" && <div className="world-control-actions" id="map-edit-actions" role="group" aria-label="Editing actions">
            {onModifyProps && <button type="button" className="modify-props-control" aria-label="Modify props" title="Modify props" disabled={appPaused} onClick={() => { setActiveFloatingGroup(null); onModifyProps(); }}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m14 6 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/><path d="M13 7 17 11"/></svg>
            </button>}
            {canEditMap && onEditMap && <button type="button" className="edit-map-control" aria-label={editMapLabel} title={editMapLabel} disabled={appPaused || mapEditLockPending || Boolean(mapEditorUsername)} onClick={() => { setActiveFloatingGroup(null); onEditMap(); }}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6.5 8 4l8 2.5L21 4v13.5L16 20l-8-2.5L3 20V6.5Z"/><path d="M8 4v13.5M16 6.5V20M12.4 13.6l5.9-5.9 2 2-5.9 5.9-2.6.6.6-2.6Z"/></svg>
            </button>}
          </div>}
          <button type="button" className="world-control-trigger" aria-label="Editing tools" title="Editing tools" disabled={appPaused} aria-expanded={activeFloatingGroup === "edit"} aria-controls="map-edit-actions" onClick={() => setActiveFloatingGroup((group) => group === "edit" ? null : "edit")}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m14 6 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/><path d="M13 7 17 11"/></svg>
          </button>
        </div>;
}

function CameraControls({ activeFloatingGroup, setActiveFloatingGroup, firstPersonView, toggleCameraView, weaponInventoryOpen, onToggleWeaponInventory }: WorldControlsProps) {
  return <div className={`world-control-group${activeFloatingGroup === "view" ? " is-active" : ""}`}>
          {activeFloatingGroup === "view" && <div className="world-control-actions" id="map-view-actions" role="group" aria-label="Camera actions">
            <button type="button" className="camera-view-control" aria-label={firstPersonView ? "Switch to third-person view" : "Switch to first-person view"} title={firstPersonView ? "Third-person view · V" : "First-person view · V"} onClick={toggleCameraView}>
              {firstPersonView ? "3P" : "1P"}
            </button>
            {firstPersonView && <button type="button" className={`weapon-inventory-control${weaponInventoryOpen ? " is-active" : ""}`} aria-label={weaponInventoryOpen ? "Close weapon inventory" : "Open weapon inventory"} title="Weapon inventory · B" onClick={onToggleWeaponInventory}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m4 15 5-5 3 1 3-3 2 2-3 3 1 3-5 5-2-2 2-3-2-2-3 2-2-2Z"/><path d="m14 7 3-3 3 3-3 3M5 19l-2 2"/></svg>
            </button>}
          </div>}
          <button type="button" className="world-control-trigger" aria-label="Camera controls" title="Camera controls" aria-expanded={activeFloatingGroup === "view"} aria-controls="map-view-actions" onClick={() => setActiveFloatingGroup((group) => group === "view" ? null : "view")}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7.5h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H3z"/><path d="m16 10 5-3v10l-5-3"/><circle cx="8.5" cy="12" r="2.2"/></svg>
          </button>
        </div>;
}

function DistanceControls({ cameraState, dispatchCamera, tppZoomMaxDistanceM }: WorldControlsProps) {
  const buttons = distanceZoomButtons(cameraState.distanceM, tppZoomMaxDistanceM);
  const nudge = (button: DistanceZoomButton) => <button key={button.direction} className="tpp-zoom-nudge" type="button" aria-label={button.label} title={button.title} disabled={button.disabled} onClick={() => dispatchCamera({ type: "distance", distanceM: button.distanceM, maxDistanceM: tppZoomMaxDistanceM })}>{button.symbol}</button>;
  return <div className="overview-zoom-controls tpp-zoom-controls" role="group" aria-label="3D camera distance">
    {nudge(buttons[0])}
    <div className="tpp-zoom-panel"><div className="tpp-zoom-readout"><output aria-label="Current camera distance">{Math.round(cameraState.distanceM)} m</output></div></div>
    {nudge(buttons[1])}
  </div>;
}

function CharacterControls(props: WorldControlsProps) {
  const { activeFloatingGroup, setActiveFloatingGroup, cameraState, dispatchCamera } = props;
  const isOpen = activeFloatingGroup === "character";
  const cameraLocked = cameraState.following && cameraState.followFacing;
  return <div className={`world-control-group${isOpen ? " is-active" : ""}`}>
    {isOpen && <div className="world-control-actions" id="map-character-actions" role="group" aria-label="Character actions">
      <button type="button" className="world-control-trigger" aria-label="Focus character" title="Focus character" disabled={props.appPaused} onClick={() => { setActiveFloatingGroup(null); dispatchCamera({ type: "focus-character" }); }}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>
      </button>
      <button data-tutorial-target="office-camera-lock" type="button" className={`world-control-trigger${cameraLocked ? " is-active" : ""}`} aria-label={cameraLocked ? "Unlock camera angle" : "Lock camera behind character"} title={cameraLocked ? "Unlock camera angle" : "Lock camera behind character"} aria-pressed={cameraLocked} disabled={cameraState.mode === "fpp" || cameraState.editing} onClick={() => dispatchCamera({ type: "set-camera-lock", locked: !cameraLocked })}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{cameraLocked ? <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0"/></> : <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.2-2.4"/></>}</svg>
      </button>
      {props.personalDeskZone && props.currentPrivateZoneId !== props.personalDeskZone.id && <button type="button" className="world-control-trigger" aria-label="Go to your desk" title="Go to your desk" disabled={props.appPaused} onClick={() => { setActiveFloatingGroup(null); props.onGoToDesk(); }}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11h18M5 11v9m14-9v9M7 11V4h10v7M10 7h4"/></svg>
      </button>}
    </div>}
    <button data-tutorial-target="office-focus-character" type="button" className="world-control-trigger" aria-label="Character actions" title="Character actions" aria-expanded={isOpen} aria-controls="map-character-actions" onClick={() => setActiveFloatingGroup(group => group === "character" ? null : "character")}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-3.3 3-5 7-5s6.4 1.7 7 5"/></svg>
    </button>
  </div>;
}

function ZoomControls(props: WorldControlsProps) {
  const { activeFloatingGroup, setActiveFloatingGroup, cameraState, dispatchCamera } = props;
  const distanceView = cameraState.mode === "tpp" || cameraState.mode === "free" && !cameraState.editing;
  return <div className={`world-control-group${activeFloatingGroup === "zoom" ? " is-active" : ""}`}>
    {activeFloatingGroup === "zoom" && <div className="world-control-actions" id="map-zoom-actions" role="group" aria-label="Zoom actions">
      {distanceView ? <DistanceControls {...props} /> : <div className="overview-zoom-controls">
        <button type="button" aria-label="Zoom out one level" title="Zoom out 1×" onClick={() => dispatchCamera(cameraZoomButtonEvent(cameraState, 1 / CAMERA_ZOOM_BUTTON_RATIO))}>−</button>
        <button type="button" aria-label="Zoom in one level" title="Zoom in 1×" onClick={() => dispatchCamera(cameraZoomButtonEvent(cameraState, CAMERA_ZOOM_BUTTON_RATIO))}>+</button>
      </div>}
    </div>}
    <button type="button" className="world-control-trigger" aria-label="Zoom controls" title="Zoom controls" aria-expanded={activeFloatingGroup === "zoom"} aria-controls="map-zoom-actions" onClick={() => setActiveFloatingGroup((group) => group === "zoom" ? null : "zoom")}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5M8 10.8h5.6M10.8 8v5.6"/></svg>
    </button>
  </div>;
}

export function WorldControls(props: WorldControlsProps) {
  const { cameraState, appPaused, personalDeskZone, currentPrivateZoneId, setActiveFloatingGroup, dispatchCamera, onGoToDesk } = props;
  if (cameraState.mode === "map2d") return <Map2dControls
    scalePxPerM={cameraState.map2dScalePxPerM}
    following={cameraState.following}
    disabled={appPaused}
    hasDesk={Boolean(personalDeskZone)}
    atDesk={Boolean(personalDeskZone && currentPrivateZoneId === personalDeskZone.id)}
    onZoom={(factor) => { dispatchCamera({ type: "set-view", view: "2d" }); if (!cameraState.following) dispatchCamera({ type: "manual-drag" }); dispatchCamera({ type: "map2d-scale", pxPerM: cameraState.map2dScalePxPerM * factor }); }}
    onFocus={() => { dispatchCamera({ type: "set-view", view: "2d" }); dispatchCamera({ type: "focus-character" }); }}
    onToggleFollow={() => dispatchCamera(cameraState.following ? { type: "manual-drag" } : { type: "focus-character" })}
    onGoToDesk={onGoToDesk}
    tools={<EditingControls {...props} />}
    travelFeedback={props.travelFeedback}
    onCancelTravel={props.onCancelTravel}
  />;
  return (      <div className="world-control-dock" aria-label="Map controls">
        <CharacterControls {...props} />
        <EditingControls {...props} />
        <CameraControls {...props} />
        <ZoomControls {...props} />
      </div>);
}
