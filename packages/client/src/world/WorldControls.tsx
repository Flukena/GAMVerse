import type { Map2dTravelFeedback } from "./map2d/map2dTravelFeedback";
import type { Map2dPresentationPreference } from "./map2d/map2dPresentation";
import { CAMERA, type RoomLayoutZone } from "@gammyverse/shared";
import type { Dispatch, SetStateAction } from "react";
import { cameraZoomButtonEvent } from "./camera/cameraInput";
import type { CameraEvent, CameraState } from "./camera/cameraState";
import { CAMERA_ZOOM_BUTTON_RATIO } from "./camera/constants";
import { Map2dControls } from "./map2d/Map2dControls";

interface WorldControlsProps {
  mapPresentationPreference: Map2dPresentationPreference;
  onMapPresentationChange: (preference: Map2dPresentationPreference) => void;
  cameraState: CameraState;
  campusOverview: boolean;
  firstPersonView: boolean;
  appPaused: boolean;
  personalDeskZone: RoomLayoutZone | null;
  currentPrivateZoneId: string | null;
  activeFloatingGroup: "edit" | "view" | "zoom" | null;
  setActiveFloatingGroup: Dispatch<SetStateAction<"edit" | "view" | "zoom" | null>>;
  canEditMap: boolean;
  mapEditorUsername: string | null;
  mapEditLockPending: boolean;
  onEditMap?: () => void;
  onModifyProps?: () => void;
  weaponInventoryOpen: boolean;
  onToggleWeaponInventory: () => void;
  toggleCameraView: () => void;
  toggleMap2d: () => void;
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
  const zoomOut = () => {
    const distanceM = cameraState.distanceM + CAMERA.zoomStep;
    dispatchCamera({ type: "distance", distanceM, maxDistanceM: tppZoomMaxDistanceM });
  };
  return <div className="overview-zoom-controls tpp-zoom-controls" role="group" aria-label="3D camera distance">
    <button className="tpp-zoom-nudge" type="button" aria-label="Zoom in 10 meters" title="Zoom in 10 m" disabled={cameraState.distanceM <= CAMERA.minZoom} onClick={() => dispatchCamera({ type: "distance", distanceM: cameraState.distanceM - CAMERA.zoomStep, maxDistanceM: tppZoomMaxDistanceM })}>−</button>
    <div className="tpp-zoom-panel"><div className="tpp-zoom-readout"><output aria-label="Current camera distance">{Math.round(cameraState.distanceM)} m</output></div></div>
    <button className="tpp-zoom-nudge" type="button" aria-label="Zoom out 10 meters" title="Zoom out 10 m" disabled={cameraState.distanceM >= tppZoomMaxDistanceM} onClick={zoomOut}>+</button>
  </div>;
}

function ZoomControls(props: WorldControlsProps) {
  const { activeFloatingGroup, setActiveFloatingGroup, cameraState, dispatchCamera } = props;
  const distanceView = cameraState.mode === "tpp" || cameraState.mode === "free" && !cameraState.editing;
  return <div className={`world-control-group${activeFloatingGroup === "zoom" ? " is-active" : ""}`}>
    {activeFloatingGroup === "zoom" && <div className="world-control-actions" id="map-zoom-actions" role="group" aria-label="Zoom actions">
      {distanceView ? <DistanceControls {...props} /> : <div className="overview-zoom-controls">
        <button type="button" aria-label="Zoom in one level" title="Zoom in 1×" onClick={() => dispatchCamera(cameraZoomButtonEvent(cameraState, CAMERA_ZOOM_BUTTON_RATIO))}>+</button>
        <button type="button" aria-label="Zoom out one level" title="Zoom out 1×" onClick={() => dispatchCamera(cameraZoomButtonEvent(cameraState, 1 / CAMERA_ZOOM_BUTTON_RATIO))}>−</button>
      </div>}
    </div>}
    <button type="button" className="world-control-trigger" aria-label="Zoom controls" title="Zoom controls" aria-expanded={activeFloatingGroup === "zoom"} aria-controls="map-zoom-actions" onClick={() => setActiveFloatingGroup((group) => group === "zoom" ? null : "zoom")}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="10.8" cy="10.8" r="6.5"/><path d="m16 16 4.5 4.5M8 10.8h5.6M10.8 8v5.6"/></svg>
    </button>
  </div>;
}

export function WorldControls(props: WorldControlsProps) {
  const { cameraState, appPaused, personalDeskZone, currentPrivateZoneId, setActiveFloatingGroup, toggleMap2d, dispatchCamera, onGoToDesk } = props;
  if (cameraState.mode === "map2d") return <Map2dControls
    preference={props.mapPresentationPreference}
    onPreferenceChange={props.onMapPresentationChange}
    scalePxPerM={cameraState.map2dScalePxPerM}
    following={cameraState.following}
    disabled={appPaused}
    hasDesk={Boolean(personalDeskZone)}
    atDesk={Boolean(personalDeskZone && currentPrivateZoneId === personalDeskZone.id)}
    onZoom={(factor) => { dispatchCamera({ type: "set-view", view: "2d" }); if (!cameraState.following) dispatchCamera({ type: "manual-drag" }); dispatchCamera({ type: "map2d-scale", pxPerM: cameraState.map2dScalePxPerM * factor }); }}
    onFocus={() => { dispatchCamera({ type: "set-view", view: "2d" }); dispatchCamera({ type: "focus-character" }); }}
    onGoToDesk={onGoToDesk}
    onSwitchView={toggleMap2d}
    tools={<EditingControls {...props} />}
    travelFeedback={props.travelFeedback}
    onCancelTravel={props.onCancelTravel}
  />;
  return (      <div className="world-control-dock" aria-label="Map controls">
        <button type="button" className="world-control-trigger" aria-label="Toggle 2D / 3D view (M)" title="2D / 3D · M" disabled={appPaused} onClick={toggleMap2d}>2D / 3D</button>
        <div className="world-control-group" role="group" aria-label="Character actions">
          <button data-tutorial-target="office-focus-character" type="button" className="world-control-trigger" aria-label="Focus character" title="Focus character" onClick={() => { setActiveFloatingGroup(null); dispatchCamera({ type: "focus-character" }); }}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s7-6.2 7-13a7 7 0 1 0-14 0c0 6.8 7 13 7 13Z"/><circle cx="12" cy="9" r="2.3"/></svg>
          </button>
          <button data-tutorial-target="office-camera-lock" type="button" className="world-control-trigger"
            aria-label={cameraState.followFacing ? "Unlock camera angle" : "Lock camera behind character"}
            aria-pressed={cameraState.following && cameraState.followFacing} disabled={cameraState.mode === "fpp" || cameraState.editing}
            onClick={() => dispatchCamera({ type: "set-camera-lock", locked: !(cameraState.following && cameraState.followFacing) })}>
            <span aria-hidden="true">{cameraState.following && cameraState.followFacing ? "🔒" : "🔓"}</span>
          </button>
          {personalDeskZone && currentPrivateZoneId !== personalDeskZone.id && <button type="button" className="world-control-trigger" aria-label="Go to your desk" title="Go to your desk" disabled={appPaused} onClick={() => { setActiveFloatingGroup(null); onGoToDesk(); }}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11.5 20 4l-7.5 17-2.2-7.3L3 11.5Z"/><path d="m10.3 13.7 4.6-4.6"/></svg>
          </button>}
        </div>
        <EditingControls {...props} />
        <CameraControls {...props} />
        <ZoomControls {...props} />
      </div>);
}
