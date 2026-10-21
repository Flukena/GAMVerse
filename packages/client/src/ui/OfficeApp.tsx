import { VoiceMediaWorkspace } from "./media/VoiceMediaWorkspace";
import { useRemoteMediaViewer } from "./media/useRemoteMediaViewer";
import { readVoiceRosterActivity } from "./media/voiceRosterActivity";
import { playerName } from "../identity/playerName";
import { useClientDiagnostics } from "./diagnostics/useClientDiagnostics";
import { MaintainerDiagnosticsPage } from "./diagnostics/MaintainerDiagnosticsPage";
import { reportClientDiagnostic } from "./diagnostics/clientDiagnostics";
import { createOfficeMediaSession } from "./media/officeMediaSession";
import { voiceParticipantUsername } from "./media/mediaIdentity";
import { type ChatTransport } from "./social/ChatPanel";
import { useOfficeSocial } from "./social/useOfficeSocial";
import { OfficeSocialOverlay } from "./social/OfficeSocialOverlay";
import { ReactionPicker } from "./social/ReactionPicker";
import { HandRaiseButton } from "./social/HandRaiseButton";
import { OfficePanelHeader, type OfficePanel } from "./workspace/OfficeNavigation";
import { PeoplePanel } from "./workspace/PeoplePanel";
import { WorkspaceChrome } from "./workspace/WorkspaceChrome";
import { OfficeGeneralSettings } from "./workspace/OfficeGeneralSettings";
import { OfficeSettingsDialog } from "./workspace/OfficeSettingsDialog";
import { OfficeThemeSettings } from "./workspace/OfficeThemeSettings";
import { useWorkspaceTheme } from "./workspace/useWorkspaceTheme";
import { WorkspaceDialog } from "./workspace/WorkspaceDialog";
import { MapPersonDialog } from "./workspace/MapPersonDialog";
import { isWorkspaceInputBlocked } from "./workspace/workspaceInput";
import { clearLastOfficePositions, readLastOfficePosition, saveLastOfficePosition } from "./lastOfficePosition";
import { useWorkspacePanelFocus } from "./workspace/useWorkspacePanelFocus";
import { useTravelFeedback } from "./workspace/useTravelFeedback";
import { AvailabilityDialog } from "./workspace/AvailabilityDialog";
import { AvailabilityMenu } from "./workspace/AvailabilityMenu";
import { AVAILABILITY_OPTIONS as userStatusOptions, customStatusFromFields } from "./workspace/AvailabilityPresentation";
import { useAvailabilityStatus } from "./workspace/useAvailabilityStatus";
import { useOfficeDesks } from "./workspace/useOfficeDesks";
import { SHARE_OFFICE_LABEL } from "./workspace/officeShareLinks";
import { useOfficeShareLinks } from "./workspace/useOfficeShareLinks";
import { acceptOfficeEntryLink, acceptPendingOfficeInvite, getInviteRouteToken, getOfficeShareRouteToken } from "./workspace/officeEntryLink";
import { useSignOutConfirmation } from "./workspace/useSignOutConfirmation";
import { CreateOfficeDialog } from "./workspace/CreateOfficeDialog";
import { DeskManagerDialog } from "./workspace/DeskManagerDialog";
import { useDeskAssignmentNotice } from "./workspace/useDeskAssignmentNotice";
import { createCampusOfficeDraft, type CampusInteriorPreset } from "@gammyverse/shared";
import { createOfficeWithLayout } from "./workspace/officeCreation";
import { availabilityPolicy, USER_STATUSES, type UserStatus, type CustomStatus } from "@gammyverse/shared";
import type { PersonActionCallbacks, PersonActionContext } from "./workspace/personActions";
import "./social/social.css";
import { Client, type Room } from "@colyseus/sdk";
import { INPUT_HEARTBEAT_INTERVAL_MS, InputSendGate, type MovementInput, CAMPUS_WORLD, DEFAULT_CAMERA_YAW, DEFAULT_CHARACTER_ID, KENNEY_BLASTER_IDS, KENNEY_CHARACTER_IDS, KENNEY_PET_IDS, KENNEY_VEHICLE_IDS, OfficeState, campusWorldFromConfig, isPositionWalkable, isValidJumpEvent, readRoomLayout, roomLayoutZoneAt, roomPropPlacementSupport, roomZoneEntranceIssues, ROOM_DOOR_FRAME_ASSETS, ROOM_PROP_CATALOG, ROOM_WALL_MODEL_ASSETS, type KenneyBlasterId, type KenneyCharacterId, type KenneyPetId, type KenneyVehicleId, type OfficeState as OfficeStateType, type PlayerState, type RoomLayout, type RoomLayoutDoor, type RoomLayoutProp, type RoomLayoutWall, type RoomLayoutZone } from "@gammyverse/shared";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { createVoiceRoom } from "./media/voiceRoomSdk";
import { CameraSettings } from "./media/CameraSettings";
import { applyCameraBackgroundMode, readCameraBackgroundMode, saveCameraBackgroundMode, type CameraBackgroundMode } from "./media/cameraBackground";
import { persistMediaDevicePreferences, readMediaDevicePreferences } from "./media/mediaDevicePreferences";
import { VoiceRoomSession, VOICE_MEDIA_STOPPED_LABEL, type VoiceSessionListener } from "./media/voiceRoomSession";
import { fetchVoiceToken } from "./media/voiceToken";
import { type VoiceRosterActivity, type VoiceRosterPerson } from "./media/VoiceParticipantRoster";
import { SoundSettings } from "./media/SoundSettings";
import { applyAudioInputPreference, readAudioDevicePreferences, saveAudioInputDevice, saveAudioOutputDevice, type AudioDevicePreferences } from "./media/audioDevicePreferences";
import { readVoiceParticipantAudioLevels, saveVoiceParticipantAudioLevels } from "./media/voiceParticipantPreferences";
import type { VoiceTarget } from "./media/voiceTarget";
import { useOfficeConversations } from "./conversations/useOfficeConversations";
import { conversationAccessZones } from "./conversations/conversationAccessState";
import { OfficeConversationHub } from "./conversations/OfficeConversationHub";
import { privateActionEnabled } from "./conversations/conversationAccessState";
import { OfficeContextOverlay } from "./workspace/OfficeContextOverlay";
import { applyConversationMediaIntent, ConversationAdmissionIntent } from "./media/conversationMediaIntent";
import type { LocalAudioTrack, LocalVideoTrack, RemoteAudioTrack, Room as LiveKitRoomInstance, RoomEvent } from "livekit-client";
import { CharacterPreview3D } from "../world/CharacterPreview3D";
import { PetThumbnail } from "./PetThumbnail";
import { gobkitPet, kaykitCharacter, petModelUrl, petPreviewUrl, polygonalMindCharacter, QUATERNIUS_CHARACTERS, quaterniusPet } from "../assets/characterAssets";
import { CHARACTER_SAVE_TIMEOUT_MS, characterSaveError } from "./characterSaveError";
import { getRealtimeEndpoint } from "../realtimeEndpoint";
import { Minimap } from "./Minimap";
import type { Map2dLocateRequest } from "../world/map2d/map2dInput";
import { WorldCanvas } from "../world/WorldCanvas";
import { clientRuntimeMetrics } from "../world/clientRuntimeMetrics";
import type { LockedTurnState } from "../world/camera/lockedMovement";
import { resolveHeldMovement } from "../world/camera/heldMovement";
import { FullScreenLoading } from "./FullScreenLoading";
import { ModifyPropsEditor } from "./ModifyPropsEditor";
import { MapBuildingPicker } from "./MapBuildingPicker";
import { PropModelPreview } from "./PropModelPreview";
import { PageTutorial } from "./PageTutorial";
import { LobbyDirectory } from "./lobby/LobbyDirectory";
import { MaintainerSystemPanel } from "./MaintainerSystemPanel";
import { playSocialNotificationSound, unlockSocialNotificationAudio } from "../audio/notificationSounds";
import { unlockMovementAudio } from "../audio/movementSounds";
import { setNoiseReduction, type NoiseReductionResult } from "../audio/noiseReduction";
import { DROP_EVENT_LABEL, LEAVE_EVENT_LABEL, CONSENTED_CLOSE_CODE, REPLACED_CLOSE_CODE, FRESH_JOIN_DELAY_MS, FRESH_JOIN_MAX_DELAY_MS, FRESH_JOIN_MAX_RETRIES_COUNT, RECONNECT_INITIAL_DELAY_MS, REMOVED_CLOSE_CODE, RETRY_BACKOFF_MULTIPLIER, installOfficeReconnection, shouldFreshJoin } from "./connection/officeReconnection";

const ROOM_WALL_OPTIONS = ROOM_WALL_MODEL_ASSETS.map((asset) => ROOM_PROP_CATALOG.find((item) => item.asset === asset)).filter((item): item is (typeof ROOM_PROP_CATALOG)[number] => item !== undefined);
const ROOM_WALL_OPTION_GROUPS = ROOM_WALL_OPTIONS.reduce<Array<{ label: string; items: typeof ROOM_WALL_OPTIONS }>>((groups, item) => {
  const label = item.group ?? "Other walls";
  const group = groups.find((candidate) => candidate.label === label);
  if (group) group.items.push(item);
  else groups.push({ label, items: [item] });
  return groups;
}, []);

const VOICE_MICROPHONE_SOURCE = "microphone";
const VOICE_AUDIO_KIND = "audio";

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";
type CharacterSelectionId = KenneyCharacterId | `custom-${string}`;
type PersonalAvatarModel = { id: `custom-${string}`; label: string; modelUrl: string };
type SettingsSection = "general" | "sound" | "camera" | "permissions" | "security" | "theme";
type BrowserPermissionValue = "granted" | "denied" | "prompt" | "unknown";
type OfficeActivityType = "office.join" | "office.leave" | "meeting.enter" | "meeting.leave" | "private.enter" | "private.leave" | "bubble.enter" | "bubble.leave" | "vehicle.enter" | "vehicle.leave";
type OfficeActivity = { id: string; actorUsername: string; activityType: OfficeActivityType; locationName: string | null; occurredAt: string };
const officeActivityLabels: Record<OfficeActivityType, string> = {
  "office.join": "Entered the office",
  "office.leave": "Left the office",
  "meeting.enter": "Entered the meeting area",
  "meeting.leave": "Left the meeting area",
  "private.enter": "Entered a private desk",
  "private.leave": "Left a private desk",
  "bubble.enter": "Joined a voice bubble",
  "bubble.leave": "Left a voice bubble",
  "vehicle.enter": "Started driving",
  "vehicle.leave": "Stopped driving",
};
const officeActivityLocation = (activity: OfficeActivity) => {
  const value = activity.locationName;
  if (!value || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) return "";
  const vehicleName = value.replace(/^campus-car-/, "").replace(/^(vehicle|car)-/, "");
  return vehicleName !== value || /^(vehicle|car)-/.test(value)
    ? vehicleName.replaceAll("-", " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    : value;
};
type PlayerSnapshot = { x: number; z: number; rotation: number; username: string; displayName: string; isMaintainer: boolean; characterId: CharacterSelectionId; petId: KenneyPetId | ""; weaponId: KenneyBlasterId | ""; vehicleId: KenneyVehicleId | ""; vehicleMode: "" | "manual" | "auto"; vehiclePropId: string; vehiclePropX: number; vehiclePropZ: number; vehiclePropRotation: number; sittingPropId: string; dancing: boolean; status: UserStatus; customStatusText: string; customStatusEmoji: string; customStatusExpiresAtMs: number; presence: "online" | "away"; nearby: boolean; handRaised: boolean; microphoneEnabled: boolean; cameraEnabled: boolean; screenShareEnabled: boolean };

type FollowAlert = { followerSessionId: string; followerName: string };
type WaveAlert = { senderSessionId: string; senderName: string };
type BlasterVector = { x: number; y: number; z: number };
type BlasterShotEvent = { shooterSessionId: string; start: BlasterVector; end: BlasterVector };
type AuthUser = { username: string; nickname: string | null; role: "maintainer" | "user"; characterId: CharacterSelectionId | null };
type Office = { id: string; name: string; ownerUsername: string; role: "owner" | "admin" | "user" | "maintainer" };
type OfficeInvite = { id: string; officeId: string; officeName: string; inviter: string; role: "admin" | "user"; expiresAt: string };
type OfficeMember = { username: string; role: "owner" | "admin" | "user"; joinedAt: string | null };
type ProximityAudioTrack = { track: RemoteAudioTrack; username: string };

const movementKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"];
const CAMERA_MAX_BITRATE_BPS = 1_500_000;
const SCREEN_MAX_BITRATE_BPS = 4_000_000;
const MEDIA_MAX_FRAMERATE_FPS = 30;
const MEDIA_DEGRADATION_PREFERENCE = "maintain-resolution";
const RECONNECT_VOICE_LABEL = "Reconnect voice";

function usePanelPresence(isOpen: boolean, exitDuration = 260) {
  const [isMounted, setIsMounted] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      return;
    }
    if (!isMounted) return;

    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : exitDuration;
    const timeout = window.setTimeout(() => setIsMounted(false), duration);
    return () => window.clearTimeout(timeout);
  }, [isOpen, isMounted, exitDuration]);

  return isMounted;
}

function CharacterPicker({ value, currentCharacterId, onChange }: { value: CharacterSelectionId | null; currentCharacterId: CharacterSelectionId | null; onChange: (id: KenneyCharacterId) => void }) {
  return <div className="character-picker" role="radiogroup" aria-label="Choose a character">
    {KENNEY_CHARACTER_IDS.map((id, index) => {
      const blocky = id.startsWith("character-blocky-");
      const suffix = blocky ? id.slice("character-blocky-".length) : id.replace("character-", "");
      const quaternius = QUATERNIUS_CHARACTERS[id as keyof typeof QUATERNIUS_CHARACTERS];
      const polygonalMind = polygonalMindCharacter(id);
      const kaykit = kaykitCharacter(id);
      const label = quaternius?.label ?? polygonalMind?.label ?? kaykit?.label ?? (blocky
        ? `Blocky ${suffix.toUpperCase()}`
        : suffix.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));
      const preview = quaternius?.preview ?? polygonalMind?.preview ?? kaykit?.preview ?? (blocky
        ? `/assets/kenney/blocky-characters/Previews/character-${suffix}.png`
        : `/assets/kenney/mini-characters/Previews/${id}.png`);
      return <button type="button" className={`character-option${value === id ? " selected" : ""}`} key={id} role="radio" aria-checked={value === id} onClick={() => onChange(id)}>
        {preview ? <img src={preview} alt="" loading="lazy" /> : <span className={`character-option-avatar-placeholder tone-${index % 6}`} aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="19" r="12" /><path d="M13 58c1-14 8-23 19-23s18 9 19 23H13Z" /></svg></span>}
        <span>{label}</span>
        {currentCharacterId === id && <small className="character-current-badge">Current</small>}
      </button>;
    })}
  </div>;
}

function PersonalAvatarPicker({ models, value, currentCharacterId, onChange, onRemove }: { models: PersonalAvatarModel[]; value: CharacterSelectionId | null; currentCharacterId: CharacterSelectionId | null; onChange: (id: PersonalAvatarModel["id"]) => void; onRemove: (model: PersonalAvatarModel) => void }) {
  if (models.length === 0) return null;
  return <div className="character-picker" role="radiogroup" aria-label="Your uploaded characters">
    {models.map((model) => <div className={`character-option personal-avatar-option${value === model.id ? " selected" : ""}`} key={model.id}>
      <button type="button" className="personal-avatar-select" role="radio" aria-checked={value === model.id} aria-label={`Use ${model.label}`} onClick={() => onChange(model.id)}>
        <span className="personal-avatar-preview" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M13 10h22v8h5v12h-5v8H13v-8H8V18h5v-8Z" fill="currentColor" opacity=".18"/><path d="M17 15h14v18H17zM11 21h6v8h-6zm20 0h6v8h-6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M20 22h2m4 0h2M20 28h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></span>
        <span>{model.label}</span>
      </button>
      {currentCharacterId === model.id && <small className="character-current-badge">Current</small>}
      <button type="button" className="personal-avatar-remove" aria-label={`Remove ${model.label}`} title={value === model.id || currentCharacterId === model.id ? "Choose and save another character before removing this model" : `Remove ${model.label}`} disabled={value === model.id || currentCharacterId === model.id} onClick={() => onRemove(model)}>×</button>
    </div>)}
  </div>;
}

function characterDetails(characterId: CharacterSelectionId, models: PersonalAvatarModel[]) {
  if (characterId.startsWith("custom-")) {
    const customModel = models.find((model) => model.id === characterId);
    return { label: customModel?.label ?? "Uploaded model", source: "Your uploaded model", preview: null };
  }
  const blocky = characterId.startsWith("character-blocky-");
  const quaternius = QUATERNIUS_CHARACTERS[characterId as keyof typeof QUATERNIUS_CHARACTERS];
  const polygonalMind = polygonalMindCharacter(characterId);
  const kaykit = kaykitCharacter(characterId);
  const suffix = blocky ? characterId.slice("character-blocky-".length) : characterId.replace("character-", "");
  return {
    label: quaternius?.label ?? polygonalMind?.label ?? kaykit?.label ?? (blocky ? `Blocky ${suffix.toUpperCase()}` : suffix.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())),
    source: quaternius?.source ?? polygonalMind?.source ?? kaykit?.source ?? (blocky ? "Kenney Blocky Characters" : "Kenney Mini Characters"),
    preview: quaternius?.preview ?? polygonalMind?.preview ?? kaykit?.preview ?? (blocky ? `/assets/kenney/blocky-characters/Previews/character-${suffix}.png` : `/assets/kenney/mini-characters/Previews/${characterId}.png`),
  };
}

const petLabel = (id: KenneyPetId) => gobkitPet(id)?.label ?? quaterniusPet(id)?.label ?? id.replace("animal-", "").replace(/(^|-)([a-z])/g, (_match, dash: string, letter: string) => `${dash ? " " : ""}${letter.toUpperCase()}`);
const vehicleLabel = (id: KenneyVehicleId) => ({
  "vehicle-speedster": "Speedster", "vehicle-racer": "Racer", "vehicle-suv": "Toy SUV", "vehicle-monster-truck": "Monster Truck", "vehicle-truck": "Toy Truck",
  "car-sedan": "Sedan", "car-hatchback-sports": "Sports Hatchback", "car-taxi": "Taxi", "car-kart-oopi": "Kart",
})[id];
function TouchMoveButton({
  label,
  code,
  heldKeysRef,
  onInputChange,
  disabled = false,
  children,
}: {
  label: string;
  code: string;
  heldKeysRef: MutableRefObject<Set<string>>;
  onInputChange?: () => void;
  disabled?: boolean;
  children: string;
}) {
  const hold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    heldKeysRef.current.add(code);
    onInputChange?.();
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const release = (event?: ReactPointerEvent<HTMLButtonElement> | ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event && "preventDefault" in event) event.preventDefault();
    heldKeysRef.current.delete(code);
    onInputChange?.();
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.code === "Enter" || event.code === "Space") {
      event.preventDefault();
      heldKeysRef.current.add(code);
      if (!event.repeat) onInputChange?.();
    }
  };
  const onKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.code === "Enter" || event.code === "Space") release(event);
  };

  return (
    <button
      type="button"
      className="touch-move-button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={hold}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => { heldKeysRef.current.delete(code); onInputChange?.(); }}
    >
      {children}
    </button>
  );
}

function FeatherIcon({ name, size = 18 }: { name: "mic" | "micOff" | "video" | "videoOff" | "screen" | "screenOff" | "headphones" | "headphonesOff" | "close" | "maximize" | "exit" | "car" | "lock" | "unlock" | "refresh" | "office" | "chat" | "people" | "clock"; size?: number }) {
  const shared = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const drawings = {
    mic: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>,
    micOff: <><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9V5a3 3 0 0 0-5.83-1M5 10v2a7 7 0 0 0 11.4 5.45M19 10v2c0 .6-.08 1.17-.22 1.71M12 19v3m-4 0h8M2 2l20 20"/></>,
    video: <><rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></>,
    videoOff: <><path d="m3 3 18 18M10.6 5H14a2 2 0 0 1 2 2v2l5-3v10l-5-3v2a2 2 0 0 1-.59 1.41M3 7v10a2 2 0 0 0 2 2h9"/></>,
    screen: <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4m-3-9 2-2 2 2 3-4"/></>,
    screenOff: <><path d="m3 3 18 18M10 3h10a2 2 0 0 1 2 2v10M2 8V5a2 2 0 0 1 2-2h1m-1 7v7a2 2 0 0 0 2 2h11M8 21h8m-4-4v4"/></>,
    headphones: <><path d="M3 14v-3a9 9 0 0 1 18 0v3"/><path d="M5 13h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Zm12 0h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z"/></>,
    headphonesOff: <><path d="M3 14v-3a9 9 0 0 1 15.4-6.4M21 11v3M5 13h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Zm12 0h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1M2 2l20 20"/></>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    maximize: <><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/></>,
    exit: <><path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>,
    car: <><path d="m5 11 1.5-5h11L19 11l2 2v5h-2m-14 0H3v-5l2-2Z"/><path d="M5 11h14M7 18h10"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></>,
    unlock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2m-3.5 9v3"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 17.4 6.4L20 9M4 15l2.6 2.6A7 7 0 0 0 18.4 15"/></>,
    office: <><path d="M3 21h18M5 21V5l7-3 7 3v16M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4"/></>,
    chat: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...shared}>{drawings[name]}</svg>;
}

const endpoint = getRealtimeEndpoint();
const CAMERA_CAPTURE_720P30 = { resolution: { width: 1280, height: 720, frameRate: 30 }, frameRate: { ideal: 30, max: 30 } };
const SCREEN_CAPTURE_1080P30 = { resolution: { width: 1920, height: 1080, frameRate: 30 }, contentHint: "detail" as const };
const getResetRouteToken = (path: string) => path.match(/^\/reset\/([A-Za-z0-9_-]{30,100})\/?$/)?.[1] ?? null;
const getMeetingRouteOfficeId = (path: string) => path.match(/^\/meeting\/([0-9a-f-]{36})\/?$/i)?.[1] ?? null;
const getOfficeRouteId = (path = window.location.pathname) => path.match(/^\/office\/([0-9a-f-]{36})\/?$/i)?.[1] ?? null;

export function OfficeApp() {
  const workspaceTheme = useWorkspaceTheme();
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const [meetingEntry, setMeetingEntry] = useState(() => Boolean(getMeetingRouteOfficeId(window.location.pathname)));
  const routePathRef = useRef(routePath);
  routePathRef.current = routePath;
  const diagnosticsPage = routePath.replace(/\/+$/, "") === "/maintainer/diagnostics";
  const maintainerPortal = routePath === "/maintainer" || diagnosticsPage;
  const inviteLinkToken = getInviteRouteToken(routePath);
  const resetLinkToken = getResetRouteToken(routePath);
  const meetingLinkOfficeId = getMeetingRouteOfficeId(routePath);
  const client = useMemo(() => new Client(endpoint), []);
  const roomRef = useRef<Room<OfficeStateType> | null>(null);
  const [voiceRealtimeSessionKey, setVoiceRealtimeSessionKey] = useState<string | null>(null);
  const voiceTeardownRef = useRef<Promise<void>>(Promise.resolve());
  const voiceMutedIntentRef = useRef(true);
  const conversationAdmissionIntentRef = useRef(new ConversationAdmissionIntent());
  const voiceSessionRef = useRef<VoiceRoomSession<LiveKitRoomInstance> | null>(null);
  const voiceTargetRef = useRef<VoiceTarget | null>(null);
  const [voiceRetryExhausted, setVoiceRetryExhausted] = useState(false);
  const [voiceMediaNotice, setVoiceMediaNotice] = useState<string | null>(null);
  const liveKitRoomRef = useRef<LiveKitRoomInstance | null>(null);
  const privateLiveKitRoomRef = useRef<LiveKitRoomInstance | null>(null);
  const proximityLiveKitRoomRef = useRef<LiveKitRoomInstance | null>(null);
  const [zoneAudioUsernames, setZoneAudioUsernames] = useState<Set<string>>(new Set());
  const voiceActivityRoomCleanupRef = useRef<(() => void) | null>(null);
  const proximityAudioTracksRef = useRef(new Map<string, ProximityAudioTrack>());
  const remoteAudioTracksRef = useRef(new Map<string, { track: RemoteAudioTrack; username: string }>());
  const participantAudioLevelsRef = useRef(readVoiceParticipantAudioLevels());
  const remoteAudioContextRef = useRef<AudioContext | null>(null);
  const speakingUsernamesRef = useRef(new Set<string>());
  const [speakingUsernames, setSpeakingUsernames] = useState<ReadonlySet<string>>(() => new Set());
  const speakingRosterUsernamesRef = useRef<ReadonlySet<string>>(new Set());
  const speakingByVoiceRoomRef = useRef(new Map<LiveKitRoomInstance, Set<string>>());
  const audioOutputRef = useRef<HTMLDivElement>(null);
  const inboundAudioMutedRef = useRef(false);
  const appPausedRef = useRef(false);
  const workspaceInputBlockedRef = useRef(false);
  const [workspaceOverlayOpen, setWorkspaceOverlayOpen] = useState(false);
  const playersRef = useRef<Map<string, PlayerSnapshot>>(new Map());
  const blasterEventsRef = useRef<BlasterShotEvent[]>([]);
  const jumpStartedAtRef = useRef(new Map<string, number>());
  const localSessionIdRef = useRef<string | null>(null);
  const lastPositionSavedAtRef = useRef(0);
  const positionStorageEpochRef = useRef(0);
  const cameraYawRef = useRef(DEFAULT_CAMERA_YAW);
  const cameraBehindCharacterRef = useRef(true);
  const lockedMovementRef = useRef<LockedTurnState | null>(null);
  const sendHeldMovementRef = useRef<() => void>(() => {});
  const firstPersonViewRef = useRef(false);
  const map2dViewRef = useRef(false);
  const map2dToggleRef = useRef<() => void>(() => {});
  const [map2dViewActive, setMap2dViewActive] = useState(false);
  const travel = useTravelFeedback();
  const locateRequestRef = useRef<Map2dLocateRequest | null>(null);
  const peopleSignatureRef = useRef("");
  const nearbySessionIdsRef = useRef(new Set<string>());
  const proximityGroupIdRef = useRef<string | null>(null);
  const meetingZoneActiveRef = useRef(false);
  const privateZoneIdRef = useRef<string | null>(null);
  const reconnectingRef = useRef(false);
  const intentionalLeaveRef = useRef(false);
  const autoRejoiningRef = useRef(false);
  const autoRejoinAttemptsRef = useRef(0);
  const heldKeysRef = useRef(new Set<string>());
  const autoMoveNoticeTimerRef = useRef<number | undefined>(undefined);
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [offices, setOffices] = useState<Office[]>([]);
  const [officeListVerified, setOfficeListVerified] = useState(false);
  const [invites, setInvites] = useState<OfficeInvite[]>([]);
  const [activeOffice, setActiveOffice] = useState<Office | null>(null);
  const activeOfficeRef = useRef(activeOffice);
  activeOfficeRef.current = activeOffice;
  const connectionUsername = authUser?.username;
  const connectionOfficeId = activeOffice?.id;
  const inputSendGateRef = useRef(new InputSendGate());
  const sendMovementInput = (input: MovementInput) => {
    const room = roomRef.current;
    if (!room?.connection.isOpen || reconnectingRef.current) return;
    const next = inputSendGateRef.current.take(input, performance.now());
    if (next) room.send("input", next);
  };
  const setWorkspaceInputBlocked = useCallback((blocked: boolean) => {
    workspaceInputBlockedRef.current = blocked;
    setWorkspaceOverlayOpen(blocked);
    if (blocked) { heldKeysRef.current.clear(); lockedMovementRef.current = null; sendHeldMovementRef.current(); }
  }, []);
  const [blasterHitNotice, setBlasterHitNotice] = useState<number | null>(null);
  const blasterHitSequenceRef = useRef(0);
  const [officeName, setOfficeName] = useState("");
  const [createOfficeDialogOpen, setCreateOfficeDialogOpen] = useState(false);
  const [createOfficeInteriors, setCreateOfficeInteriors] = useState<CampusInteriorPreset>("furnished");
  const [deskManagerOpen, setDeskManagerOpen] = useState(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [lobbyBusy, setLobbyBusy] = useState(false);
  const [initialLobbyLoading, setInitialLobbyLoading] = useState(false);
  const [managingOffice, setManagingOffice] = useState<Office | null>(null);
  const [mapEditMode, setMapEditMode] = useState(false);
  const [mapBuildingPickerOpen, setMapBuildingPickerOpen] = useState(false);
  const [selectedMapBuildingAsset, setSelectedMapBuildingAsset] = useState<RoomLayoutProp["asset"] | null>(null);
  const [spawnPlacementMode, setSpawnPlacementMode] = useState(false);
  const [mapSpawnSaving, setMapSpawnSaving] = useState(false);
  const mapEditModeRef = useRef(mapEditMode);
  mapEditModeRef.current = mapEditMode;
  const [mapEditorUsername, setMapEditorUsername] = useState<string | null>(null);
  const [mapEditLockRequestPending, setMapEditLockRequestPending] = useState(false);
  const [officeMapLayout, setOfficeMapLayout] = useState<RoomLayout | null>(null);
  const officeMapLayoutRef = useRef(officeMapLayout);
  officeMapLayoutRef.current = officeMapLayout;
  const [mapEditBaseline, setMapEditBaseline] = useState<RoomLayout | null>(null);
  const mapDimensions = officeMapLayout?.dimensions ?? { width: CAMPUS_WORLD.width, depth: CAMPUS_WORLD.depth };
  const [mapConfigVersion, setMapConfigVersionState] = useState(1);
  const [mapServerVersion, setMapServerVersion] = useState(mapConfigVersion);
  const mapConfigVersionRef = useRef(mapConfigVersion);
  const recordMapServerVersion = useCallback((version: number) => {
    mapConfigVersionRef.current = version;
    setMapServerVersion(version);
  }, []);
  const setMapConfigVersion = useCallback((version: number) => {
    recordMapServerVersion(version);
    setMapConfigVersionState(version);
  }, [recordMapServerVersion]);
  const [mapPropsConfigVersion, setMapPropsConfigVersion] = useState(1);
  const [mapSaving, setMapSaving] = useState(false);
  const [mapConflictLatest, setMapConflictLatest] = useState<{ layout: RoomLayout; configVersion: number; message: string } | null>(null);
  const mapDraftDirtyRef = useRef(false);
  const mapCommitInFlightRef = useRef(false);
  const [modifyPropsOpen, setModifyPropsOpen] = useState(false);
  const modifyPropsOpenRef = useRef(false);
  modifyPropsOpenRef.current = modifyPropsOpen;
  const [modifyPropsDraft, setModifyPropsDraft] = useState<RoomLayoutProp[]>([]);
  const [modifyPropsVersion, setModifyPropsVersion] = useState(1);
  const [modifyPropsBusy, setModifyPropsBusy] = useState(false);
  const [modifyPropsError, setModifyPropsError] = useState<string | null>(null);
  const [selectedModifyPropId, setSelectedModifyPropId] = useState<string | null>(null);
  const [selectedModifyPropAsset, setSelectedModifyPropAsset] = useState<RoomLayoutProp["asset"] | null>(null);
  const [mapZoneDrawing, setMapZoneDrawing] = useState(false);
  const [generatorTotalPeople, setGeneratorTotalPeople] = useState(150);
  const [generatorPeoplePerTeam, setGeneratorPeoplePerTeam] = useState(15);
  const [generatorTeamCount, setGeneratorTeamCount] = useState(10);
  const createOfficePeoplePerTeam = generatorTeamCount > 0 ? generatorTotalPeople / generatorTeamCount : Number.NaN;
  const createOfficeInputsValid = Number.isInteger(createOfficePeoplePerTeam) && createOfficePeoplePerTeam > 0 && createOfficePeoplePerTeam <= 16;
  const [mapZoneArea, setMapZoneArea] = useState<{ x: number; z: number; width: number; depth: number } | null>(null);
  const [mapZoneName, setMapZoneName] = useState("");
  const [mapZoneKind, setMapZoneKind] = useState<"meeting" | "private" | "restroom">("meeting");
  const [mapZoneEnclosureEnabled, setMapZoneEnclosureEnabled] = useState(true);
  const [mapZoneEntranceSide, setMapZoneEntranceSide] = useState<"north" | "east" | "south" | "west">("south");
  const [mapZoneEntranceKind, setMapZoneEntranceKind] = useState<"door" | "opening">("door");
  const [mapZoneDoorCount, setMapZoneDoorCount] = useState(1);
  const [mapZoneDoorLeaves, setMapZoneDoorLeaves] = useState<1 | 2>(1);
  const [mapZoneDoorOffsets, setMapZoneDoorOffsets] = useState<number[]>([0]);
  const [mapZoneWallStyle, setMapZoneWallStyle] = useState<"geometry" | "asset">("geometry");
  const [mapZoneWallAsset, setMapZoneWallAsset] = useState<(typeof ROOM_WALL_MODEL_ASSETS)[number]>(ROOM_WALL_MODEL_ASSETS[0]);
  const selectedWallAssetDefinition = ROOM_WALL_OPTIONS.find((item) => item.asset === mapZoneWallAsset);
  const [mapZoneWallColor, setMapZoneWallColor] = useState("#023047");
  const [mapZoneDoorStyle, setMapZoneDoorStyle] = useState<"geometry" | "asset">("geometry");
  const [ghostSessionIds, setGhostSessionIds] = useState<Set<string>>(() => new Set());
  const [mapZoneSaving, setMapZoneSaving] = useState(false);
  const [selectedMapZoneId, setSelectedMapZoneId] = useState<string | null>(null);
  const [mapZoneDeleting, setMapZoneDeleting] = useState(false);
  const [officeDeleteConfirmOpen, setOfficeDeleteConfirmOpen] = useState(false);
  const [officeDeleteName, setOfficeDeleteName] = useState("");
  const [officeDeleteError, setOfficeDeleteError] = useState<string | null>(null);
  const [managedOfficeName, setManagedOfficeName] = useState("");
  const [officeMembers, setOfficeMembers] = useState<OfficeMember[]>([]);
  const [meetingZoneActive, setMeetingZoneActive] = useState(false);
  const [meetingZoneId, setMeetingZoneId] = useState<string | null>(null);
  const [activeCameraRoomKey, setActiveCameraRoomKey] = useState("lobby");
  const [privateZoneId, setPrivateZoneId] = useState<string | null>(null);
  const [privateZoneName, setPrivateZoneName] = useState<string | null>(null);
  const [selectedDeskZoneId, setSelectedDeskZoneId] = useState<string | null>(null);
  const [mediaZoneName, setMediaZoneName] = useState<string | null>(null);
  const [lockedZoneIds, setLockedZoneIds] = useState<string[]>([]);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(true);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [proximityGroupId, setProximityGroupId] = useState<string | null>(null);
  const [proximityVoiceConnected, setProximityVoiceConnected] = useState(false);
  const [proximityVoiceMuted, setProximityVoiceMuted] = useState(true);
  const [privateVoiceConnected, setPrivateVoiceConnected] = useState(false);
  const [privateVoiceMuted, setPrivateVoiceMuted] = useState(true);
  const remoteMediaViewer = useRemoteMediaViewer();
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [participantAudioLevels, setParticipantAudioLevels] = useState<Map<string, number>>(readVoiceParticipantAudioLevels);
  const [conversationsOpen, setConversationsOpen] = useState(false);
  const [resetUrls, setResetUrls] = useState<Record<string, string>>({});
  const [accountError, setAccountError] = useState<string | null>(null);
  const [characterPanelOpen, setCharacterPanelOpen] = useState(false);
  const [characterDialogOpen, setCharacterDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [activePetId, setActivePetId] = useState<KenneyPetId | "">("");
  const localPetIdRef = useRef<KenneyPetId | "">("");
  const [characterDialogInitialPetId, setCharacterDialogInitialPetId] = useState<KenneyPetId | "">("");
  const [autoMoveNotice, setAutoMoveNotice] = useState<string | null>(null);
  const [followingSessionId, setFollowingSessionId] = useState<string | null>(null);
  const [mapPlayerAction, setMapPlayerAction] = useState<{ sessionId: string } | null>(null);
  const [followAlerts, setFollowAlerts] = useState<FollowAlert[]>([]);
  const [waveAlerts, setWaveAlerts] = useState<WaveAlert[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [nicknameSaved, setNicknameSaved] = useState(false);
  useEffect(() => { setNicknameDraft(authUser?.nickname ?? ""); }, [authUser?.username, authUser?.nickname]);
  const [idleAnimationsEnabled, setIdleAnimationsEnabled] = useState(() => {
    try { return window.localStorage.getItem("gammyverse.idleAnimationsEnabled") !== "false"; }
    catch { return true; }
  });
  const updateIdleAnimationsEnabled = (enabled: boolean) => {
    setIdleAnimationsEnabled(enabled);
    try { window.localStorage.setItem("gammyverse.idleAnimationsEnabled", String(enabled)); }
    catch { /* Keep the preference for this session when storage is unavailable. */ }
  };
  const [noiseReductionEnabled, setNoiseReductionEnabled] = useState(() => {
    try { return window.localStorage.getItem("gammyverse.noiseReductionEnabled") !== "false"; }
    catch { return true; }
  });
  const noiseReductionEnabledRef = useRef(noiseReductionEnabled);
  const [noiseReductionStatus, setNoiseReductionStatus] = useState<"unknown" | "checking" | "enabled" | "fallback" | "disabled">("unknown");
  const [noiseReductionDetails, setNoiseReductionDetails] = useState("");
  const [audioDevicePreferences, setAudioDevicePreferences] = useState<AudioDevicePreferences>(() => readAudioDevicePreferences());
  const audioDevicePreferencesRef = useRef(audioDevicePreferences);
  audioDevicePreferencesRef.current = audioDevicePreferences;
  const [cameraDeviceId, setCameraDeviceId] = useState(() => readMediaDevicePreferences().videoinput);
  const [cameraBackgroundMode, setCameraBackgroundMode] = useState<CameraBackgroundMode>(() => readCameraBackgroundMode());
  const cameraBackgroundModeRef = useRef(cameraBackgroundMode);
  cameraBackgroundModeRef.current = cameraBackgroundMode;
  const updateNoiseReductionPreference = (enabled: boolean) => {
    noiseReductionEnabledRef.current = enabled;
    setNoiseReductionEnabled(enabled);
    try { window.localStorage.setItem("gammyverse.noiseReductionEnabled", String(enabled)); }
    catch { /* Keep the preference for this session when storage is unavailable. */ }
    void applyNoiseReductionToActiveTracks(enabled);
  };
  const [browserPermissions, setBrowserPermissions] = useState<{ microphone: BrowserPermissionValue; camera: BrowserPermissionValue }>({ microphone: "unknown", camera: "unknown" });
  const [permissionBusy, setPermissionBusy] = useState<"microphone" | "camera" | "screen" | null>(null);
  const [screenPermissionResult, setScreenPermissionResult] = useState<string | null>(null);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [characterDraft, setCharacterDraft] = useState<CharacterSelectionId | null>(null);
  const [characterBusy, setCharacterBusy] = useState(false);
  const [characterError, setCharacterError] = useState<string | null>(null);
  const [personalAvatarModels, setPersonalAvatarModels] = useState<PersonalAvatarModel[]>([]);
  const [personalModelsBusy, setPersonalModelsBusy] = useState(false);
  const [personalModelsError, setPersonalModelsError] = useState<string | null>(null);
  const [avatarUploadBusy, setAvatarUploadBusy] = useState(false);
  const avatarUploadInputRef = useRef<HTMLInputElement>(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [email, setEmail] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "user">("user");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">(() => getInviteRouteToken(window.location.pathname) ? "register" : "login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordVisible, setAuthPasswordVisible] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [people, setPeople] = useState<Array<[string, PlayerSnapshot]>>([]);
  const voiceRosterActivities = new Map(people.filter(([, player]) => typeof player.username === "string").map(([, player]) => [player.username.toLocaleLowerCase(), {
    microphone: player.microphoneEnabled,
    camera: player.cameraEnabled,
    screenShare: player.screenShareEnabled,
  }] as const));
  useEffect(() => {
    if (mapPlayerAction && !people.some(([id, player]) => id === mapPlayerAction.sessionId && player.presence === "online")) setMapPlayerAction(null);
  }, [people, mapPlayerAction]);
  const [userStatus, setUserStatus] = useState<UserStatus>("available");
  const userStatusRef = useRef<UserStatus>("available");
  userStatusRef.current = userStatus;
  const toiletReturnPositionRef = useRef<{ x: number; z: number } | null>(null);
  const [availabilityEditorOpen, setAvailabilityEditorOpen] = useState(false);
  const availability = useAvailabilityStatus(status === "connected" ? roomRef.current : null);
  const officeDesks = useOfficeDesks({ endpoint, officeId: activeOffice?.id ?? null, username: authUser?.username ?? null, sessionKey: status === "connected" ? roomRef.current?.sessionId ?? null : null, configVersion: mapServerVersion });
  useClientDiagnostics(endpoint, authUser?.username ?? null, activeOffice?.id ?? null, voiceRetryExhausted);
  const deskAssignmentNotice = useDeskAssignmentNotice({ room: status === "connected" ? roomRef.current : null,
    officeId: activeOffice?.id ?? null, sessionKey: status === "connected" ? roomRef.current?.sessionId ?? null : null,
    username: authUser?.username ?? null, desks: officeDesks.desks, configVersion: officeDesks.configVersion, onRefresh: officeDesks.refresh });
  useEffect(() => { setDeskManagerOpen(false); }, [activeOffice?.id]);
  const deskClaimBusy = officeDesks.pendingDeskId !== null || officeDesks.loading;
  const deskClaimingZoneId = officeDesks.desks.find((desk) => desk.id === officeDesks.pendingDeskId)?.zoneId ?? null;
  const deskClaimError = officeDesks.error;
  const refreshDesksRef = useRef(officeDesks.refresh);
  refreshDesksRef.current = officeDesks.refresh;
  useEffect(() => { if (status !== "connected") travel.reset(); }, [status, travel.reset]);
  const [statusTravelError, setStatusTravelError] = useState<string | null>(null);
  const mediaSuppressed = availabilityPolicy(userStatus).suppressAutomaticMedia;
  const accessZones = useMemo(() => conversationAccessZones(officeMapLayout), [officeMapLayout]);
  const zonePrivacyTargetId = selectedDeskZoneId ?? meetingZoneId ?? privateZoneId;
  const officeConversations = useOfficeConversations({ room: status === "connected" ? roomRef.current : null,
    officeId: activeOffice?.id ?? null, sessionKey: voiceRealtimeSessionKey, status: userStatus,
    accessZoneId: zonePrivacyTargetId, accessZones });
  const { conversation, listening, publicConversations, meetOffers,
    conversationTarget, canPublishConversation, publishingDisabledReason } = officeConversations;
  const conversationAdmitted = Boolean(conversation?.conversation);
  const conversationKnown = conversation !== null;
  voiceTargetRef.current = conversationTarget;
  const social = useOfficeSocial({ officeId: activeOffice?.id ?? null, room: status === "connected" ? roomRef.current as unknown as ChatTransport : null, playersRef, localSessionId: localSessionIdRef.current, layout: officeMapLayout, heldKeys: heldKeysRef.current, paused: mapEditMode || modifyPropsOpen });
  appPausedRef.current = Boolean(social.interaction) || conversationsOpen || deskManagerOpen;
  const [userStatusMenuOpen, setUserStatusMenuOpen] = useState(false);
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(false);
  const workspacePanelMounted = usePanelPresence(workspacePanelOpen);
  const characterPanelMounted = usePanelPresence(characterPanelOpen);
  const [chatContainer, setChatContainer] = useState<HTMLDivElement | null>(null);
  const [chatTarget, setChatTarget] = useState<string | null>(null);
  const [chatTargetRevision, setChatTargetRevision] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [activeLeftTab, setActiveLeftTab] = useState<OfficePanel>("workspace");
  const onWorkspacePanelKeyDown = useWorkspacePanelFocus({ open: workspacePanelOpen, panel: activeLeftTab, close: () => setWorkspacePanelOpen(false) });
  const [officeActivities, setOfficeActivities] = useState<OfficeActivity[]>([]);
  const [activityBusy, setActivityBusy] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);

  const setInboundAudioMuted = (muted: boolean) => {
    if (inboundAudioMutedRef.current === muted) return;
    inboundAudioMutedRef.current = muted;
    audioOutputRef.current?.querySelectorAll("audio").forEach((element) => { element.muted = muted; });
  };
  const selectUserStatus = async (nextStatus: UserStatus, customStatus?: CustomStatus | null) => {
    const previousStatus = userStatus;
    if (!await availability.save(nextStatus, customStatus)) return false;
    setUserStatusMenuOpen(false);
    if (nextStatus === "toilet" && previousStatus !== "toilet") {
      setStatusTravelError(null);
      const localSessionId = localSessionIdRef.current;
      const localPlayer = localSessionId ? playersRef.current.get(localSessionId) : undefined;
      if (localPlayer) toiletReturnPositionRef.current = { x: localPlayer.x, z: localPlayer.z };
      const restroom = officeMapLayout?.zones
        .filter((zone) => zone.kind === "restroom")
        .sort((a, b) => Math.hypot(a.x - (localPlayer?.x ?? 0), a.z - (localPlayer?.z ?? 0)) - Math.hypot(b.x - (localPlayer?.x ?? 0), b.z - (localPlayer?.z ?? 0)))[0];
      if (restroom) {
        if (!travel.expectDestination(restroom)) return true;
        heldKeysRef.current.clear();
        roomRef.current?.send("auto-move", { x: restroom.x, z: restroom.z, randomVehicle: true });
      } else {
        setStatusTravelError("No restroom zone has been added to this office map.");
      }
    } else if (nextStatus === "available" && previousStatus === "toilet") {
      setStatusTravelError(null);
      const returnPosition = toiletReturnPositionRef.current;
      toiletReturnPositionRef.current = null;
      if (returnPosition) {
        if (!travel.expectDestination(returnPosition)) return true;
        heldKeysRef.current.clear();
        roomRef.current?.send("auto-move", { ...returnPosition, randomVehicle: true });
      }
    }
    return true;
  };
  const toggleHeadphones = () => {
    const mutedByStatus = availabilityPolicy(userStatus).suppressAutomaticMedia;
    void selectUserStatus(mutedByStatus ? "available" : "do-not-disturb");
  };
  const attachRemoteAudio = (track: RemoteAudioTrack) => {
    if (window.AudioContext) {
      try {
        let context = remoteAudioContextRef.current;
        if (!context) {
          context = new window.AudioContext();
          remoteAudioContextRef.current = context;
          void context.resume().catch(() => undefined);
          const selectedOutput = audioDevicePreferencesRef.current.outputDeviceId;
          const setSinkId = (context as AudioContext & { setSinkId?: (sinkId: string) => Promise<void> }).setSinkId;
          if (selectedOutput && setSinkId) void setSinkId.call(context, selectedOutput).catch((cause) => console.warn("Could not select the saved speaker.", cause));
        }
        track.setAudioContext(context);
      } catch (cause) {
        console.warn("Could not enable per-person audio gain; using browser volume controls.", cause);
      }
    }
    const element = track.attach();
    element.autoplay = true;
    element.muted = inboundAudioMutedRef.current;
    audioOutputRef.current?.appendChild(element);
  };

  useEffect(() => {
    const unlockAudio = () => {
      unlockSocialNotificationAudio();
      unlockMovementAudio();
      if (remoteAudioContextRef.current?.state === "suspended") void remoteAudioContextRef.current.resume().catch(() => {});
      window.removeEventListener("pointerdown", unlockAudio, true);
      window.removeEventListener("keydown", unlockAudio, true);
      window.removeEventListener("touchstart", unlockAudio, true);
    };
    window.addEventListener("pointerdown", unlockAudio, true);
    window.addEventListener("keydown", unlockAudio, true);
    window.addEventListener("touchstart", unlockAudio, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio, true);
      window.removeEventListener("keydown", unlockAudio, true);
      window.removeEventListener("touchstart", unlockAudio, true);
    };
  }, []);

  useEffect(() => {
    setCharacterDraft(authUser?.characterId ?? null);
  }, [authUser?.username, authUser?.characterId]);

  useEffect(() => {
    if (!authUser || !activeOffice || activeLeftTab !== "activity" || !workspacePanelOpen) return;
    let cancelled = false;
    setOfficeActivities([]);
    setActivityError(null);
    const loadActivity = async () => {
      try {
        setActivityBusy(true);
        const response = await fetch(`${endpoint}/offices/${activeOffice.id}/activity`, { credentials: "include" });
        const result = await response.json() as { activities?: OfficeActivity[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load office activity.");
        if (!cancelled) { setOfficeActivities(result.activities ?? []); setActivityError(null); }
      } catch (error) {
        if (!cancelled) setActivityError(error instanceof Error ? error.message : "Could not load office activity.");
      } finally {
        if (!cancelled) setActivityBusy(false);
      }
    };
    void loadActivity();
    const timer = window.setInterval(() => void loadActivity(), 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [authUser, activeOffice?.id, activeLeftTab, workspacePanelOpen]);

  useEffect(() => {
    if (!authUser) return;
    let active = true;
    setPersonalModelsBusy(true);
    void fetch(`${endpoint}/auth/models`, { credentials: "include" })
      .then(async (response) => {
        const result = await response.json() as { models?: PersonalAvatarModel[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load your uploaded characters.");
        if (active) setPersonalAvatarModels(result.models ?? []);
      })
      .catch((cause) => { if (active) setPersonalModelsError(cause instanceof Error ? cause.message : "Could not load your uploaded characters."); })
      .finally(() => { if (active) setPersonalModelsBusy(false); });
    return () => { active = false; };
  }, [authUser?.username]);

  useEffect(() => {
    if (resetLinkToken) { setAuthReady(true); return; }
    void fetch(`${endpoint}/auth/me`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Session expired. Please sign in again.");
        const result = await response.json() as { user: AuthUser };
        // Maintainers may also open office URLs. Only reject regular accounts
        // on the dedicated maintainer sign-in route; refreshing an office URL
        // must not revoke a valid maintainer session.
        if (maintainerPortal && !diagnosticsPage && result.user.role !== "maintainer") {
          await fetch(`${endpoint}/auth/logout`, { method: "POST", credentials: "include" });
          setAuthError("This account is not a maintainer account.");
          return;
        }
        setAuthUser(result.user);
      })
      .catch(() => undefined)
      .finally(() => setAuthReady(true));
  }, []);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      const authPath = maintainerPortal ? "maintainer/login" : authMode;
      const response = await fetch(`${endpoint}/auth/${authPath}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: authUsername, password: authPassword, ...(authMode === "register" ? { email } : {}) }),
      });
      const result = await response.json() as { user?: AuthUser; error?: string };
      if (!response.ok || !result.user) throw new Error(result.error ?? "Could not sign in.");
      positionStorageEpochRef.current += 1;
      clearLastOfficePositions();
      setInitialLobbyLoading(true);
      setAuthUser(result.user);
      setAuthPassword("");
      setEmail("");
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "Could not connect to the sign-in service.");
    } finally {
      setAuthBusy(false);
    }
  };

  const saveCharacter = async () => {
    const characterId = characterDraft;
    if (!authUser || !characterId) return;
    setCharacterBusy(true);
    setCharacterError(null);
    try {
      const response = await fetch(`${endpoint}/auth/character`, {
        method: "PATCH",
        signal: AbortSignal.timeout(CHARACTER_SAVE_TIMEOUT_MS),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      const responseText = await response.text();
      let result: { characterId?: CharacterSelectionId; error?: string };
      try {
        result = JSON.parse(responseText) as { characterId?: CharacterSelectionId; error?: string };
      } catch {
        throw new Error(`The character service returned an unreadable response (HTTP ${response.status}). Please retry; if this continues, check the app server.`);
      }
      if (response.status === 401) throw new Error("Your sign-in expired before the character could be saved. Reload and sign in again.");
      if (response.status >= 500) throw new Error(`The character service had a server error (HTTP ${response.status}). Please try again shortly.`);
      if (!response.ok || result.characterId !== characterId) throw new Error(result.error ?? "Could not save your character.");
      setAuthUser((user) => user ? { ...user, characterId: result.characterId! } : user);
      roomRef.current?.send("character", characterId);
      setCharacterDialogOpen(false);
    } catch (cause) {
      setCharacterError(characterSaveError(cause));
    } finally {
      setCharacterBusy(false);
    }
  };

  const saveNickname = async () => {
    if (!authUser) return;
    setNicknameSaving(true);
    setNicknameError(null);
    setNicknameSaved(false);
    try {
      const response = await fetch(`${endpoint}/auth/nickname`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname: nicknameDraft }) });
      const result = await response.json() as { nickname?: string | null; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save your nickname.");
      const nickname = result.nickname ?? null;
      setAuthUser((user) => user ? { ...user, nickname } : user);
      roomRef.current?.send("nickname");
      setNicknameSaved(true);
    } catch (cause) {
      setNicknameError(cause instanceof Error ? cause.message : "Could not save your nickname.");
    } finally { setNicknameSaving(false); }
  };
  const nicknameEditor = <form className="nickname-settings" onSubmit={(event) => { event.preventDefault(); void saveNickname(); }}><label htmlFor="nickname-setting">Nickname <span>(optional)</span></label><div><input id="nickname-setting" type="text" maxLength={32} autoComplete="nickname" value={nicknameDraft} onChange={(event) => { setNicknameDraft(event.target.value); setNicknameSaved(false); setNicknameError(null); }} placeholder={authUser?.username ?? "Choose a nickname"} /><button type="submit" className="lobby-button" disabled={nicknameSaving || nicknameDraft === (authUser?.nickname ?? "")}>{nicknameSaving ? "Saving…" : "Save"}</button></div><small>Others will see this name. Leave it blank to show your username.</small>{nicknameError && <small className="auth-error" role="alert">{nicknameError}</small>}{nicknameSaved && <small className="nickname-saved" role="status">Nickname updated.</small>}</form>;
  const profileDialog = profileDialogOpen && createPortal(<div className="profile-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileDialogOpen(false); }}><section className="profile-dialog profile-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title"><header className="profile-dialog-header"><div><span className="eyebrow">YOUR ACCOUNT</span><h2 id="profile-dialog-title">Profile</h2></div><button type="button" className="icon-button" aria-label="Close profile" onClick={() => setProfileDialogOpen(false)}><FeatherIcon name="close" size={17} /></button></header><div className="profile-dialog-content"><div className="profile-edit-identity"><span className="character-account-avatar">{(authUser?.username ?? "U").slice(0, 1).toUpperCase()}</span><div><strong>{authUser?.username}</strong><small>{authUser?.role}</small></div></div>{nicknameEditor}</div></section></div>, document.body);

  const uploadPersonalAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setPersonalModelsError(null);
    if (!file.name.toLowerCase().endsWith(".glb")) {
      setPersonalModelsError("Choose a .glb model file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPersonalModelsError("Model must be 10 MB or smaller.");
      return;
    }
    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (header.length !== 4 || header[0] !== 0x67 || header[1] !== 0x6c || header[2] !== 0x54 || header[3] !== 0x46) {
      setPersonalModelsError("This file is not a valid binary glTF (.glb) model.");
      return;
    }
    setAvatarUploadBusy(true);
    try {
      const response = await fetch(`${endpoint}/auth/models`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/octet-stream", "X-Model-Name": file.name },
        body: file,
      });
      const result = await response.json() as { model?: PersonalAvatarModel; error?: string };
      if (!response.ok || !result.model) throw new Error(result.error ?? "Could not upload this model.");
      setPersonalAvatarModels((models) => [...models, result.model!]);
      setCharacterDraft(result.model.id);
    } catch (cause) {
      setPersonalModelsError(cause instanceof Error ? cause.message : "Could not upload this model.");
    } finally {
      setAvatarUploadBusy(false);
    }
  };

  const removePersonalAvatar = async (model: PersonalAvatarModel) => {
    if (authUser?.characterId === model.id) {
      setPersonalModelsError("Choose and save another character before removing this model.");
      return;
    }
    setPersonalModelsBusy(true);
    setPersonalModelsError(null);
    try {
      const response = await fetch(`${endpoint}/auth/models/${encodeURIComponent(model.id)}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error ?? "Could not remove this model.");
      }
      setPersonalAvatarModels((models) => models.filter((entry) => entry.id !== model.id));
      if (characterDraft === model.id) setCharacterDraft(authUser?.characterId ?? DEFAULT_CHARACTER_ID);
    } catch (cause) {
      setPersonalModelsError(cause instanceof Error ? cause.message : "Could not remove this model.");
    } finally {
      setPersonalModelsBusy(false);
    }
  };

  const refreshBrowserPermissions = async () => {
    if (!navigator.permissions?.query) return;
    const names = ["microphone", "camera"] as const;
    const entries = await Promise.all(names.map(async (name) => {
      try {
        const result = await navigator.permissions.query({ name } as PermissionDescriptor);
        return [name, result.state] as const;
      } catch {
        return [name, "unknown"] as const;
      }
    }));
    setBrowserPermissions((current) => ({ ...current, ...Object.fromEntries(entries) as Partial<typeof current> }));
  };

  const requestBrowserPermission = async (kind: "microphone" | "camera" | "screen") => {
    setPermissionBusy(kind);
    setPermissionMessage(null);
    try {
      if (kind === "screen") {
        if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Screen sharing is not supported by this browser.");
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        stream.getTracks().forEach((track) => track.stop());
        setScreenPermissionResult("Screen sharing is available. The browser will ask each time you start sharing.");
      } else {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Media access is not supported by this browser.");
        const stream = await navigator.mediaDevices.getUserMedia(kind === "microphone" ? { audio: true } : { video: true });
        stream.getTracks().forEach((track) => track.stop());
        setBrowserPermissions((current) => ({ ...current, [kind]: "granted" }));
        setPermissionMessage(`${kind === "microphone" ? "Microphone" : "Camera"} access is allowed.`);
        await refreshBrowserPermissions();
      }
    } catch (cause) {
      const errorName = cause instanceof DOMException ? cause.name : "";
      if (kind !== "screen" && (errorName === "NotAllowedError" || errorName === "SecurityError")) {
        setBrowserPermissions((current) => ({ ...current, [kind]: "denied" }));
        setPermissionMessage("Access is blocked. Allow it in this site’s browser permissions, then try again.");
      } else if (kind === "screen" && (errorName === "NotAllowedError" || errorName === "AbortError")) {
        setScreenPermissionResult("Screen sharing was cancelled. You can try again whenever you’re ready.");
      } else {
        const message = cause instanceof Error ? cause.message : "Permission could not be checked.";
        if (kind === "screen") setScreenPermissionResult(message);
        else setPermissionMessage(message);
      }
    } finally {
      setPermissionBusy(null);
    }
  };

  const rebuildSpeakingUsernames = () => {
    const next = new Set<string>();
    for (const usernames of speakingByVoiceRoomRef.current.values()) {
      for (const username of usernames) next.add(username);
    }
    speakingUsernamesRef.current.clear();
    for (const username of next) speakingUsernamesRef.current.add(username);
    const current = speakingRosterUsernamesRef.current;
    if (current.size !== next.size || [...next].some((username) => !current.has(username))) {
      speakingRosterUsernamesRef.current = next;
      setSpeakingUsernames(next);
    }
  };

  const updateVoiceRoomSpeakers = (room: LiveKitRoomInstance) => {
    const usernames = new Set(room.activeSpeakers.map(voiceParticipantUsername).filter(Boolean));
    if (usernames.size) speakingByVoiceRoomRef.current.set(room, usernames);
    else speakingByVoiceRoomRef.current.delete(room);
    rebuildSpeakingUsernames();
  };

  const reportVoiceActivity = (room: LiveKitRoomInstance | null) => {
    roomRef.current?.send("media-activity", room ? readVoiceRosterActivity(room.localParticipant) : { microphone: false, camera: false, screenShare: false });
  };

  const isCurrentVoiceRoom = (room: LiveKitRoomInstance) => [liveKitRoomRef.current, privateLiveKitRoomRef.current, proximityLiveKitRoomRef.current].includes(room);

  const reportNoiseReductionResult = (result: NoiseReductionResult) => {
      if (noiseReductionEnabledRef.current) {
        setNoiseReductionStatus(result.supported === false ? "fallback" : result.enabled ? "enabled" : "checking");
        if (result.supported === false) setNoiseReductionDetails(result.reason ?? "RNNoise is unavailable. Built-in browser noise reduction remains active.");
      }
      else setNoiseReductionStatus("disabled");
  };

  const configureNoiseReductionForTrack = async (room: LiveKitRoomInstance, track: LocalAudioTrack) => {
    const requestedEnabled = noiseReductionEnabledRef.current;
    if (requestedEnabled) { setNoiseReductionStatus("checking"); setNoiseReductionDetails(""); }
    try {
      const result = await setNoiseReduction(track, requestedEnabled);
      if (!isCurrentVoiceRoom(room)) return;
      reportNoiseReductionResult(result);
    } catch (cause) {
      if (!isCurrentVoiceRoom(room)) return;
      console.warn("Could not apply microphone noise reduction; keeping browser audio processing enabled.", cause);
      setNoiseReductionStatus(noiseReductionEnabledRef.current ? "fallback" : "disabled");
      setNoiseReductionDetails(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const applyNoiseReductionToActiveTracks = async (enabled: boolean) => {
    const rooms = [liveKitRoomRef.current, privateLiveKitRoomRef.current, proximityLiveKitRoomRef.current];
    const tracks = new Set<LocalAudioTrack>();
    for (const room of rooms) {
      if (!room) continue;
      for (const publication of room.localParticipant.audioTrackPublications.values()) {
        if (String(publication.source).toLowerCase() !== "microphone") continue;
        const track = publication.audioTrack;
        if (track) tracks.add(track);
      }
    }
    if (tracks.size === 0) {
      setNoiseReductionStatus(enabled ? "unknown" : "disabled");
      return;
    }
    if (enabled) setNoiseReductionStatus("checking");
    const results = await Promise.all([...tracks].map(async (track): Promise<NoiseReductionResult & { error?: string }> => {
      try { return await setNoiseReduction(track, enabled); }
      catch (cause) {
        console.warn("Could not update microphone noise reduction.", cause);
        return { supported: false, enabled: false, error: cause instanceof Error ? cause.message : String(cause) };
      }
    }));
    if (!noiseReductionEnabledRef.current) setNoiseReductionStatus("disabled");
    else if (results.some((result) => result.supported === false)) {
      setNoiseReductionStatus("fallback");
      setNoiseReductionDetails(results.find((result) => "reason" in result)?.reason ?? results.find((result) => "error" in result)?.error ?? "RNNoise is unavailable. Built-in browser noise reduction remains active.");
    }
    else if (results.some((result) => result.enabled)) { setNoiseReductionStatus("enabled"); setNoiseReductionDetails(""); }
    else setNoiseReductionStatus("checking");
  };

  const switchMicrophoneDevice = async (deviceId: string) => {
    const previous = audioDevicePreferencesRef.current;
    const next = { ...previous, inputDeviceId: deviceId };
    audioDevicePreferencesRef.current = next;
    setAudioDevicePreferences(next);
    saveAudioInputDevice(deviceId);
    const rooms = [liveKitRoomRef.current, privateLiveKitRoomRef.current, proximityLiveKitRoomRef.current].filter((room): room is LiveKitRoomInstance => Boolean(room));
    try {
      await Promise.all(rooms.map((room) => room.switchActiveDevice("audioinput", deviceId || "default")));
    } catch (cause) {
      await Promise.allSettled(rooms.map((room) => room.switchActiveDevice("audioinput", previous.inputDeviceId || "default")));
      audioDevicePreferencesRef.current = previous;
      setAudioDevicePreferences(previous);
      saveAudioInputDevice(previous.inputDeviceId);
      throw cause;
    }
  };

  const switchSpeakerDevice = async (deviceId: string) => {
    const previous = audioDevicePreferencesRef.current;
    const next = { ...previous, outputDeviceId: deviceId };
    let context = remoteAudioContextRef.current;
    if (!context && window.AudioContext) {
      context = new window.AudioContext();
      remoteAudioContextRef.current = context;
      void context.resume().catch(() => undefined);
    }
    const sinkContext = context as (AudioContext & { setSinkId?: (sinkId: string) => Promise<void> }) | null;
    const previousSinkId = previous.outputDeviceId;
    const rooms = [liveKitRoomRef.current, privateLiveKitRoomRef.current, proximityLiveKitRoomRef.current].filter((room): room is LiveKitRoomInstance => Boolean(room));
    audioDevicePreferencesRef.current = next;
    setAudioDevicePreferences(next);
    saveAudioOutputDevice(deviceId);
    try {
      if (sinkContext?.setSinkId) await sinkContext.setSinkId(deviceId);
      else if (context && (deviceId || previousSinkId)) throw new Error("This browser cannot switch speakers while voice audio is playing.");
      else await Promise.all(rooms.map((room) => room.switchActiveDevice("audiooutput", deviceId || "default")));
    } catch (cause) {
      if (!sinkContext?.setSinkId && !context) await Promise.allSettled(rooms.map((room) => room.switchActiveDevice("audiooutput", previousSinkId || "default")));
      audioDevicePreferencesRef.current = previous;
      setAudioDevicePreferences(previous);
      saveAudioOutputDevice(previous.outputDeviceId);
      if (sinkContext?.setSinkId) await sinkContext.setSinkId(previousSinkId).catch(() => undefined);
      throw cause;
    }
  };

  const switchCameraDevice = async (deviceId: string) => {
    const previousPreferences = readMediaDevicePreferences();
    const nextDeviceId = deviceId || "default";
    const rooms = [liveKitRoomRef.current, privateLiveKitRoomRef.current, proximityLiveKitRoomRef.current]
      .filter((room): room is LiveKitRoomInstance => Boolean(room));
    try {
      await Promise.all(rooms.map((room) => room.switchActiveDevice("videoinput", nextDeviceId, nextDeviceId !== "default")));
      persistMediaDevicePreferences({ ...previousPreferences, videoinput: nextDeviceId });
      setCameraDeviceId(nextDeviceId);
    } catch (cause) {
      await Promise.allSettled(rooms.map((room) => room.switchActiveDevice("videoinput", previousPreferences.videoinput, previousPreferences.videoinput !== "default")));
      throw cause;
    }
  };

  const changeCameraBackgroundMode = async (mode: CameraBackgroundMode) => {
    const previousMode = cameraBackgroundModeRef.current;
    const { Track } = await import("livekit-client");
    const rooms = [liveKitRoomRef.current, privateLiveKitRoomRef.current, proximityLiveKitRoomRef.current]
      .filter((room): room is LiveKitRoomInstance => Boolean(room));
    const tracks = rooms.map((room) => room.localParticipant.getTrackPublication(Track.Source.Camera)?.track)
      .filter((track): track is LocalVideoTrack => Boolean(track && track.kind === Track.Kind.Video));
    try {
      await Promise.all(tracks.map((track) => applyCameraBackgroundMode(track, mode)));
      saveCameraBackgroundMode(mode);
      cameraBackgroundModeRef.current = mode;
      setCameraBackgroundMode(mode);
    } catch (cause) {
      await Promise.allSettled(tracks.map((track) => applyCameraBackgroundMode(track, previousMode)));
      throw cause;
    }
  };

  const syncLocalMediaControls = (room: LiveKitRoomInstance) => {
    const publications = [...room.localParticipant.videoTrackPublications.values()].filter((publication) => publication.track && !publication.isMuted);
    setCameraEnabled(publications.some((publication) => String(publication.source ?? publication.track?.source).toLowerCase().includes("camera")));
    setScreenShareEnabled(publications.some((publication) => String(publication.source ?? publication.track?.source).toLowerCase().includes("screen")));
  };
  const getProximityAudioFade = (username: string) => {
    const local = localSessionIdRef.current ? playersRef.current.get(localSessionIdRef.current) : undefined;
    const onlinePlayers = [...playersRef.current.values()].filter((player) => player.presence === "online");
    const remote = onlinePlayers.find((player) => player.username.toLocaleLowerCase() === username.toLocaleLowerCase());
    if (!local || !remote) return 0;
    const distance = Math.hypot(local.x - remote.x, local.z - remote.z);
    const fade = Math.max(0, Math.min(1, (CAMPUS_WORLD.proximityRadius - distance) / (CAMPUS_WORLD.proximityRadius - CAMPUS_WORLD.voiceFullVolumeRadius)));
    return fade * fade * (3 - 2 * fade);
  };

  const updateProximityAudioVolumes = () => {
    for (const { track, username } of proximityAudioTracksRef.current.values()) {
      const level = participantAudioLevelsRef.current.get(username.toLocaleLowerCase()) ?? 1;
      track.setVolume(getProximityAudioFade(username) * level);
    }
  };

  const setParticipantAudioLevel = (username: string, requestedLevel: number) => {
    const key = username.toLocaleLowerCase();
    const next = Math.max(0, Math.min(1.5, requestedLevel));
    participantAudioLevelsRef.current.set(key, next);
    setParticipantAudioLevels(new Map(participantAudioLevelsRef.current));
    saveVoiceParticipantAudioLevels(participantAudioLevelsRef.current);
    for (const [identity, entry] of remoteAudioTracksRef.current) {
      if (entry.username !== key) continue;
      const proximityTrack = proximityAudioTracksRef.current.get(identity)?.track === entry.track;
      entry.track.setVolume(next * (proximityTrack ? getProximityAudioFade(entry.username) : 1));
    }
  };

  const moderateVoiceMedia = async (source: "microphone" | "camera" | "screen_share", targetUsername?: string) => {
    const office = activeOffice;
    if (!office) return;
    const targetLabel = targetUsername ?? "all participants in this voice zone";
    const sourceLabel = source === "microphone" ? "microphone" : source === "camera" ? "camera" : "screen share";
    if (!targetUsername && !window.confirm(`Mute ${sourceLabel} for ${targetLabel}? They may be able to turn it on again.`)) return;
    setVoiceMediaNotice(null);
    try {
      const response = await fetch(`${endpoint}/media/moderate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId: office.id, targetUsername, source, all: !targetUsername }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; mutedTracks?: number };
      if (!response.ok) throw new Error(result.error ?? "Could not mute media.");
      setVoiceMediaNotice(`Muted ${sourceLabel} for ${targetLabel}.`);
    } catch (cause) {
      setVoiceMediaNotice(cause instanceof Error ? cause.message : "Could not mute media.");
    }
  };

  const selectOffice = (office: Office, syncUrl = true) => {
    exitMapEditMode();
    localStorage.setItem("gammyverse.activeOfficeId", office.id);
    if (syncUrl && window.location.pathname !== `/office/${office.id}`) {
      window.history.pushState({ officeId: office.id }, "", `/office/${office.id}`);
    }
    setRoutePath(window.location.pathname);
    travel.reset();
    setActiveOffice((current) => current?.id === office.id ? current : office);
  };

  const closeMapEditMode = () => {
    roomRef.current?.send("map-edit-lock", { active: false });
    setMapEditLockRequestPending(false);
    setMapEditMode(false);
    setMapEditBaseline(null);
    setMapConflictLatest(null);
    setSpawnPlacementMode(false);
    setMapZoneDrawing(false);
    setMapZoneArea(null);
    setSelectedMapZoneId(null);
    setMapBuildingPickerOpen(false);
    setSelectedMapBuildingAsset(null);
    setSelectedModifyPropId(null);
    setModifyPropsOpen(false);
  };

  const exitMapEditMode = () => {
    setOfficeMapLayout((current) => mapEditBaseline ?? current);
    closeMapEditMode();
  };

  const clearSelectedOffice = (syncUrl = true) => {
    localStorage.removeItem("gammyverse.activeOfficeId");
    exitMapEditMode();
    if (syncUrl && (getOfficeRouteId() || getMeetingRouteOfficeId(window.location.pathname))) window.history.pushState({}, "", "/");
    if (syncUrl) setRoutePath(window.location.pathname);
    setActiveOffice(null);
    setMeetingEntry(false);
  };

  useEffect(() => {
    if (!activeOffice) return;
    localStorage.setItem("gammyverse.activeOfficeId", activeOffice.id);
    if (window.location.pathname !== `/office/${activeOffice.id}`) {
      window.history.replaceState({ officeId: activeOffice.id }, "", `/office/${activeOffice.id}`);
      setRoutePath(window.location.pathname);
    }
  }, [activeOffice]);

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      setRoutePath(path);
      setMeetingEntry(Boolean(getMeetingRouteOfficeId(path)));
      // Session and office membership are verified before restoring an office
      // from browser history. Never let a stale history entry revive a room.
      if (!authReady || !authUser) {
        setActiveOffice(null);
        return;
      }
      const officeId = getOfficeRouteId(path) ?? getMeetingRouteOfficeId(path);
      if (!officeId) {
        clearSelectedOffice(false);
        setLobbyError(null);
        return;
      }
      const office = offices.find((candidate) => candidate.id === officeId);
      if (office) {
        selectOffice(office, false);
      } else if (offices.length > 0 || !initialLobbyLoading) {
        localStorage.removeItem("gammyverse.activeOfficeId");
        exitMapEditMode();
        setActiveOffice(null);
        setLobbyError("You do not have access to that office.");
        window.history.replaceState(null, "", "/");
        setRoutePath("/");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [offices, authReady, authUser, initialLobbyLoading]);

  useEffect(() => {
    if (!authReady || !authUser || !officeListVerified || initialLobbyLoading) return;
    const officeId = getOfficeRouteId(routePath) ?? getMeetingRouteOfficeId(routePath);
    if (!officeId || activeOffice?.id === officeId) return;
    const destination = offices.find((candidate) => candidate.id === officeId);
    if (destination) {
      selectOffice(destination, false);
      return;
    }
    localStorage.removeItem("gammyverse.activeOfficeId");
    exitMapEditMode();
    setActiveOffice(null);
    setLobbyError("You do not have access to that office.");
    window.history.replaceState(null, "", "/");
    setRoutePath("/");
  }, [authReady, authUser, officeListVerified, initialLobbyLoading, offices, routePath, activeOffice?.id]);

  useEffect(() => {
    if (!authUser || !activeOffice) { setOfficeMapLayout(null); setMapEditBaseline(null); return; }
    let cancelled = false;
    setOfficeMapLayout(null);
    setMapConfigVersion(1);
    void fetch(`${endpoint}/offices/${activeOffice.id}/map`, { credentials: "include" })
      .then(async (response) => {
        const result = await response.json() as { config?: unknown; configVersion?: number };
        if (!response.ok || cancelled || !result.config || !Number.isInteger(result.configVersion) || result.configVersion! < mapConfigVersionRef.current) return;
        setMapConfigVersion(result.configVersion!);
        setOfficeMapLayout(readRoomLayout(result.config));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authUser?.username, activeOffice?.id]);

  const toggleMicrophone = () => voiceSessionRef.current?.setMuted(!selectedMicMuted);
  const toggleCamera = () => voiceSessionRef.current?.control(async (room) => {
    const enable = !cameraEnabled;
    await room.localParticipant.setCameraEnabled(enable, CAMERA_CAPTURE_720P30, {
      videoEncoding: { maxBitrate: CAMERA_MAX_BITRATE_BPS, maxFramerate: MEDIA_MAX_FRAMERATE_FPS },
      degradationPreference: MEDIA_DEGRADATION_PREFERENCE,
    });
    if (enable && cameraBackgroundModeRef.current !== "off") {
      const { Track } = await import("livekit-client");
      const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
      if (track && track.kind === Track.Kind.Video) {
        try { await applyCameraBackgroundMode(track as LocalVideoTrack, cameraBackgroundModeRef.current); }
        catch (cause) {
          setVoiceMediaNotice(cause instanceof Error ? cause.message : "Could not apply the camera background effect.");
        }
      }
    }
  }, "camera");
  const toggleScreenShare = () => voiceSessionRef.current?.control(async (room) => {
    const sharing = screenShareEnabled;
    const tracks = sharing
      ? [...room.localParticipant.videoTrackPublications.values(), ...room.localParticipant.audioTrackPublications.values()]
        .filter(publication => ["screen_share", "screen_share_audio"].includes(String(publication.source)))
        .map(publication => publication.track).filter((track): track is NonNullable<typeof track> => Boolean(track))
      : [];
    await room.localParticipant.setScreenShareEnabled(!sharing, SCREEN_CAPTURE_1080P30, {
      screenShareEncoding: { maxBitrate: SCREEN_MAX_BITRATE_BPS, maxFramerate: MEDIA_MAX_FRAMERATE_FPS },
      degradationPreference: MEDIA_DEGRADATION_PREFERENCE,
    });
    tracks.forEach(track => track.stop());
  }, "screen_share");

  const voiceListener: VoiceSessionListener<LiveKitRoomInstance> = {
    stateChanged: (state) => {
      voiceMutedIntentRef.current = state.muted;
      setVoiceConnected(state.connected && state.target?.kind === "meeting");
      setPrivateVoiceConnected(state.connected && state.target?.kind === "private");
      setProximityVoiceConnected(state.connected && state.target?.kind === "proximity");
      setVoiceMuted(state.muted); setPrivateVoiceMuted(state.muted); setProximityVoiceMuted(state.muted);
      if (!state.target) { setCameraEnabled(false); setScreenShareEnabled(false); }
      setVoiceError(state.error?.message ?? null);
      setVoiceRetryExhausted(state.retryExhausted);
    },
    roomChanged: (room, target) => {
      remoteMediaViewer.roomChanged(room);
      voiceActivityRoomCleanupRef.current?.();
      voiceActivityRoomCleanupRef.current = null;
      speakingByVoiceRoomRef.current.clear();
      speakingUsernamesRef.current.clear();
      speakingRosterUsernamesRef.current = new Set();
      setSpeakingUsernames(new Set());
      proximityAudioTracksRef.current.clear();
      setZoneAudioUsernames(new Set());
      remoteAudioTracksRef.current.clear();
      audioOutputRef.current?.replaceChildren();
      liveKitRoomRef.current = target?.kind === "meeting" ? room : null;
      privateLiveKitRoomRef.current = target?.kind === "private" ? room : null;
      proximityLiveKitRoomRef.current = target?.kind === "proximity" ? room : null;
      if (room) {
        void applyAudioInputPreference(room, audioDevicePreferencesRef.current).catch((cause) => console.warn("Could not apply the saved microphone.", cause));
        if (!remoteAudioContextRef.current && audioDevicePreferencesRef.current.outputDeviceId) {
          void room.switchActiveDevice("audiooutput", audioDevicePreferencesRef.current.outputDeviceId).catch((cause) => console.warn("Could not apply the saved speaker.", cause));
        }
      }
      if (room) {
        const refresh = () => reportVoiceActivity(room);
        const events = ["participantConnected", "participantDisconnected", "trackPublished", "trackUnpublished", "trackMuted", "trackUnmuted", "localTrackPublished", "localTrackUnpublished"] as RoomEvent[];
        for (const event of events) room.on(event, refresh);
        voiceActivityRoomCleanupRef.current = () => { for (const event of events) room.off(event, refresh); };
        refresh();
      } else reportVoiceActivity(null);
    },
    participantsChanged: remoteMediaViewer.participantsChanged,
    speakersChanged: updateVoiceRoomSpeakers,
    localTracksChanged: (room, publication) => {
      syncLocalMediaControls(room);
      reportVoiceActivity(room);
      if (publication?.source === VOICE_MICROPHONE_SOURCE && publication.audioTrack) void configureNoiseReductionForTrack(room, publication.audioTrack);
    },
    trackSubscribed: (_voiceRoom, track, _publication, participant, target) => {
      const username = voiceParticipantUsername(participant);
      if (track.kind === VOICE_AUDIO_KIND) {
        const audioTrack = track as RemoteAudioTrack;
        setZoneAudioUsernames(current => new Set([...current, username]));
        remoteAudioTracksRef.current.set(participant.identity, { track: audioTrack, username });
        if (target.kind === "proximity") {
          proximityAudioTracksRef.current.set(participant.identity, { track: audioTrack, username });
          updateProximityAudioVolumes();
        } else audioTrack.setVolume(participantAudioLevelsRef.current.get(username) ?? 1);
        attachRemoteAudio(audioTrack);
      }
    },
    trackUnsubscribed: (_room, track, participant) => {
      if (track.kind === VOICE_AUDIO_KIND) setZoneAudioUsernames(current => { const next = new Set(current); next.delete(voiceParticipantUsername(participant)); return next; });
      if (proximityAudioTracksRef.current.get(participant.identity)?.track === track) proximityAudioTracksRef.current.delete(participant.identity);
      if (remoteAudioTracksRef.current.get(participant.identity)?.track === track) remoteAudioTracksRef.current.delete(participant.identity);
      if (track.kind === VOICE_AUDIO_KIND) track.detach().forEach(element => element.remove());
    },
    mediaStopped: () => setVoiceMediaNotice(VOICE_MEDIA_STOPPED_LABEL),
  };

  useEffect(() => {
    if (!activeOffice || !authUser) return;
    const session = createOfficeMediaSession({
      initialMuted: availabilityPolicy(userStatusRef.current).suppressAutomaticMedia || voiceMutedIntentRef.current, previousTeardown: voiceTeardownRef.current,
      createRoom: createVoiceRoom,
      fetchToken: (target, signal) => fetchVoiceToken(endpoint, target, signal),
    }, voiceListener);
    voiceSessionRef.current = session;
    const suspend = () => session.suspend("browser");
    const resume = () => {
      roomRef.current?.send("request-spatial-state");
      session.resume(voiceTargetRef.current, "browser");
    };
    document.addEventListener("freeze", suspend);
    document.addEventListener("resume", resume);
    window.addEventListener("pagehide", suspend);
    window.addEventListener("pageshow", resume);
    return () => {
      document.removeEventListener("freeze", suspend);
      document.removeEventListener("resume", resume);
      window.removeEventListener("pagehide", suspend);
      window.removeEventListener("pageshow", resume);
      voiceTeardownRef.current = session.dispose();
      if (voiceSessionRef.current === session) voiceSessionRef.current = null;
    };
  }, [activeOffice?.id, authUser?.username, voiceRealtimeSessionKey]);

  useEffect(() => {
    if (mediaSuppressed) {
      voiceMutedIntentRef.current = true;
      setWaveAlerts([]);
      setFollowAlerts([]);
    }
    const admission = conversationAdmissionIntentRef.current.receive(conversation, voiceRealtimeSessionKey);
    applyConversationMediaIntent(voiceSessionRef.current, conversationTarget, listening.effectiveMode, admission, mediaSuppressed);
  }, [conversationTarget?.officeId, conversationTarget?.sessionKey, conversationTarget?.kind, conversationTarget?.id,
    conversationTarget?.conversationId, conversationTarget?.conversationGeneration, conversationTarget?.roomIncarnationId, conversationTarget?.mode,
    mediaSuppressed, listening.effectiveMode, conversationAdmitted, conversationKnown, conversation?.admissionLeaseId, voiceRealtimeSessionKey]);

  const officeShare = useOfficeShareLinks(endpoint, window.location.origin, authUser?.username ?? null);
  const signOut = useSignOutConfirmation(endpoint, authUser?.username ?? null, () => returnToSignIn(null));

  const returnToSignIn = (reason: string | null = "Your sign-in session expired. Please sign in again.") => {
    positionStorageEpochRef.current += 1;
    clearLastOfficePositions();
    voiceSessionRef.current?.dispose();
    privateZoneIdRef.current = null; setPrivateZoneId(null);
    proximityGroupIdRef.current = null;
    setProximityGroupId(null);
    setAuthUser(null);
    clearSelectedOffice();
    setOffices([]);
    setInvites([]);
    setOfficeListVerified(false);
    setAuthError(reason);
    setStatus("disconnected");
    setError(null);
    setPeople([]);
    setPlayerCount(0);
  };

  useEffect(() => {
    if (!authReady || !connectionUsername) return;
    let disposed = false;
    const load = async () => {
      setLobbyBusy(true);
      setInitialLobbyLoading(true);
      try {
        const currentPath = routePathRef.current;
        const invitedOfficeId = await acceptOfficeEntryLink(endpoint, currentPath);
        if (disposed) return;
        if (invitedOfficeId) {
          window.history.replaceState(null, "", "/");
          setRoutePath("/");
        }
        let response = await fetch(`${endpoint}/offices`, { credentials: "include" });
        let result = await response.json() as { offices?: Office[]; invites?: OfficeInvite[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load offices.");
        const directOfficeId = getOfficeRouteId(currentPath) ?? getMeetingRouteOfficeId(currentPath);
        if (!invitedOfficeId && directOfficeId && !(result.offices ?? []).some((office) => office.id === directOfficeId)) {
          const acceptedPendingInvite = await acceptPendingOfficeInvite(endpoint, directOfficeId, result.invites ?? []);
          if (acceptedPendingInvite) {
            response = await fetch(`${endpoint}/offices`, { credentials: "include" });
            result = await response.json() as { offices?: Office[]; invites?: OfficeInvite[]; error?: string };
            if (!response.ok) throw new Error(result.error ?? "Could not load offices.");
          }
        }
        if (!disposed) {
          setOfficeListVerified(true);
          setOffices(result.offices ?? []); setInvites(result.invites ?? []); setLobbyError(null);
          if (invitedOfficeId) {
            const destination = (result.offices ?? []).find((office) => office.id === invitedOfficeId);
            if (destination) selectOffice(destination);
            else setLobbyError("Invite accepted, but the office is not available.");
          } else if (getOfficeRouteId(currentPath) || getMeetingRouteOfficeId(currentPath)) {
            const officeId = getOfficeRouteId(currentPath) ?? getMeetingRouteOfficeId(currentPath)!;
            const destination = (result.offices ?? []).find((office) => office.id === officeId);
            if (destination) selectOffice(destination);
            else {
              setLobbyError("You need an invitation for this account before opening the office. Ask an office admin to invite your username or send you a one-time invite link.");
              localStorage.removeItem("gammyverse.activeOfficeId");
              window.history.replaceState(null, "", "/");
              setRoutePath("/");
              setMeetingEntry(false);
            }
          } else if (currentPath.startsWith("/office/") || currentPath.startsWith("/meeting/")) {
            setLobbyError("That office link is invalid.");
            localStorage.removeItem("gammyverse.activeOfficeId");
            window.history.replaceState(null, "", "/");
            setRoutePath("/");
            setMeetingEntry(false);
          } else if (currentPath.replace(/\/+$/, "") !== "/maintainer/diagnostics") {
            const savedOfficeId = localStorage.getItem("gammyverse.activeOfficeId");
            const destination = (result.offices ?? []).find((office) => office.id === savedOfficeId);
            if (destination) selectOffice(destination);
            else localStorage.removeItem("gammyverse.activeOfficeId");
          }
        }
      } catch (cause) {
        if (!disposed) setLobbyError(cause instanceof Error ? cause.message : "Could not load offices.");
      } finally {
        if (!disposed) { setLobbyBusy(false); setInitialLobbyLoading(false); }
      }
    };
    void load();
    return () => { disposed = true; };
  }, [authReady, connectionUsername]);


  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLobbyBusy(true); setAccountError(null);
    try {
      const response = await fetch(`${endpoint}/auth/password/change`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const result = await response.json() as { user?: AuthUser; error?: string };
      if (!response.ok || !result.user) throw new Error(result.error ?? "Could not change password.");
      setAuthUser(result.user); setCurrentPassword(""); setNewPassword(""); setChangePasswordOpen(false);
    } catch (cause) { setAccountError(cause instanceof Error ? cause.message : "Could not change password."); }
    finally { setLobbyBusy(false); }
  };

  const issueResetLink = async (username: string) => {
    setAccountError(null);
    try {
      const response = await fetch(`${endpoint}/maintainer/users/${encodeURIComponent(username)}/password-reset`, { method: "POST", credentials: "include" });
      const result = await response.json() as { resetPath?: string; expiresAt?: string; error?: string };
      if (!response.ok || !result.resetPath) throw new Error(result.error ?? "Could not create reset link.");
      setResetUrls((current) => ({ ...current, [username]: `${window.location.origin}${result.resetPath}` }));
    } catch (cause) { setAccountError(cause instanceof Error ? cause.message : "Could not create reset link."); }
  };

  const submitPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!resetLinkToken) return; setResetBusy(true); setResetError(null);
    try {
      const response = await fetch(`${endpoint}/auth/password/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: resetLinkToken, password: resetPassword }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not reset password.");
      setResetDone(true); setResetPassword(""); window.history.replaceState(null, "", "/"); setRoutePath("/");
    } catch (cause) { setResetError(cause instanceof Error ? cause.message : "Could not reset password."); }
    finally { setResetBusy(false); }
  };

  const createOfficeAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let generatedLayout: RoomLayout;
    try {
      generatedLayout = createCampusOfficeDraft({ totalPeople: generatorTotalPeople, peoplePerTeam: createOfficePeoplePerTeam, teamCount: generatorTeamCount, seed: Math.floor(Math.random() * 0x1_0000_0000) }, createOfficeInteriors).layout;
    } catch (cause) {
      setLobbyError(cause instanceof Error ? cause.message : "Check the team and people counts.");
      return;
    }
    setLobbyBusy(true);
    setLobbyError(null);
    const outcome = await createOfficeWithLayout({ endpoint, name: officeName, layout: generatedLayout });
    if (outcome.office) setOffices((current) => [outcome.office!, ...current]);
    if (!outcome.ok) {
      // The office row can already be durable, but a half-saved office is not a
      // success: keep the dialog open with the failure instead of walking the
      // owner into an empty space.
      setLobbyError(outcome.error);
      setLobbyBusy(false);
      return;
    }
    setOfficeName("");
    setCreateOfficeDialogOpen(false);
    setLobbyBusy(false);
    selectOffice(outcome.office);
  };

  const deleteManagedOffice = async () => {
    if (!managingOffice || officeDeleteName.trim() !== managingOffice.name) return;
    setLobbyBusy(true);
    setOfficeDeleteError(null);
    try {
      const response = await fetch(`${endpoint}/offices/${managingOffice.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? "Could not delete office.");
      }
      setOffices((current) => current.filter((office) => office.id !== managingOffice.id));
      if (localStorage.getItem("gammyverse.activeOfficeId") === managingOffice.id) clearSelectedOffice();
      setManagingOffice(null);
      setOfficeDeleteConfirmOpen(false);
      setOfficeDeleteName("");
      setLobbyError(null);
    } catch (cause) {
      setOfficeDeleteError(cause instanceof Error ? cause.message : "Could not delete office.");
    } finally { setLobbyBusy(false); }
  };

  const acceptInvite = async (inviteId: string) => {
    setLobbyBusy(true);
    try {
      const response = await fetch(`${endpoint}/office-invites/accept`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Invite could not be accepted.");
      setInvites((current) => current.filter((invite) => invite.id !== inviteId));
      const list = await fetch(`${endpoint}/offices`, { credentials: "include" });
      const next = await list.json() as { offices?: Office[] };
      const nextOffices = next.offices ?? [];
      setOffices(nextOffices);
      if (meetingLinkOfficeId) {
        const destination = nextOffices.find((office) => office.id === meetingLinkOfficeId);
        if (destination) {
          selectOffice(destination);
          window.history.replaceState(null, "", "/");
        }
      }
      setLobbyError(null);
    } catch (cause) { setLobbyError(cause instanceof Error ? cause.message : "Invite could not be accepted."); }
    finally { setLobbyBusy(false); }
  };

  const openOfficeManager = async (office: Office) => {
    setLobbyBusy(true);
    setLobbyError(null);
    setOfficeDeleteConfirmOpen(false);
    setOfficeDeleteName("");
    setOfficeDeleteError(null);
    try {
      const response = await fetch(`${endpoint}/offices/${office.id}`, { credentials: "include" });
      const result = await response.json() as { members?: OfficeMember[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not load office members.");
      setOfficeMembers(result.members ?? []);
      setManagedOfficeName(office.name);
      setInviteUsername("");
      setInviteRole("user");
      setInviteUrl(null);
      setManagingOffice(office);
    } catch (cause) { setLobbyError(cause instanceof Error ? cause.message : "Could not load office members."); }
    finally { setLobbyBusy(false); }
  };

  const loadMapForEditing = async (office: Office) => {
    setLobbyBusy(true);
    setLobbyError(null);
    try {
      const [response, propsResponse] = await Promise.all([
        fetch(`${endpoint}/offices/${office.id}/map`, { credentials: "include" }),
        fetch(`${endpoint}/offices/${office.id}/props`, { credentials: "include" }),
      ]);
      const [result, propsResult] = await Promise.all([
        response.json() as Promise<{ config?: unknown; configVersion?: number; error?: string }>,
        propsResponse.json() as Promise<{ props?: RoomLayoutProp[]; configVersion?: number; error?: string }>,
      ]);
      if (!response.ok || !result.config) throw new Error(result.error ?? "Could not load the office map.");
      if (!propsResponse.ok || !Array.isArray(propsResult.props)) throw new Error(propsResult.error ?? "Could not load the office props.");
      const layout = { ...readRoomLayout(result.config), props: propsResult.props };
      setMapZoneArea(null);
      setMapZoneDrawing(false);
      setSpawnPlacementMode(false);
      setSelectedDeskZoneId(null);
      setOfficeMapLayout(layout);
      setMapEditBaseline(layout);
      setMapConfigVersion(result.configVersion ?? 1);
      setMapPropsConfigVersion(propsResult.configVersion ?? 1);
      setMapConflictLatest(null);
      setMapEditMode(true);
      heldKeysRef.current.clear();
      sendMovementInput({ x: 0, z: 0, sprint: false });
      setWorkspacePanelOpen(false);
      setCharacterPanelOpen(false);
    } catch (cause) {
      roomRef.current?.send("map-edit-lock", { active: false });
      setLobbyError(cause instanceof Error ? cause.message : "Could not load the office map.");
    }
    finally { setLobbyBusy(false); }
  };

  const enterMapEditMode = (office: Office) => {
    if (office.role !== "owner" && office.role !== "admin") return;
    const room = roomRef.current;
    if (!room) { setLobbyError("Connect to the office before editing its map."); return; }
    if (mapEditLockRequestPending) return;
    setMapEditLockRequestPending(true);
    setLobbyError(null);
    room.send("map-edit-lock", { active: true });
  };

  const enterModifyPropsMode = async () => {
    if (!activeOffice || !officeMapLayout || modifyPropsBusy) return;
    setModifyPropsBusy(true);
    setModifyPropsError(null);
    try {
      const response = await fetch(`${endpoint}/offices/${activeOffice.id}/props`, { credentials: "include" });
      const result = await response.json() as { props?: RoomLayoutProp[]; configVersion?: number; error?: string };
      if (!response.ok || !Array.isArray(result.props)) throw new Error(result.error ?? "Could not load office props.");
      setModifyPropsDraft(result.props);
      setModifyPropsVersion(result.configVersion ?? 1);
      setSelectedModifyPropId(null);
      setSelectedModifyPropAsset(null);
      setModifyPropsOpen(true);
      setWorkspacePanelOpen(false);
      setCharacterPanelOpen(false);
    } catch (cause) {
      setLobbyError(cause instanceof Error ? cause.message : "Could not load office props.");
    } finally { setModifyPropsBusy(false); }
  };

  const saveModifyProps = async (props: RoomLayoutProp[]) => {
    if (!activeOffice) return;
    setModifyPropsError(null);
    const response = await fetch(`${endpoint}/offices/${activeOffice.id}/props`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ props, configVersion: modifyPropsVersion }) });
    const result = await response.json() as { props?: RoomLayoutProp[]; configVersion?: number; error?: string };
    if (!response.ok || !Array.isArray(result.props)) {
      const message = response.status === 409 ? "Another member saved office props while you were editing. Close and reopen the editor to load their changes." : result.error ?? "Could not save office props.";
      setModifyPropsError(message);
      throw new Error(message);
    }
    setModifyPropsVersion(result.configVersion ?? modifyPropsVersion + 1);
    setModifyPropsDraft(result.props);
    setOfficeMapLayout((layout) => layout ? { ...layout, props: result.props! } : layout);
    setModifyPropsOpen(false);
    setSelectedModifyPropAsset(null);
  };

  const placeOfficeProp = (asset: RoomLayoutProp["asset"], position: { x: number; z: number; elevation?: number }) => {
    const definition = ROOM_PROP_CATALOG.find((item) => item.asset === asset);
    if (!definition) return;
    const id = `prop-${crypto.randomUUID()}`;
    const x = Math.max(-mapDimensions.width / 2 + definition.width / 2, Math.min(mapDimensions.width / 2 - definition.width / 2, position.x));
    const z = Math.max(-mapDimensions.depth / 2 + definition.depth / 2, Math.min(mapDimensions.depth / 2 - definition.depth / 2, position.z));
    setModifyPropsDraft((current) => {
      // Resolve height against the final clamped point and latest draft. This
      // keeps stacked shelf/tabletop placement from saving a stale preview Y.
      const support = roomPropPlacementSupport(current, asset, x, z);
      if (definition.placementClass === "small" && !support) return current;
      const elevation = support?.elevation ?? 0;
      const prop: RoomLayoutProp = { id, asset, x, z, rotation: 0, collision: definition.collision, width: definition.width, depth: definition.depth, ...(elevation > 0 ? { elevation } : {}) };
      return [...current, prop];
    });
    setSelectedModifyPropId(id);
  };

  const placeMapBuilding = (asset: RoomLayoutProp["asset"], position: { x: number; z: number; elevation?: number }) => {
    const definition = ROOM_PROP_CATALOG.find((item) => item.asset === asset && (item.editorRole === "building-prefab" || item.editorRole === "map-component"));
    if (!definition) return;
    const id = `map-building-${crypto.randomUUID()}`;
    const x = Math.max(-mapDimensions.width / 2 + definition.width / 2, Math.min(mapDimensions.width / 2 - definition.width / 2, position.x));
    const z = Math.max(-mapDimensions.depth / 2 + definition.depth / 2, Math.min(mapDimensions.depth / 2 - definition.depth / 2, position.z));
    setOfficeMapLayout((layout) => {
      if (!layout) return layout;
      const support = roomPropPlacementSupport(layout.props, asset, x, z);
      const elevation = support?.elevation ?? 0;
      const prop: RoomLayoutProp = { id, asset, x, z, rotation: 0, collision: definition.collision, width: definition.width, depth: definition.depth, ...(elevation > 0 ? { elevation } : {}) };
      return { ...layout, props: [...layout.props, prop] };
    });
    setSelectedModifyPropId(id);
  };

  const moveOfficeProp = (id: string, position: { x: number; z: number; elevation?: number }) => {
    setModifyPropsDraft((current) => current.map((prop) => {
      if (prop.id !== id) return prop;
      const support = roomPropPlacementSupport(current.filter((item) => item.id !== id), prop.asset, position.x, position.z, prop.rotation);
      const definition = ROOM_PROP_CATALOG.find((item) => item.asset === prop.asset);
      if (definition?.placementClass === "small" && !support) return prop;
      const elevation = support?.elevation ?? 0;
      return { ...prop, x: position.x, z: position.z, ...(elevation > 0 ? { elevation } : { elevation: undefined }) };
    }));
  };

  const rotateOfficeProp = (id: string) => setModifyPropsDraft((current) => current.map((prop) => {
    if (prop.id !== id) return prop;
    const rotation = (prop.rotation + Math.PI / 2) % (Math.PI * 2);
    const cos = Math.abs(Math.cos(rotation));
    const sin = Math.abs(Math.sin(rotation));
    const footprintWidth = prop.width * cos + prop.depth * sin;
    const footprintDepth = prop.depth * cos + prop.width * sin;
    const snapCenter = (center: number, footprint: number, boundary: number) => {
      const half = footprint / 2;
      const maxCell = Math.max(0, Math.floor(boundary - footprint));
      return Math.min(maxCell, Math.max(0, Math.round(center - half))) + half;
    };
    const x = snapCenter(prop.x + mapDimensions.width / 2, footprintWidth, mapDimensions.width) - mapDimensions.width / 2;
    const z = snapCenter(prop.z + mapDimensions.depth / 2, footprintDepth, mapDimensions.depth) - mapDimensions.depth / 2;
    const wasElevated = (prop.elevation ?? 0) > 0.001;
    const support = roomPropPlacementSupport(current.filter((item) => item.id !== id), prop.asset, x, z, rotation);
    // Keep supported props on their table/shelf after rotation. If the rotated
    // footprint no longer fits, leave the prop unchanged instead of saving an
    // invalid overhang or silently dropping it to the floor.
    if (wasElevated && !support) return prop;
    const elevation = support?.elevation ?? 0;
    return {
      ...prop,
      rotation,
      x,
      z,
      ...(elevation > 0 ? { elevation } : { elevation: undefined }),
    };
  }));

  const moveMapBuilding = (id: string, position: { x: number; z: number; elevation?: number }) => setOfficeMapLayout((layout) => {
    if (!layout) return layout;
    return { ...layout, props: layout.props.map((prop) => {
      if (prop.id !== id) return prop;
      const support = roomPropPlacementSupport(layout.props.filter((item) => item.id !== id), prop.asset, position.x, position.z, prop.rotation);
      const definition = ROOM_PROP_CATALOG.find((item) => item.asset === prop.asset);
      if (definition?.placementClass === "small" && !support) return prop;
      const elevation = support?.elevation ?? 0;
      return { ...prop, x: position.x, z: position.z, ...(elevation > 0 ? { elevation } : { elevation: undefined }) };
    }) };
  });

  const rotateMapBuilding = (id: string) => setOfficeMapLayout((layout) => {
    if (!layout) return layout;
    return { ...layout, props: layout.props.map((prop) => {
      if (prop.id !== id) return prop;
      const rotation = (prop.rotation + Math.PI / 2) % (Math.PI * 2);
      const cos = Math.abs(Math.cos(rotation));
      const sin = Math.abs(Math.sin(rotation));
      const footprintWidth = prop.width * cos + prop.depth * sin;
      const footprintDepth = prop.depth * cos + prop.width * sin;
      const snapCenter = (center: number, footprint: number, boundary: number) => {
        const half = footprint / 2;
        const maxCell = Math.max(0, Math.floor(boundary - footprint));
        return Math.min(maxCell, Math.max(0, Math.round(center - half))) + half;
      };
      const x = snapCenter(prop.x + mapDimensions.width / 2, footprintWidth, mapDimensions.width) - mapDimensions.width / 2;
      const z = snapCenter(prop.z + mapDimensions.depth / 2, footprintDepth, mapDimensions.depth) - mapDimensions.depth / 2;
      const wasElevated = (prop.elevation ?? 0) > 0.001;
      const support = roomPropPlacementSupport(layout.props.filter((item) => item.id !== id), prop.asset, x, z, rotation);
      if (wasElevated && !support) return prop;
      const elevation = support?.elevation ?? 0;
      return { ...prop, rotation, x, z, ...(elevation > 0 ? { elevation } : { elevation: undefined }) };
    }) };
  });

  const deleteMapBuilding = (id: string) => {
    setOfficeMapLayout((layout) => layout ? { ...layout, props: layout.props.filter((prop) => prop.id !== id) } : layout);
    setSelectedModifyPropId((current) => current === id ? null : current);
  };
  const deleteOfficeProp = (id: string) => {
    setModifyPropsDraft((current) => current.filter((prop) => prop.id !== id));
    setSelectedModifyPropId((current) => current === id ? null : current);
  };


  const startMapZoneDrawing = () => {
    setSelectedMapZoneId(null);
    setMapZoneArea(null);
    setMapZoneName("");
    setMapZoneKind("meeting");
    setMapZoneEnclosureEnabled(true);
    setMapZoneEntranceSide("south");
    setMapZoneEntranceKind("door");
    setMapZoneDoorCount(1);
    setMapZoneDoorLeaves(1);
    setMapZoneDoorOffsets([0]);
    setMapZoneWallStyle("geometry");
    setMapZoneWallColor("#023047");
    setMapZoneDoorStyle("geometry");
    setMapZoneDrawing(true);
  };

  const changeMapZoneDoorCount = (count: number, side = mapZoneEntranceSide, leaves = mapZoneDoorLeaves) => {
    setMapZoneDoorCount(count);
    if (!mapZoneArea) { setMapZoneDoorOffsets(Array.from({ length: count }, () => 0)); return; }
    const length = side === "north" || side === "south" ? mapZoneArea.width : mapZoneArea.depth;
    const width = Math.min(leaves === 2 ? 2.4 : 1.2, length);
    const maxOffset = Math.max(0, length / 2 - width / 2);
    setMapZoneDoorOffsets(Array.from({ length: count }, (_, index) => count === 1 ? 0 : -maxOffset + maxOffset * 2 * index / (count - 1)));
  };

  const buildMapZoneDraft = (id: string) => {
    if (!officeMapLayout || !mapZoneArea) return null;
    const name = mapZoneKind === "private" ? "Available desk" : mapZoneKind === "restroom" ? "Restroom" : mapZoneName.trim() || "Meeting zone";
    const { x, z, width, depth } = mapZoneArea;
    const zone: RoomLayoutZone = {
      id, name: name.slice(0, 32), kind: mapZoneKind,
      x, z, width, depth, color: mapZoneKind === "meeting" ? "#8ecae6" : mapZoneKind === "restroom" ? "#70c1b3" : "#ffb703",
    };
    if (!mapZoneEnclosureEnabled) {
      const layout: RoomLayout = { ...officeMapLayout, zones: [...officeMapLayout.zones, zone] };
      const withinBounds = Math.abs(x) + width / 2 <= mapDimensions.width / 2 && Math.abs(z) + depth / 2 <= mapDimensions.depth / 2;
      return { layout, withinBounds };
    }
    const rawWallSpecs: Array<{ side: "north" | "east" | "south" | "west"; axis: "horizontal" | "vertical"; x: number; z: number; length: number }> = [
      { side: "north", axis: "horizontal", x, z: z - depth / 2, length: width },
      { side: "east", axis: "vertical", x: x + width / 2, z, length: depth },
      { side: "south", axis: "horizontal", x, z: z + depth / 2, length: width },
      { side: "west", axis: "vertical", x: x - width / 2, z, length: depth },
    ];
    const wallHeight = 2.4;
    const selectedWallModel = mapZoneWallStyle === "asset" ? ROOM_PROP_CATALOG.find((item) => item.asset === mapZoneWallAsset) : undefined;
    const wallThickness = selectedWallModel?.wallAxis === "x"
      ? Math.max(0.12, selectedWallModel.depth * wallHeight / selectedWallModel.height)
      : 0.18;
    // Keep each wall's outer face aligned with the drawn zone edge. This lets
    // rooms meet the campus perimeter without placing collision geometry outside it.
    const wallInset = wallThickness / 2;
    const wallSpecs = rawWallSpecs.map((wall) => ({
      ...wall,
      x: wall.x + (wall.side === "east" ? -wallInset : wall.side === "west" ? wallInset : 0),
      z: wall.z + (wall.side === "south" ? -wallInset : wall.side === "north" ? wallInset : 0),
    }));
    const walls: RoomLayoutWall[] = wallSpecs.map((wall) => {
      return {
        id: `${id}-${wall.side}`, axis: wall.axis,
        x: wall.x, z: wall.z,
        length: wall.length, thickness: wallThickness, height: wallHeight,
        ...(mapZoneWallStyle === "asset" ? { asset: mapZoneWallAsset } : { color: mapZoneWallColor }),
      };
    });
    const selectedEntrance = wallSpecs.find((wall) => wall.side === mapZoneEntranceSide)!;
    const entranceWall = walls.find((wall) => wall.id === `${id}-${selectedEntrance.side}`)!;
    const entranceWidth = Math.min(mapZoneDoorLeaves === 2 ? 2.4 : 1.2, selectedEntrance.length);
    const maxDoorOffset = Math.max(0, selectedEntrance.length / 2 - entranceWidth / 2);
    const entranceDoors: RoomLayoutDoor[] = Array.from({ length: mapZoneDoorCount }, (_, index) => ({
      id: `${id}-entrance-${index + 1}`,
      wallId: entranceWall.id,
      offset: Math.max(-maxDoorOffset, Math.min(maxDoorOffset, mapZoneDoorOffsets[index] ?? 0)),
      width: entranceWidth,
      kind: mapZoneEntranceKind,
      leaves: mapZoneEntranceKind === "door" ? mapZoneDoorLeaves : 1,
      ...(mapZoneEntranceKind === "door" && mapZoneDoorStyle === "asset" ? { asset: ROOM_DOOR_FRAME_ASSETS[0] } : {}),
    }));
    const layout: RoomLayout = {
      ...officeMapLayout,
      zones: [...officeMapLayout.zones, zone],
      walls: [...officeMapLayout.walls, ...walls],
      doors: [...officeMapLayout.doors, ...entranceDoors],
    };
    const withinBounds = Math.abs(x) + width / 2 <= mapDimensions.width / 2 &&
      Math.abs(z) + depth / 2 <= mapDimensions.depth / 2;
    return { layout, withinBounds };
  };

  const saveMapZone = () => {
    if (!activeOffice || !officeMapLayout || !mapZoneArea || !zoneCreationValid) return;
    const draft = buildMapZoneDraft(crypto.randomUUID());
    if (!draft) return;
    setLobbyError(null);
    setOfficeMapLayout(draft.layout);
    setSelectedMapZoneId(draft.layout.zones.at(-1)?.id ?? null);
    setMapZoneArea(null);
    setMapZoneDrawing(false);
  };

  const moveMapZoneEntranceToClearSide = (zoneId: string) => {
    if (!activeOffice || !officeMapLayout || mapZoneSaving) return;
    const zoneDoors = officeMapLayout.doors.filter((door) => door.id.startsWith(`${zoneId}-entrance-`));
    if (!zoneDoors.length) return;
    const sides = ["north", "east", "south", "west"] as const;
    const candidates = sides.map((side) => {
      const wallId = `${zoneId}-${side}`;
      const wall = officeMapLayout.walls.find((item) => item.id === wallId);
      if (!wall) return null;
      const doors = officeMapLayout.doors.map((door) => {
        if (!zoneDoors.some((entry) => entry.id === door.id)) return door;
        const maxOffset = Math.max(0, wall.length / 2 - door.width / 2);
        return { ...door, wallId, offset: Math.max(-maxOffset, Math.min(maxOffset, door.offset)) };
      });
      return { ...officeMapLayout, doors } satisfies RoomLayout;
    }).filter((layout): layout is RoomLayout => layout !== null);
    const accessibleLayout = candidates.find((layout) => !roomZoneEntranceIssues(layout, new Set([zoneId])).length);
    if (!accessibleLayout) {
      setLobbyError("No clear side is available for this room entrance. Move the zone away from nearby walls or the map edge.");
      return;
    }
    setLobbyError(null);
    setOfficeMapLayout(accessibleLayout);
  };

  const deleteMapZone = () => {
    if (!activeOffice || !officeMapLayout || !selectedMapZoneId || mapZoneDeleting) return;
    const removedWallIds = new Set(officeMapLayout.walls.filter((wall) => wall.id.startsWith(`${selectedMapZoneId}-`)).map((wall) => wall.id));
    const nextLayout: RoomLayout = {
      ...officeMapLayout,
      zones: officeMapLayout.zones.filter((zone) => zone.id !== selectedMapZoneId),
      walls: officeMapLayout.walls.filter((wall) => !removedWallIds.has(wall.id)),
      doors: officeMapLayout.doors.filter((door) => !door.id.startsWith(`${selectedMapZoneId}-`) && !removedWallIds.has(door.wallId)),
    };
    setLobbyError(null);
    setOfficeMapLayout(nextLayout);
    setSelectedMapZoneId(null);
  };

  const saveMapSpawnPoint = (position: { x: number; z: number }) => {
    if (!activeOffice || !officeMapLayout || mapSpawnSaving) return;
    if (!isPositionWalkable(position, campusWorldFromConfig({ version: 1, layout: officeMapLayout }))) {
      setLobbyError("The spawn point must be placed on walkable ground.");
      return;
    }
    setLobbyError(null);
    setOfficeMapLayout({ ...officeMapLayout, spawnPoint: position });
    setSpawnPlacementMode(false);
  };

  const saveMapDraft = async () => {
    if (!activeOffice || !officeMapLayout || mapSaving) return;
    const changedZoneIds = new Set(officeMapLayout.zones.filter((zone) => {
      const previous = mapEditBaseline?.zones.find((candidate) => candidate.id === zone.id);
      const snapshot = (layout: RoomLayout, entry: RoomLayoutZone | undefined) => entry ? JSON.stringify({
        zone: entry,
        walls: layout.walls.filter((wall) => wall.id.startsWith(`${entry.id}-`)),
        doors: layout.doors.filter((door) => door.id.startsWith(`${entry.id}-`)),
      }) : null;
      return snapshot(officeMapLayout, zone) !== snapshot(mapEditBaseline ?? officeMapLayout, previous);
    }).map((zone) => zone.id));
    if (roomZoneEntranceIssues(officeMapLayout, changedZoneIds).length) {
      setLobbyError("A room entrance is blocked. Move the zone or its entrance before saving.");
      return;
    }
    if (officeMapLayout.zones.some((zone) => Math.abs(zone.x) + zone.width / 2 > mapDimensions.width / 2 || Math.abs(zone.z) + zone.depth / 2 > mapDimensions.depth / 2) ||
        officeMapLayout.walls.some((wall) => Math.abs(wall.x) + (wall.axis === "horizontal" ? wall.length : wall.thickness) / 2 > mapDimensions.width / 2 || Math.abs(wall.z) + (wall.axis === "vertical" ? wall.length : wall.thickness) / 2 > mapDimensions.depth / 2) ||
        (officeMapLayout.spawnPoint && !isPositionWalkable(officeMapLayout.spawnPoint, campusWorldFromConfig({ version: 1, layout: officeMapLayout })))) {
      setLobbyError("The draft has items outside the map or an invalid spawn point. Fix them before saving.");
      return;
    }
    setMapSaving(true);
    mapCommitInFlightRef.current = true;
    setLobbyError(null);
    try {
      const response = await fetch(`${endpoint}/offices/${activeOffice.id}/map`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 1, configVersion: mapConfigVersion, layout: officeMapLayout }),
      });
      const result = await response.json() as { config?: unknown; configVersion?: number; error?: string };
      if (response.status === 409 && result.config) {
        setMapConflictLatest({ layout: readRoomLayout(result.config), configVersion: result.configVersion ?? mapConfigVersion, message: result.error ?? "The office map changed while you were editing." });
        setLobbyError(null);
        return;
      }
      if (!response.ok || !result.config) throw new Error(result.error ?? "Could not save the office map.");
      // Save dimensions and zones before generated props. The props endpoint
      // validates every prop against the persisted map boundary, so a newly
      // compacted/widened draft must become its boundary source first.
      const nextMapConfigVersion = result.configVersion ?? mapConfigVersion + 1;
      setMapConfigVersion(nextMapConfigVersion);
      if (JSON.stringify(officeMapLayout.props) !== JSON.stringify(mapEditBaseline?.props ?? [])) {
        const propsResponse = await fetch(`${endpoint}/offices/${activeOffice.id}/props`, {
          method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ props: officeMapLayout.props, configVersion: mapPropsConfigVersion }),
        });
        const propsResult = await propsResponse.json() as { props?: RoomLayoutProp[]; configVersion?: number; error?: string };
        if (!propsResponse.ok || !Array.isArray(propsResult.props)) {
          const message = propsResponse.status === 409 ? "Office props changed while you were editing. Close and reopen the map editor to load the latest props." : propsResult.error ?? "Could not save generated office props.";
          throw new Error(message);
        }
        setMapPropsConfigVersion(propsResult.configVersion ?? mapPropsConfigVersion + 1);
      }
      const savedLayout = { ...readRoomLayout(result.config), props: officeMapLayout.props };
      setOfficeMapLayout(savedLayout);
      setMapEditBaseline(savedLayout);
      setMapConfigVersion(nextMapConfigVersion);
      setMapConflictLatest(null);
      closeMapEditMode();
    } catch (cause) { setLobbyError(cause instanceof Error ? cause.message : "Could not save the office map."); }
    finally { mapCommitInFlightRef.current = false; setMapSaving(false); }
  };

  const reloadLatestMapAfterConflict = () => {
    if (!mapConflictLatest) return;
    setOfficeMapLayout(mapConflictLatest.layout);
    setMapEditBaseline(mapConflictLatest.layout);
    setMapConfigVersion(mapConflictLatest.configVersion);
    setMapConflictLatest(null);
    setLobbyError(null);
    setSelectedMapZoneId(null);
  };

  const changeDeskOwnership = async (zoneId: string, action: "claim" | "unclaim") => {
    const desk = officeDesks.deskForZone(zoneId);
    if (!desk || deskClaimBusy) { void officeDesks.refresh(); return; }
    const result = await officeDesks[action](desk.id);
    if (!result || result.configVersion < mapConfigVersionRef.current) return;
    recordMapServerVersion(result.configVersion);
    if (!mapEditModeRef.current || !mapDraftDirtyRef.current && !mapCommitInFlightRef.current) {
      setMapConfigVersion(result.configVersion);
      setOfficeMapLayout(readRoomLayout(result.config));
    }
    setSelectedDeskZoneId(action === "claim" ? zoneId : null);
  };
  const claimDeskZone = (zoneId: string) => changeDeskOwnership(zoneId, "claim");
  const unclaimDeskZone = (zoneId: string) => changeDeskOwnership(zoneId, "unclaim");
  const returnToDesk = () => {
    if (!officeDesks.ownDesk || status !== "connected" || appPausedRef.current || !travel.expectDestination(null)) return;
    heldKeysRef.current.clear();
    lockedMovementRef.current = null;
    roomRef.current?.send("return-to-desk", { deskId: officeDesks.ownDesk.id });
  };

  const sendOfficeInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!managingOffice) return;
    setLobbyBusy(true);
    setLobbyError(null);
    try {
      const response = await fetch(`${endpoint}/offices/${managingOffice.id}/invites`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: inviteUsername.trim() || undefined, role: inviteRole }),
      });
      const result = await response.json() as { invite?: { token: string }; error?: string };
      if (!response.ok || !result.invite) throw new Error(result.error ?? "Could not create invite.");
      if (!inviteUsername.trim()) setInviteUrl(`${window.location.origin}/join/${result.invite.token}`);
      else {
        const response = await fetch(`${endpoint}/offices`, { credentials: "include" });
        const list = await response.json() as { invites?: OfficeInvite[] };
        setInvites(list.invites ?? []);
      }
      setInviteUsername("");
    } catch (cause) { setLobbyError(cause instanceof Error ? cause.message : "Could not create invite."); }
    finally { setLobbyBusy(false); }
  };

  const saveOfficeName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!managingOffice) return;
    setLobbyBusy(true);
    try {
      const response = await fetch(`${endpoint}/offices/${managingOffice.id}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: managedOfficeName }),
      });
      const result = await response.json() as { name?: string; error?: string };
      if (!response.ok || !result.name) throw new Error(result.error ?? "Could not update office.");
      setManagingOffice({ ...managingOffice, name: result.name });
      setOffices((current) => current.map((office) => office.id === managingOffice.id ? { ...office, name: result.name! } : office));
      setLobbyError(null);
    } catch (cause) { setLobbyError(cause instanceof Error ? cause.message : "Could not update office."); }
    finally { setLobbyBusy(false); }
  };

  const changeMemberRole = async (member: OfficeMember, role: "admin" | "user") => {
    if (!managingOffice) return;
    setLobbyBusy(true);
    try {
      const response = await fetch(`${endpoint}/offices/${managingOffice.id}/members/${encodeURIComponent(member.username)}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "Could not update role.");
      setOfficeMembers((current) => current.map((item) => item.username === member.username ? { ...item, role } : item));
    } catch (cause) { setLobbyError(cause instanceof Error ? cause.message : "Could not update role."); }
    finally { setLobbyBusy(false); }
  };

  const removeMember = async (member: OfficeMember) => {
    if (!managingOffice) return;
    setLobbyBusy(true);
    try {
      const response = await fetch(`${endpoint}/offices/${managingOffice.id}/members/${encodeURIComponent(member.username)}`, { method: "DELETE", credentials: "include" });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "Could not remove member.");
      setOfficeMembers((current) => current.filter((item) => item.username !== member.username));
    } catch (cause) { setLobbyError(cause instanceof Error ? cause.message : "Could not remove member."); }
    finally { setLobbyBusy(false); }
  };

  useEffect(() => {
    if (!authReady || !connectionUsername || !connectionOfficeId) return;
    let disposed = false;
    let inputTimer: number | undefined;
    let rejoinTimer: number | undefined;
    let disposeReconnection: (() => void) | undefined;
    const positionStorageEpoch = positionStorageEpochRef.current;
    const sendHeldMovement = () => {
      const room = roomRef.current;
      if (!room) return;
      if (workspaceInputBlockedRef.current || isWorkspaceInputBlocked(null) || appPausedRef.current || mapEditModeRef.current || modifyPropsOpenRef.current) { lockedMovementRef.current = null; sendMovementInput({ x: 0, z: 0, sprint: false }); return; }
      const localSessionId = localSessionIdRef.current;
      const localPlayer = localSessionId ? playersRef.current.get(localSessionId) : undefined;
      const movement = resolveHeldMovement({
        keys: heldKeysRef.current, map2d: map2dViewRef.current, firstPerson: firstPersonViewRef.current,
        behindCharacter: cameraBehindCharacterRef.current, cameraYawRad: cameraYawRef.current,
        playerRotationRad: localPlayer?.rotation, driving: Boolean(localPlayer?.vehicleId),
        nowMs: performance.now(), lockedTurn: lockedMovementRef.current,
      });
      lockedMovementRef.current = movement.lockedTurn;
      sendMovementInput(movement.input);
    };
    const persistCurrentOfficePosition = () => {
      if (positionStorageEpoch !== positionStorageEpochRef.current) return;
      const localPlayer = localSessionIdRef.current ? playersRef.current.get(localSessionIdRef.current) : undefined;
      if (localPlayer) saveLastOfficePosition(connectionUsername, connectionOfficeId, { x: localPlayer.x, z: localPlayer.z });
    };
    window.addEventListener("pagehide", persistCurrentOfficePosition);
    sendHeldMovementRef.current = sendHeldMovement;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isWorkspaceInputBlocked(event.target)) { heldKeysRef.current.clear(); lockedMovementRef.current = null; sendHeldMovement(); return; }
      if (event.code === "KeyZ" && !event.repeat && !appPausedRef.current && !mapEditModeRef.current && !modifyPropsOpenRef.current) {
        event.preventDefault();
        roomRef.current?.send("dance", { toggle: true });
        return;
      }
      if ((appPausedRef.current || mapEditModeRef.current || modifyPropsOpenRef.current) && movementKeys.includes(event.code)) { heldKeysRef.current.delete(event.code); event.preventDefault(); return; }
      if (movementKeys.includes(event.code)) {
        heldKeysRef.current.add(event.code);
        event.preventDefault();
        // Coalesce immediate changes with the heartbeat through the same send gate.
        // Browser key-repeat events are not useful movement updates and can
        // exceed Colyseus' inbound message limit while a key is held.
        if (!event.repeat) sendHeldMovement();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!heldKeysRef.current.delete(event.code)) return;
      sendHeldMovement();
    };
    const onBlur = () => { heldKeysRef.current.clear(); lockedMovementRef.current = null; sendHeldMovement(); };
    // Capture movement keys before buttons or other UI elements can consume
    // them, so WASD continues to drive while the world or HUD has focus.
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);

    const connect = async () => {
      try {
        intentionalLeaveRef.current = false;
        const lastPosition = readLastOfficePosition(connectionUsername, connectionOfficeId);
        const room = await client.joinOrCreate<OfficeStateType>("office", {
          officeId: connectionOfficeId,
          ...(lastPosition ? { lastPosition } : {}),
        }, OfficeState);
        if (disposed) {
          await room.leave();
          return;
        }
        roomRef.current = room;
        reconnectingRef.current = false;
        inputSendGateRef.current = new InputSendGate();
        disposeReconnection = installOfficeReconnection(room);
        localSessionIdRef.current = room.sessionId;
        setVoiceRealtimeSessionKey(room.sessionId);
        blasterEventsRef.current.length = 0;
        jumpStartedAtRef.current.clear();
        room.send("weapon-equip", "");
        const storedPet = window.localStorage.getItem(`gammyverse.pet.${connectionUsername}`) ?? "";
        const validStoredPet = KENNEY_PET_IDS.includes(storedPet as KenneyPetId) ? storedPet as KenneyPetId : "";
        localPetIdRef.current = validStoredPet;
        setActivePetId(validStoredPet);
        room.send("pet", validStoredPet);
        window.localStorage.removeItem(`gammyverse.vehicle.${connectionUsername}`);
        autoRejoiningRef.current = false;
        autoRejoinAttemptsRef.current = 0;
        setStatus("connected");
        setError(null);

        const applyState = (state: OfficeState) => {
          const applyStartedAtMs = performance.now();
          const snapshot = new Map<string, PlayerSnapshot>();
          const localPlayer = localSessionIdRef.current
            ? state.players.get(localSessionIdRef.current)
            : undefined;
          for (const [sessionId, player] of state.players) {
            const entry = player as PlayerState;
            // A stale/mismatched Colyseus schema can temporarily expose incomplete
            // records during development HMR. Never publish those into React state.
            if (
              typeof entry.username !== "string" ||
              typeof entry.displayName !== "string" ||
              !Number.isFinite(entry.x) ||
              !Number.isFinite(entry.z) ||
              !Number.isFinite(entry.rotation)
            ) continue;
            snapshot.set(sessionId, {
              x: entry.x,
              z: entry.z,
              rotation: entry.rotation,
              username: entry.username,
              displayName: entry.displayName,
              isMaintainer: entry.isMaintainer === true,
              characterId: entry.characterId as CharacterSelectionId,
              petId: (entry.petId || "") as KenneyPetId | "",
              weaponId: KENNEY_BLASTER_IDS.includes(entry.weaponId as KenneyBlasterId) ? entry.weaponId as KenneyBlasterId : "",
              vehicleId: (entry.vehicleId || "") as KenneyVehicleId | "",
              vehicleMode: entry.vehicleMode === "manual" || entry.vehicleMode === "auto" ? entry.vehicleMode : "",
              vehiclePropId: entry.vehiclePropId || "",
              vehiclePropX: entry.vehiclePropX,
              vehiclePropZ: entry.vehiclePropZ,
              vehiclePropRotation: entry.vehiclePropRotation,
              sittingPropId: entry.sittingPropId || "",
              dancing: Boolean(entry.dancing),
              handRaised: Boolean(entry.handRaised),
              status: USER_STATUSES.includes(entry.status as UserStatus) ? entry.status as UserStatus : "available",
              customStatusText: entry.customStatusText, customStatusEmoji: entry.customStatusEmoji, customStatusExpiresAtMs: entry.customStatusExpiresAtMs,
              presence: entry.presence === "away" ? "away" : "online",
              nearby: Boolean(localPlayer && sessionId !== localSessionIdRef.current && entry.presence === "online" && nearbySessionIdsRef.current.has(sessionId)),
              microphoneEnabled: Boolean(entry.microphoneEnabled),
              cameraEnabled: Boolean(entry.cameraEnabled),
              screenShareEnabled: Boolean(entry.screenShareEnabled),
            });
          }
          playersRef.current = snapshot;
          const localSnapshot = localSessionIdRef.current ? snapshot.get(localSessionIdRef.current) : undefined;
          const now = performance.now();
          if (localSnapshot && now - lastPositionSavedAtRef.current >= 1000 && positionStorageEpoch === positionStorageEpochRef.current) {
            saveLastOfficePosition(connectionUsername, connectionOfficeId, { x: localSnapshot.x, z: localSnapshot.z });
            lastPositionSavedAtRef.current = now;
          }
          setInboundAudioMuted(availabilityPolicy(localSnapshot?.status ?? "available").suppressAutomaticMedia);
          userStatusRef.current = localSnapshot?.status ?? "available";
          setUserStatus(userStatusRef.current);
          const storedPet = window.localStorage.getItem(`gammyverse.pet.${connectionUsername}`) ?? "";
          const snapshotPet = localSnapshot?.petId ?? "";
          const localPet = KENNEY_PET_IDS.includes(snapshotPet as KenneyPetId)
            ? snapshotPet as KenneyPetId
            : KENNEY_PET_IDS.includes(storedPet as KenneyPetId) ? storedPet as KenneyPetId : "";
          localPetIdRef.current = localPet;
          setActivePetId(localPet);
          updateProximityAudioVolumes();
          const signature = [...snapshot]
            .map(([id, player]) => `${id}:${player.presence}:${player.nearby}:${player.isMaintainer}:${player.microphoneEnabled}:${player.cameraEnabled}:${player.screenShareEnabled}:${player.displayName}:${player.characterId}:${player.petId}:${player.weaponId}:${player.vehicleId}:${player.vehicleMode}:${player.vehiclePropId}:${player.vehiclePropX}:${player.vehiclePropZ}:${player.vehiclePropRotation}:${player.sittingPropId}:${player.status}:${player.customStatusText}:${player.customStatusEmoji}:${player.customStatusExpiresAtMs}:${player.handRaised}`)
            .sort()
            .join("|");
          if (signature !== peopleSignatureRef.current) {
            peopleSignatureRef.current = signature;
            setPeople([...snapshot.entries()]);
            setPlayerCount(snapshot.size);
          }
          clientRuntimeMetrics.recordStateApply(performance.now() - applyStartedAtMs, snapshot.size);
        };
        room.onMessage("blaster-shot", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("shooterSessionId" in payload) || !("start" in payload) || !("end" in payload)) return;
          const shot = payload as BlasterShotEvent;
          const vectorIsFinite = (vector: BlasterVector) => vector && [vector.x, vector.y, vector.z].every((coordinate) => Number.isFinite(coordinate));
          if (typeof shot.shooterSessionId !== "string" || !vectorIsFinite(shot.start) || !vectorIsFinite(shot.end)) return;
          blasterEventsRef.current.push(shot);
          if (blasterEventsRef.current.length > 24) blasterEventsRef.current.splice(0, blasterEventsRef.current.length - 24);
        });
        room.onMessage("player-jump", (payload: unknown) => {
          if (isValidJumpEvent(payload)) jumpStartedAtRef.current.set(payload.sessionId, performance.now());
        });
        room.onMessage("blaster-hit", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("shooterName" in payload) || typeof payload.shooterName !== "string") return;
          const sequence = ++blasterHitSequenceRef.current;
          setBlasterHitNotice(sequence);
          window.setTimeout(() => setBlasterHitNotice((current) => current === sequence ? null : current), 450);
        });
        room.onMessage("follow-status", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("status" in payload) || typeof payload.status !== "string") return;
          const targetSessionId = "targetSessionId" in payload && typeof payload.targetSessionId === "string" ? payload.targetSessionId : null;
          if (payload.status === "started") {
            setFollowingSessionId(targetSessionId);
            return;
          }
          setFollowingSessionId((current) => !targetSessionId || current === targetSessionId ? null : current);
          if (payload.status === "unavailable" || payload.status === "unreachable" || payload.status === "blocked") {
            setAutoMoveNotice(payload.status === "unavailable" ? "Can't follow that person right now" : "Can't reach that person");
            if (autoMoveNoticeTimerRef.current !== undefined) window.clearTimeout(autoMoveNoticeTimerRef.current);
            autoMoveNoticeTimerRef.current = window.setTimeout(() => setAutoMoveNotice(null), 2200);
          }
        });
        room.onMessage("follow-alert", (payload: unknown) => {
          if (availabilityPolicy(userStatusRef.current).suppressInterruptions) return;
          if (typeof payload !== "object" || payload === null || !("followerSessionId" in payload) || typeof payload.followerSessionId !== "string" || !("followerName" in payload) || typeof payload.followerName !== "string") return;
          if (!inboundAudioMutedRef.current) playSocialNotificationSound("follow");
          setFollowAlerts((current) => [...current.filter((alert) => alert.followerSessionId !== payload.followerSessionId), { followerSessionId: payload.followerSessionId as string, followerName: payload.followerName as string }].slice(-3));
        });
        room.onMessage("follow-ended", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("followerSessionId" in payload) || typeof payload.followerSessionId !== "string") return;
          setFollowAlerts((current) => current.filter((alert) => alert.followerSessionId !== payload.followerSessionId));
        });
        room.onMessage("wave-notification", (payload: unknown) => {
          if (availabilityPolicy(userStatusRef.current).suppressInterruptions) return;
          if (typeof payload !== "object" || payload === null || !("senderSessionId" in payload) || typeof payload.senderSessionId !== "string" || !("senderName" in payload) || typeof payload.senderName !== "string") return;
          if (!inboundAudioMutedRef.current) playSocialNotificationSound("wave");
          setWaveAlerts((current) => [...current.filter((alert) => alert.senderSessionId !== payload.senderSessionId), { senderSessionId: payload.senderSessionId as string, senderName: payload.senderName as string }].slice(-3));
        });
        room.onMessage("room-presence", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("direction" in payload) || (payload.direction !== "enter" && payload.direction !== "exit") || !("zoneId" in payload) || typeof payload.zoneId !== "string") return;
          if (!inboundAudioMutedRef.current && !appPausedRef.current) {
            playSocialNotificationSound(payload.direction === "enter" ? "room-enter" : "room-exit");
          }
        });
        room.onMessage("wave-status", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("status" in payload) || payload.status !== "sent") return;
          const targetName = "targetName" in payload && typeof payload.targetName === "string" ? payload.targetName : "them";
          setAutoMoveNotice(`Wave sent to ${targetName}`);
          if (autoMoveNoticeTimerRef.current !== undefined) window.clearTimeout(autoMoveNoticeTimerRef.current);
          autoMoveNoticeTimerRef.current = window.setTimeout(() => setAutoMoveNotice(null), 1800);
        });
        room.onMessage("meeting-zone", (payload: unknown) => {
          if (typeof payload === "object" && payload !== null && "active" in payload && typeof payload.active === "boolean") {
            meetingZoneActiveRef.current = payload.active;
            setMeetingZoneActive(payload.active);
          }
        });
        room.onMessage("office-map", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("config" in payload) || !("configVersion" in payload)
            || typeof payload.configVersion !== "number" || !Number.isInteger(payload.configVersion)
            || payload.configVersion < mapConfigVersionRef.current) return;
          // Preserve the editor's private draft while tracking the current server revision.
          recordMapServerVersion(payload.configVersion);
          if (!mapEditModeRef.current || !mapDraftDirtyRef.current && !mapCommitInFlightRef.current) {
            setMapConfigVersion(payload.configVersion);
            const incomingLayout = readRoomLayout(payload.config);
            setOfficeMapLayout(incomingLayout);
            if (mapEditModeRef.current) setMapEditBaseline(incomingLayout);
          }
          void refreshDesksRef.current();
        });
        room.onMessage("map-edit-lock", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("editorUsername" in payload)) return;
          setMapEditorUsername(typeof payload.editorUsername === "string" ? payload.editorUsername : null);
        });
        room.onMessage("map-edit-lock-result", (payload: unknown) => {
          setMapEditLockRequestPending(false);
          if (typeof payload !== "object" || payload === null || !("granted" in payload)) return;
          if (payload.granted === true) {
            if (activeOfficeRef.current) void loadMapForEditing(activeOfficeRef.current);
            else room.send("map-edit-lock", { active: false });
            return;
          }
          setMapEditBaseline(null);
          setMapConflictLatest(null);
          const editor = "editorUsername" in payload && typeof payload.editorUsername === "string" ? payload.editorUsername : null;
          const message = "error" in payload && typeof payload.error === "string"
            ? payload.error
            : editor ? `${editor} is editing the map right now.` : "The map is already being edited.";
          setLobbyError(message);
        });
        room.onMessage("media-zone", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("zoneId" in payload)) return;
          const zoneId = typeof payload.zoneId === "string" ? payload.zoneId : null;
          const kind = "kind" in payload && payload.kind === "meeting" ? "meeting" : "private";
          const name = "name" in payload && typeof payload.name === "string" ? payload.name : null;
          meetingZoneActiveRef.current = Boolean(zoneId && kind === "meeting");
          privateZoneIdRef.current = zoneId && kind === "private" ? zoneId : null;
          setMeetingZoneActive(Boolean(zoneId && kind === "meeting"));
          setActiveCameraRoomKey(zoneId ?? "lobby");
          setMeetingZoneId(zoneId && kind === "meeting" ? zoneId : null);
          setPrivateZoneId(zoneId && kind === "private" ? zoneId : null);
          setPrivateZoneName(zoneId && kind === "private" ? name : null);
          setMediaZoneName(zoneId ? name : "Public");
        });
        room.onMessage("zone-locks", (payload: unknown) => {
          if (typeof payload === "object" && payload !== null && "zoneIds" in payload && Array.isArray(payload.zoneIds)) {
            setLockedZoneIds(payload.zoneIds.filter((id): id is string => typeof id === "string"));
          }
        });
        room.onMessage("proximity", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("sessionIds" in payload) || !Array.isArray(payload.sessionIds)) return;
          nearbySessionIdsRef.current = new Set(payload.sessionIds.filter((id): id is string => typeof id === "string"));
          if (room.state) applyState(room.state);
        });
        room.onMessage("proximity-group", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("groupId" in payload)) return;
          const groupId = typeof payload.groupId === "string" ? payload.groupId : null;
          proximityGroupIdRef.current = groupId;
          setProximityGroupId(groupId);
        });
        room.onMessage("ghost-mode-status", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("enabled" in payload) || typeof payload.enabled !== "boolean") return;
          const sessionId = "sessionId" in payload && typeof payload.sessionId === "string" ? payload.sessionId : room.sessionId;
          setGhostSessionIds((previous) => {
            const next = new Set(previous);
            if (payload.enabled) next.add(sessionId);
            else next.delete(sessionId);
            return next;
          });
        });
        room.onMessage("ghost-mode-hint", () => {
          setAutoMoveNotice("Blocked by a prop or car. Hold G to pass through props, cars, and people; walls and locked rooms stay solid.");
          if (autoMoveNoticeTimerRef.current !== undefined) window.clearTimeout(autoMoveNoticeTimerRef.current);
          autoMoveNoticeTimerRef.current = window.setTimeout(() => setAutoMoveNotice(null), 3200);
        });
        room.onMessage("private-zone", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("zoneId" in payload)) return;
          const zoneId = typeof payload.zoneId === "string" ? payload.zoneId : null;
          privateZoneIdRef.current = zoneId;
          setPrivateZoneId(zoneId);
          setPrivateZoneName("name" in payload && typeof payload.name === "string" ? payload.name : null);
        });
        room.onMessage("vehicle-interact-status", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("status" in payload) || typeof payload.status !== "string") return;
          const message = payload.status === "entered"
            ? "Driving"
            : payload.status === "occupied"
              ? "That vehicle is occupied"
              : "Move closer to the vehicle";
          setAutoMoveNotice(message);
          if (autoMoveNoticeTimerRef.current !== undefined) window.clearTimeout(autoMoveNoticeTimerRef.current);
          autoMoveNoticeTimerRef.current = window.setTimeout(() => setAutoMoveNotice(null), 1800);
        });
        room.onMessage("auto-move-status", (payload: unknown) => {
          travel.receiveStatus(payload);
          if (typeof payload !== "object" || payload === null || !("status" in payload) || typeof payload.status !== "string") return;
          if (userStatusRef.current === "toilet" && (payload.status === "unreachable" || payload.status === "blocked")) setStatusTravelError("Could not reach the restroom. Check that its entrance is open and the route is walkable.");
          if (payload.status === "cancelled") { setAutoMoveNotice(null); return; }
          if (payload.status === "arrived" && connectionUsername) {
            window.localStorage.removeItem(`gammyverse.vehicle.${connectionUsername}`);
          }
          let message = payload.status === "started" ? "Moving automatically" : payload.status === "arrived" ? ("teleported" in payload && payload.teleported === true ? "Teleported" : "Arrived") : "Can't reach that spot";
          if (payload.status === "started" && "randomVehicle" in payload && payload.randomVehicle === true && "vehicleId" in payload && typeof payload.vehicleId === "string" && KENNEY_VEHICLE_IDS.includes(payload.vehicleId as KenneyVehicleId)) {
            message = `Driving ${vehicleLabel(payload.vehicleId as KenneyVehicleId)}`;
          }
          setAutoMoveNotice(message);
          if (autoMoveNoticeTimerRef.current !== undefined) window.clearTimeout(autoMoveNoticeTimerRef.current);
          autoMoveNoticeTimerRef.current = window.setTimeout(() => setAutoMoveNotice(null), payload.status === "started" ? 2600 : 1800);
        });
        room.onMessage("vehicle-exited", () => {
          if (connectionUsername) window.localStorage.removeItem(`gammyverse.vehicle.${connectionUsername}`);
        });
        room.onStateChange(applyState);
        if (room.state) applyState(room.state);
        room.send("request-spatial-state");

        room.onDrop((code, reason) => {
          console.info(DROP_EVENT_LABEL, { roomId: room.roomId, sessionId: room.sessionId, code, reason });
          if (disposed) return;
          reportClientDiagnostic("connection_drop", { closeCode: code });
          reconnectingRef.current = true;
          meetingZoneActiveRef.current = false;
          privateZoneIdRef.current = null;
          setPrivateZoneId(null);
          voiceTargetRef.current = null;
          voiceSessionRef.current?.suspend("realtime");
          setMeetingZoneActive(false);
          proximityGroupIdRef.current = null;
          setProximityGroupId(null);
          setStatus("reconnecting");
          setError(null);
        });
        room.onReconnect(() => {
          if (disposed) return;
          reconnectingRef.current = false;
          inputSendGateRef.current = new InputSendGate();
          voiceSessionRef.current?.resume(null, "realtime");
          room.send("request-spatial-state");
          setStatus("connected");
          setError(null);
        });
        room.onLeave((code, reason) => {
          console.info(LEAVE_EVENT_LABEL, { roomId: room.roomId, sessionId: room.sessionId, code, reason });
          if (disposed) return;
          if (![CONSENTED_CLOSE_CODE, REPLACED_CLOSE_CODE, REMOVED_CLOSE_CODE].includes(code)) {
            reportClientDiagnostic("connection_drop", { closeCode: code });
          }
          if ([CONSENTED_CLOSE_CODE, REPLACED_CLOSE_CODE, REMOVED_CLOSE_CODE].includes(code)) voiceSessionRef.current?.dispose();
          else voiceSessionRef.current?.suspend("realtime");
          const shouldRejoin = shouldFreshJoin(code, reconnectingRef.current) && !intentionalLeaveRef.current;
          reconnectingRef.current = false;
          meetingZoneActiveRef.current = false;
          privateZoneIdRef.current = null;
          setPrivateZoneId(null);
          autoRejoiningRef.current = shouldRejoin;
          autoRejoinAttemptsRef.current = 0;
          if (code === REMOVED_CLOSE_CODE) clearSelectedOffice();
          setStatus(code === REMOVED_CLOSE_CODE ? "connected" : shouldRejoin ? "reconnecting" : "disconnected");
          setError(code === REMOVED_CLOSE_CODE ? null : reason ?? null);
          setPeople([]);
          setPlayerCount(0);
          setFollowingSessionId(null);
          setFollowAlerts([]);
          setWaveAlerts([]);
          playersRef.current.clear();
          nearbySessionIdsRef.current.clear();
          setMeetingZoneActive(false);
          peopleSignatureRef.current = "";
          roomRef.current = null;
          setMapEditorUsername(null);
          setMapEditLockRequestPending(false);
          setMapEditMode(false);
          setMapEditBaseline(null);
          if (shouldRejoin) {
            rejoinTimer = window.setTimeout(() => {
              if (!disposed) setConnectionAttempt((attempt) => attempt + 1);
            }, FRESH_JOIN_DELAY_MS);
          }
        });
        room.onError((_code, message) => {
          if (!disposed) {
            reportClientDiagnostic("connection_error", { closeCode: Math.max(0, Math.min(_code, 3_600_000)) });
            if (/authentication required|session (expired|invalid)|unauthori[sz]ed/i.test(message ?? "")) {
              returnToSignIn();
              return;
            }
            setStatus(reconnectingRef.current ? "reconnecting" : "error");
            setError(reconnectingRef.current ? null : message || "Realtime connection failed.");
          }
        });

        inputTimer = window.setInterval(() => {
          if (roomRef.current !== room) return;
          sendHeldMovement();
        }, INPUT_HEARTBEAT_INTERVAL_MS);
      } catch (cause) {
        if (!disposed) {
          reportClientDiagnostic("join_error");
          const reason = cause instanceof Error ? cause.message : String(cause);
          if (/authentication required|session (expired|invalid)|unauthori[sz]ed/i.test(reason)) {
            returnToSignIn();
            return;
          }
          if (autoRejoiningRef.current && autoRejoinAttemptsRef.current < FRESH_JOIN_MAX_RETRIES_COUNT) {
            autoRejoinAttemptsRef.current += 1;
            setStatus("reconnecting");
            setError(null);
            const delay = Math.min(FRESH_JOIN_MAX_DELAY_MS, RECONNECT_INITIAL_DELAY_MS * RETRY_BACKOFF_MULTIPLIER ** (autoRejoinAttemptsRef.current - 1));
            rejoinTimer = window.setTimeout(() => {
              if (!disposed) setConnectionAttempt((attempt) => attempt + 1);
            }, delay);
          } else {
            autoRejoiningRef.current = false;
            setStatus("error");
            setError(cause instanceof Error ? cause.message : "Could not join the office.");
          }
        }
      }
    };

    void connect();
    return () => {
      disposed = true;
      disposeReconnection?.();
      if (inputTimer !== undefined) window.clearInterval(inputTimer);
      if (rejoinTimer !== undefined) window.clearTimeout(rejoinTimer);
      sendHeldMovementRef.current = () => {};
      lockedMovementRef.current = null;
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", persistCurrentOfficePosition);
      persistCurrentOfficePosition();
      const room = roomRef.current;
      roomRef.current = null;
      if (room?.connection.isOpen) void room.leave();
      else room?.onLeave.invoke(CONSENTED_CLOSE_CODE);
      reconnectingRef.current = false;
    };
  }, [client, connectionAttempt, authReady, connectionUsername, connectionOfficeId]);

  if (!authReady) {
    return <FullScreenLoading label="Loading your account…" />;
  }

  if (resetLinkToken) {
    return <><main className="auth-shell"><form className="auth-card" onSubmit={(event) => void submitPasswordReset(event)}><span className="brand-mark">G</span><span className="eyebrow">ACCOUNT RECOVERY</span><h1>{resetDone ? "Password updated" : "Set a new password"}</h1><p>{resetDone ? "You can now sign in with your new password." : "This one-time reset link expires after 15 minutes."}</p>{!resetDone && <><label>New password<input data-tutorial-target="reset-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></label>{resetError && <p className="auth-error" role="alert">{resetError}</p>}<button data-tutorial-target="reset-submit" className="auth-submit" type="submit" disabled={resetBusy}>{resetBusy ? "Please wait…" : "Set password"}</button></>}<a className="auth-switch" href="/">Back to sign in</a></form></main><PageTutorial page="password-reset" />{resetBusy && <FullScreenLoading label="Updating your password…" />}</>;
  }

  if (!authUser) {
    return (
      <>
      <main className="auth-shell">
        <form className="auth-card" onSubmit={(event) => void submitAuth(event)}>
          <span className="brand-mark">G</span>
          <span className="eyebrow">{maintainerPortal ? "PLATFORM OPERATIONS" : "YOUR WORKSPACE"}</span>
          <h1>{maintainerPortal ? "Maintainer sign in" : authMode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p>{(inviteLinkToken || getOfficeShareRouteToken(routePath)) ? "You’ve been invited to an office. Create an account or sign in to join." : maintainerPortal ? "Sign in to manage GAMVerse and its offices." : "Sign in with your office username and password."}</p>
          <label>Username<input data-tutorial-target="auth-username" autoComplete="username" required minLength={3} maxLength={24} value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} /></label>
          {authMode === "register" && <label>Email (optional)<input type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
          <label>Password<div className="auth-password-field"><input data-tutorial-target="auth-password" type={authPasswordVisible ? "text" : "password"} autoComplete={authMode === "login" ? "current-password" : "new-password"} required minLength={8} maxLength={128} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} /><button className="password-visibility-toggle" type="button" aria-label={authPasswordVisible ? "Hide password" : "Show password"} aria-pressed={authPasswordVisible} onClick={() => setAuthPasswordVisible((visible) => !visible)}>{authPasswordVisible ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.8 4.4 10 7-.4.9-1.2 2-2.3 3M6.2 6.3C3.9 7.7 2.5 10 2 12c1.2 0 2-.2 2.9-.5" /></svg>}</button></div></label>
          {authError && <p className="auth-error" role="alert">{authError}</p>}
          <button data-tutorial-target="auth-submit" className="auth-submit" type="submit" disabled={authBusy}>{authBusy ? "Please wait…" : maintainerPortal || authMode === "login" ? "Sign in" : "Create account"}</button>
          {!maintainerPortal && <button className="auth-switch" type="button" onClick={() => { setAuthError(null); setAuthMode(authMode === "login" ? "register" : "login"); }}>
            {authMode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>}
          <a className="auth-switch" href={maintainerPortal ? "/" : "/maintainer"}>{maintainerPortal ? "Regular user sign in" : "Maintainer sign in"}</a>
        </form>
      </main>
      {authBusy && <FullScreenLoading label={authMode === "register" ? "Creating your account…" : "Signing in…"} />}
      </>
    );
  }

  if (authUser.role === "user" && !authUser.characterId) {
    const onboardingCharacterId = characterDraft ?? DEFAULT_CHARACTER_ID;
    const onboardingCharacter = characterDetails(onboardingCharacterId, personalAvatarModels);
    return <><main className="character-onboarding">
      <section className="character-onboarding-card">
        <span className="eyebrow">FIRST TIME HERE</span>
        <h1>Choose your character</h1>
        <p>Pick how other people will see you in the shared office.</p>
        <section className="character-preview-card onboarding-character-preview" aria-label="Selected character preview">
          <CharacterPreview3D characterId={onboardingCharacterId} endpoint={endpoint} label={onboardingCharacter.label} fallbackImage={onboardingCharacter.preview} />
          <div className="character-preview-copy"><span className="eyebrow">3D PREVIEW</span><strong>{onboardingCharacter.label}</strong><span>{onboardingCharacter.source}</span><small>Choose another character below to preview it</small></div>
        </section>
        <div className="tutorial-character-picker" data-tutorial-target="character-picker"><CharacterPicker value={characterDraft} currentCharacterId={null} onChange={setCharacterDraft} /></div>
        {characterError && <p className="auth-error" role="alert">{characterError}</p>}
        <button data-tutorial-target="character-continue" className="auth-submit" type="button" disabled={characterBusy || !characterDraft} onClick={() => void saveCharacter()}>{characterBusy ? "Saving…" : "Continue"}</button>
      </section>
    </main>{characterBusy && <FullScreenLoading label="Saving your character…" />}</>;
  }

  const settingsDialog = settingsOpen && <OfficeSettingsDialog onClose={() => setSettingsOpen(false)}>
        <div className="settings-dialog-body"><nav className="settings-section-nav" aria-label="Settings topics"><button type="button" className={settingsSection === "general" ? "active" : ""} aria-current={settingsSection === "general" ? "page" : undefined} onClick={() => setSettingsSection("general")}>General</button><button type="button" className={settingsSection === "sound" ? "active" : ""} aria-current={settingsSection === "sound" ? "page" : undefined} onClick={() => setSettingsSection("sound")}>Sound</button><button type="button" className={settingsSection === "camera" ? "active" : ""} aria-current={settingsSection === "camera" ? "page" : undefined} onClick={() => setSettingsSection("camera")}>Camera</button><button type="button" className={settingsSection === "permissions" ? "active" : ""} aria-current={settingsSection === "permissions" ? "page" : undefined} onClick={() => setSettingsSection("permissions")}>Permission</button><button type="button" className={settingsSection === "security" ? "active" : ""} aria-current={settingsSection === "security" ? "page" : undefined} onClick={() => setSettingsSection("security")}>Security</button><button type="button" className={settingsSection === "theme" ? "active" : ""} aria-current={settingsSection === "theme" ? "page" : undefined} onClick={() => setSettingsSection("theme")}>Theme</button></nav>
          <div className="settings-section-content">
            {settingsSection === "general" && <OfficeGeneralSettings idleAnimationsEnabled={idleAnimationsEnabled} onIdleAnimationsChange={updateIdleAnimationsEnabled} />}
            {settingsSection === "sound" && <SoundSettings inputDeviceId={audioDevicePreferences.inputDeviceId} outputDeviceId={audioDevicePreferences.outputDeviceId} onInputDeviceChange={switchMicrophoneDevice} onOutputDeviceChange={switchSpeakerDevice} noiseReductionEnabled={noiseReductionEnabled} noiseReductionStatus={noiseReductionStatus} noiseReductionDetails={noiseReductionDetails} onNoiseReductionChange={updateNoiseReductionPreference} />}
            {settingsSection === "camera" && <CameraSettings deviceId={cameraDeviceId} backgroundMode={cameraBackgroundMode} onDeviceChange={switchCameraDevice} onBackgroundModeChange={changeCameraBackgroundMode} />}
            {settingsSection === "permissions" && <section aria-labelledby="permissions-title"><span className="eyebrow">DEVICE ACCESS</span><h3 id="permissions-title">Permissions</h3><p className="settings-intro">Allow GAMVerse to use your microphone, camera, or screen when you choose those controls.</p>
            {(["microphone", "camera"] as const).map((kind) => <div className="permission-row" key={kind}><div><strong>{kind === "microphone" ? "Microphone" : "Camera"}</strong><small className={`permission-state ${browserPermissions[kind]}`}>{browserPermissions[kind] === "unknown" ? "Status unavailable" : browserPermissions[kind]}</small></div><button type="button" className="lobby-button" disabled={permissionBusy !== null} onClick={() => void requestBrowserPermission(kind)}>{permissionBusy === kind ? "Checking…" : browserPermissions[kind] === "denied" ? "Check again" : "Allow access"}</button></div>)}
            <div className="permission-row"><div><strong>Screen sharing</strong><small>Browser asks each time you share</small></div><button type="button" className="lobby-button" disabled={permissionBusy !== null} onClick={() => void requestBrowserPermission("screen")}>{permissionBusy === "screen" ? "Checking…" : "Check sharing"}</button></div>
            {permissionMessage && <p className="permission-message" role="status">{permissionMessage}</p>}{screenPermissionResult && <p className="permission-message" role="status">{screenPermissionResult}</p>}
            {(browserPermissions.microphone === "denied" || browserPermissions.camera === "denied") && <p className="permission-help">If access is blocked, open this site’s permissions from the browser address bar, allow the device, then select Check again.</p>}
          </section>}
            {settingsSection === "security" && <section aria-labelledby="security-title"><span className="eyebrow">ACCOUNT SECURITY</span><h3 id="security-title">Security</h3><p className="settings-intro">Update the password you use to sign in to GAMVerse.</p><button type="button" className="settings-menu-row security-password-action" onClick={() => { setAccountError(null); setChangePasswordOpen(true); }}><span><strong>Change password</strong><small>Choose a new sign-in password</small></span><span aria-hidden="true">›</span></button></section>}
            {settingsSection === "theme" && <OfficeThemeSettings theme={workspaceTheme.theme} onThemeChange={workspaceTheme.setTheme} />}
          </div>
        </div>
      </OfficeSettingsDialog>;

  if (diagnosticsPage) return <MaintainerDiagnosticsPage endpoint={endpoint} allowed={authUser.role === "maintainer"} />;

  if (!activeOffice) {
    return (
      <>
      <main className="lobby-shell">
        <header className="topbar">
          <div className="topbar-side topbar-side-left" aria-hidden="true" />
          <div className="topbar-title"><span className="brand-mark" aria-hidden="true">G</span><strong>GAMVerse</strong></div>
          <div className="topbar-side topbar-side-right">
            <button type="button" className={`right-character-tab${characterPanelOpen ? " selected" : ""}`} aria-label={characterPanelOpen ? "Hide user settings" : "Open user settings"} aria-expanded={characterPanelOpen} aria-controls="character-drawer" title="User settings" onClick={() => { setCharacterPanelOpen((open) => !open); setCharacterError(null); }}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.7"/><path d="M5.5 20c.3-3.5 2.8-5.6 6.5-5.6s6.2 2.1 6.5 5.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
            </button>
          </div>
        </header>
        {characterPanelMounted && <aside id="character-drawer" className={`character-drawer sidebar-transition${characterPanelOpen ? " is-open" : ""}`} aria-label="User account" aria-hidden={!characterPanelOpen} inert={!characterPanelOpen}>
          <header className="character-drawer-header"><div><span className="eyebrow">YOUR ACCOUNT</span><h2>Account & settings</h2></div></header>
          <section className="character-account" aria-label="Your account"><span className="character-account-avatar">{(authUser?.username ?? "U").slice(0, 1).toUpperCase()}</span><div className="character-account-name"><strong>{playerName({ displayName: authUser.username, isMaintainer: authUser.role === "maintainer" })}</strong><span>{authUser.role}</span></div></section>
          <div className="user-settings-content"><section className="user-settings-section"><button type="button" className="settings-menu-row" onClick={() => { setCharacterPanelOpen(false); setProfileDialogOpen(true); }}><span><strong>Profile</strong><small>Edit your display name</small></span><span aria-hidden="true">›</span></button></section><section className="user-settings-section"><button type="button" className="settings-menu-row" onClick={() => { setAccountError(null); setChangePasswordOpen(true); }}><span><strong>Change password</strong><small>Update your sign-in password</small></span><span aria-hidden="true">›</span></button></section><section className="user-settings-section"><button type="button" className="settings-menu-row" onClick={() => { setSettingsSection("general"); setPermissionMessage(null); setCharacterPanelOpen(false); setSettingsOpen(true); void refreshBrowserPermissions(); }}><span><strong>Settings</strong><small>General, sound, camera, permissions, theme</small></span><span aria-hidden="true">›</span></button></section></div>
          <footer className="character-drawer-footer"><button type="button" className="right-drawer-map-mode" aria-label={map2dViewActive ? "Switch to 3D view" : "Switch to 2D view"} onClick={() => map2dToggleRef.current()}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 7 6-3 6 3 6-3v13l-6 3-6-3-6 3V7Z"/><path d="M9 4v13m6-10v13"/></svg><span>{map2dViewActive ? "Switch to 3D" : "Switch to 2D"}</span></button><button type="button" className="account-action signout" onClick={signOut.request}>Sign out</button></footer>
        </aside>}
        <section className="lobby-content">
          <div className="lobby-intro"><span className="eyebrow">YOUR WORKSPACE</span><div className="lobby-intro-heading"><h1>{authUser.role === "maintainer" ? "Manage offices" : "Choose an office"}</h1><button data-tutorial-target="lobby-create-office" className="lobby-button primary" type="button" onClick={() => { setLobbyError(null); setCreateOfficeDialogOpen(true); }}>＋ Create office</button></div><p>Enter an office you belong to, accept an invitation, or start a new office.</p></div>
          {authUser.role === "maintainer" && <>
            <a className="lobby-diagnostics-entry" href="/maintainer/diagnostics">
              <span className="lobby-diagnostics-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg></span>
              <span><strong>Runtime diagnostics</strong><small>Performance, connection issues & error history</small></span>
              <span className="lobby-diagnostics-open" aria-hidden="true">View diagnostics →</span>
            </a>
            <MaintainerSystemPanel endpoint={endpoint} />
          </>}
          {lobbyError && <p className="auth-error" role="alert">{lobbyError}</p>}
          {accountError && <p className="auth-error" role="alert">{accountError}</p>}
          {createOfficeDialogOpen && <CreateOfficeDialog name={officeName} totalPeople={generatorTotalPeople} teamCount={generatorTeamCount}
            peoplePerTeam={createOfficePeoplePerTeam} inputsValid={createOfficeInputsValid} interiors={createOfficeInteriors} busy={lobbyBusy} error={lobbyError}
            onNameChange={setOfficeName} onTotalPeopleChange={setGeneratorTotalPeople} onTeamCountChange={setGeneratorTeamCount} onInteriorsChange={setCreateOfficeInteriors}
            onSubmit={(event) => void createOfficeAction(event)} onClose={() => setCreateOfficeDialogOpen(false)} />}
          <LobbyDirectory endpoint={endpoint} username={authUser.username} maintainer={authUser.role === "maintainer"}
            officesRevision={offices} invitesRevision={invites} busy={lobbyBusy} inviteToken={inviteLinkToken}
            resetUrls={resetUrls}
            onEnter={selectOffice} onManage={(office) => void openOfficeManager(office)}
            onShareOffice={officeShare.open}
            onAccept={(inviteId) => void acceptInvite(inviteId)} onResetLink={issueResetLink} />
        </section>
        {settingsDialog}{signOut.dialog}{officeShare.dialog}
        {profileDialog}
        {changePasswordOpen && <div className="manager-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setChangePasswordOpen(false); }}><form className="manager-dialog password-dialog" onSubmit={(event) => void changePassword(event)}><button type="button" className="manager-close" aria-label="Close" onClick={() => setChangePasswordOpen(false)}>×</button><span className="eyebrow">ACCOUNT SECURITY</span><h2>Change password</h2><label>Current password<input type="password" autoComplete="current-password" required minLength={8} maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label>New password<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>{accountError && <p className="auth-error" role="alert">{accountError}</p>}<button className="lobby-button primary" disabled={lobbyBusy} type="submit">Update password</button></form></div>}
        {managingOffice && <div className="manager-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setManagingOffice(null); }}>
          <section className="manager-dialog" role="dialog" aria-modal="true" aria-labelledby="manager-title">
            <button className="manager-close" aria-label="Close" onClick={() => setManagingOffice(null)}>×</button>
            <span className="eyebrow">OFFICE MANAGEMENT · {managingOffice.role.toUpperCase()}</span>
            <h2 id="manager-title">{managingOffice.name}</h2>
            <p className="manager-owner">Owner: {managingOffice.ownerUsername} · ownership cannot be transferred</p>
            {["owner", "maintainer"].includes(managingOffice.role) && <form className="manager-name-form" onSubmit={(event) => void saveOfficeName(event)}><input aria-label="Office name" value={managedOfficeName} onChange={(event) => setManagedOfficeName(event.target.value)} minLength={2} maxLength={64} /><button className="lobby-button" type="submit" disabled={lobbyBusy}>Save name</button></form>}
            <form className="manager-invite-form" onSubmit={(event) => void sendOfficeInvite(event)}>
              <label><span className="eyebrow">INVITE BY USERNAME OR CREATE LINK</span><input value={inviteUsername} onChange={(event) => setInviteUsername(event.target.value)} placeholder="Username (leave blank for one-time link)" maxLength={24} /></label>
              <select aria-label="Invited office role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "admin" | "user")} disabled={!(["owner", "maintainer"].includes(managingOffice.role))}>
                <option value="user">User</option><option value="admin">Admin</option>
              </select>
              <button className="lobby-button primary" type="submit" disabled={lobbyBusy}>{inviteUsername.trim() ? "Send invite" : "Create link"}</button>
            </form>
            {inviteUrl && <div className="invite-link-box"><code>{inviteUrl}</code><button className="lobby-button" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>Copy link</button><small>One use · expires in 7 days</small></div>}
            {lobbyError && <p className="auth-error" role="alert">{lobbyError}</p>}
            <div className="manager-members-heading"><strong>Members</strong><span>{officeMembers.length}</span></div>
            <ul className="manager-member-list">{officeMembers.map((member) => {
              const canManageAdmins = ["owner", "maintainer"].includes(managingOffice.role);
              const canManageUsers = ["owner", "admin", "maintainer"].includes(managingOffice.role);
              const canEdit = member.role !== "owner" && (member.role === "admin" ? canManageAdmins : canManageUsers);
              return <li key={member.username}><div><strong>{member.username}</strong><small>{member.role}</small></div>{canEdit && <div className="member-actions">
                {canManageAdmins && <button className="lobby-button" disabled={lobbyBusy} onClick={() => void changeMemberRole(member, member.role === "admin" ? "user" : "admin")}>{member.role === "admin" ? "Make user" : "Make admin"}</button>}
                <button className="lobby-button danger" disabled={lobbyBusy} onClick={() => void removeMember(member)}>Remove</button>
              </div>}</li>;
            })}</ul>
            {["owner", "maintainer"].includes(managingOffice.role) && <section className="office-delete-section">
              <div><strong>Delete office</strong><p>Permanently removes this office, its members, invitations, shared map, zones, and activity.</p></div>
              {!officeDeleteConfirmOpen ? <button className="lobby-button danger" disabled={lobbyBusy} onClick={() => { setOfficeDeleteName(""); setOfficeDeleteError(null); setOfficeDeleteConfirmOpen(true); }}>Delete office</button> : <div className="office-delete-confirm">
                <p>This cannot be undone. Type <strong>{managingOffice.name}</strong> to confirm deletion.</p>
                <input aria-label="Type office name to confirm deletion" value={officeDeleteName} onChange={(event) => setOfficeDeleteName(event.target.value)} autoComplete="off" />
                {officeDeleteError && <p className="auth-error" role="alert">{officeDeleteError}</p>}
                <div><button className="lobby-button" disabled={lobbyBusy} onClick={() => setOfficeDeleteConfirmOpen(false)}>Cancel</button><button className="lobby-button danger office-delete-submit" disabled={lobbyBusy || officeDeleteName.trim() !== managingOffice.name} onClick={() => void deleteManagedOffice()}>{lobbyBusy ? "Deleting…" : "Delete permanently"}</button></div>
              </div>}
            </section>}
          </section>
        </div>}
      </main>
      <PageTutorial page="lobby" username={authUser.username} />
      {initialLobbyLoading && <FullScreenLoading label="Loading your workspace…" />}
      </>
    );
  }

  const emptyPeopleMessage = status === "connecting" || status === "reconnecting"
    ? "Connecting to the office…"
    : status === "error" || status === "disconnected"
      ? "Reconnect to see who's here."
      : "You're the first one here.";
  const selectedVoiceConnected = meetingZoneActive ? voiceConnected : privateZoneId ? privateVoiceConnected : proximityVoiceConnected;
  const selectedMicMuted = meetingZoneActive ? voiceMuted : privateZoneId ? privateVoiceMuted : proximityVoiceMuted;
  const activeDeskZoneId = privateZoneId ?? selectedDeskZoneId;
  const selectedMapZone = selectedMapZoneId ? officeMapLayout?.zones.find((zone) => zone.id === selectedMapZoneId) ?? null : null;
  const mapDraftDirty = Boolean(mapEditMode && officeMapLayout && mapEditBaseline && JSON.stringify(officeMapLayout) !== JSON.stringify(mapEditBaseline));
  mapDraftDirtyRef.current = mapDraftDirty;
  const entranceWallLength = mapZoneArea ? mapZoneEntranceSide === "north" || mapZoneEntranceSide === "south" ? mapZoneArea.width : mapZoneArea.depth : 0;
  const entranceOpeningWidth = Math.min(mapZoneEntranceKind === "opening" ? 1.2 : mapZoneDoorLeaves === 2 ? 2.4 : 1.2, entranceWallLength);
  const entrancePositions = mapZoneDoorOffsets.slice(0, mapZoneDoorCount).map((offset) => Math.max(-entranceWallLength / 2 + entranceOpeningWidth / 2, Math.min(entranceWallLength / 2 - entranceOpeningWidth / 2, offset))).sort((a, b) => a - b);
  const entrancesOverlap = entrancePositions.some((offset, index) => index > 0 && offset - entrancePositions[index - 1]! < entranceOpeningWidth - 0.01);
  const entrancesFit = !mapZoneEnclosureEnabled || (entranceWallLength >= entranceOpeningWidth * mapZoneDoorCount && !entrancesOverlap);
  const mapZoneDraft = mapZoneArea ? buildMapZoneDraft("zone-preview") : null;
  const zoneEntranceIssue = mapZoneEnclosureEnabled && mapZoneDraft ? roomZoneEntranceIssues(mapZoneDraft.layout, new Set(["zone-preview"]))[0] : undefined;
  const zoneOverlapsExisting = Boolean(mapZoneArea && officeMapLayout?.zones.some((zone) =>
    Math.abs(mapZoneArea.x - zone.x) < (mapZoneArea.width + zone.width) / 2 - 0.01 &&
    Math.abs(mapZoneArea.z - zone.z) < (mapZoneArea.depth + zone.depth) / 2 - 0.01));
  const zoneCreationValid = Boolean(entrancesFit && mapZoneDraft?.withinBounds && !zoneOverlapsExisting && !zoneEntranceIssue);
  const selectedZoneEntranceBlocked = Boolean(selectedMapZoneId && officeMapLayout && roomZoneEntranceIssues(officeMapLayout, new Set([selectedMapZoneId])).length);
  const selectedZoneHasGeneratedDoor = Boolean(selectedMapZoneId && officeMapLayout?.doors.some((door) => door.id.startsWith(`${selectedMapZoneId}-entrance-`)));
  const activeDeskZone = activeDeskZoneId ? officeMapLayout?.zones.find((zone) => zone.id === activeDeskZoneId && zone.kind === "private") ?? null : null;
  const personalDeskZone = officeDesks.ownDesk ? officeMapLayout?.zones.find((zone) => zone.id === officeDesks.ownDesk?.zoneId && zone.kind === "private") ?? null : null;
  const activeDeskZoneLabel = activeDeskZone?.ownerUsername ? `${activeDeskZone.ownerUsername}'s desk` : activeDeskZone ? "Available desk" : null;
  const activeDeskZoneIsCurrent = Boolean(privateZoneId && activeDeskZone?.id === privateZoneId);
  const canManageCurrentDesk = Boolean(activeDeskZoneIsCurrent && activeDeskZone?.ownerUsername === authUser?.username);
  const zoneAccessDetail = activeDeskZone
    ? `${activeDeskZoneIsCurrent ? "You’re here · " : ""}${activeDeskZone.ownerUsername ? activeDeskZone.ownerUsername === authUser?.username ? "Your desk" : `Desk owned by ${activeDeskZone.ownerUsername}` : "No owner · available to claim"}`
    : meetingZoneId ? `You’re here · ${lockedZoneIds.includes(meetingZoneId) ? "Locked to current occupants" : "Open to everyone"}` : "Open to everyone";
  const roomIsLocked = Boolean(zonePrivacyTargetId && lockedZoneIds.includes(zonePrivacyTargetId));
  const roomLockAction = roomIsLocked ? { action: "unlock" as const } : { action: "lock" as const };
  const roomLockEnabled = officeConversations.privateAccess.snapshot?.zoneId === zonePrivacyTargetId
    && privateActionEnabled(officeConversations.privateAccess.snapshot, roomLockAction,
      officeConversations.privateAccess.pending, officeConversations.privateAccess.nowMs);
  const admittedRosterSessions = new Set(conversation?.conversation?.members.map(member => member.sessionId) ?? []);
  const voiceRosterPeople: VoiceRosterPerson[] = people.filter(([id]) => admittedRosterSessions.has(id)).map(([sessionId, player]) => ({
    sessionId, username: player.username, displayName: player.displayName, isMaintainer: player.isMaintainer,
    status: player.status, presence: player.presence, local: sessionId === localSessionIdRef.current, nearby: player.nearby,
  }));
  const userOwnsAnotherDesk = Boolean(activeDeskZone && officeDesks.ownDesk && officeDesks.ownDesk.zoneId !== activeDeskZone.id);
  const canClaimAnyDesk = status === "connected" && !deskClaimBusy && !officeDesks.ownDesk;
  const previewCharacterId = characterDraft ?? authUser.characterId ?? DEFAULT_CHARACTER_ID;
  const previewCharacter = characterDetails(previewCharacterId, personalAvatarModels);
  const displayedOfficeMapLayout = modifyPropsOpen && officeMapLayout ? { ...officeMapLayout, props: modifyPropsDraft } : officeMapLayout;
  const setGhostMode = (enabled: boolean) => {
    if (enabled && appPausedRef.current) return;
    roomRef.current?.send("ghost-mode", { enabled });
  };

  const openConversations = () => {
    heldKeysRef.current.clear();
    lockedMovementRef.current = null;
    sendHeldMovementRef.current();
    setMapPlayerAction(null);
    setConversationsOpen(true);
  };
  const openWorkspacePanel = (panel: OfficePanel) => { setActiveLeftTab(panel); setWorkspacePanelOpen(true); setCharacterPanelOpen(false); };
  const personActionContext: PersonActionContext = {
    localSessionId: localSessionIdRef.current, localUsername: authUser.username, followingSessionId,
    spotlightUsernames: social.spotlight.usernames, spotlightPendingUsernames: social.spotlightRequests.outgoing.map(request => request.targetUsername), canSpotlight: activeOffice.role === "owner" || activeOffice.role === "admin",
    disabled: status !== "connected", canMeet: true, localStatus: userStatus, meetPending: meetOffers.pending,
  };
  const personActionCallbacks: PersonActionCallbacks = {
    onMeet: sessionId => { meetOffers.create("meet", sessionId); },
    onInviteToJoin: sessionId => { meetOffers.create("join-me", sessionId); },
    onMessage: username => { setChatTarget(username); setChatTargetRevision(revision => revision + 1); openWorkspacePanel("chat"); },
    onGoTo: sessionId => { if (!travel.expectDestination(null)) return; roomRef.current?.send("auto-move-to-player", { targetSessionId: sessionId }); },
    onLocate: sessionId => { locateRequestRef.current = { sessionId, requestId: performance.now() }; },
    onFollow: sessionId => { travel.reset(); if (followingSessionId === sessionId) roomRef.current?.send("follow-stop"); else roomRef.current?.send("follow-player", { targetSessionId: sessionId }); },
    onWave: sessionId => roomRef.current?.send("wave", { targetSessionId: sessionId }),
    onSpotlight: username => {
      const pending = social.spotlightRequests.outgoing.find(request => request.targetUsername === username);
      if (pending) roomRef.current?.send("spotlight", { action: "cancel", requestId: pending.id });
      else if (social.spotlight.usernames.includes(username)) roomRef.current?.send("spotlight", { action: "stop", targetUsername: username });
      else roomRef.current?.send("spotlight", { action: "request", targetUsername: username });
    },
  };
  const selectedMapPerson = people.find(([sessionId]) => sessionId === mapPlayerAction?.sessionId);
  return (
    <main className={`app-shell office-experience${characterPanelOpen ? " character-panel-open" : ""}`} onPointerDownCapture={(event) => {
      if (workspacePanelOpen && event.target instanceof Element && event.target.closest(".world-canvas")) setWorkspacePanelOpen(false);
    }}>
      <PageTutorial page={meetingEntry ? "meeting" : "office"} username={authUser.username} />
      {profileDialog}
      <WorldCanvas activeRoomKey="lobby" cameraRoomKey={activeCameraRoomKey} playersRef={playersRef} localSessionIdRef={localSessionIdRef} localPetIdRef={localPetIdRef} map2dToggleRef={map2dToggleRef} onMapViewChange={setMap2dViewActive} speakingUsernamesRef={speakingUsernamesRef} heldKeysRef={heldKeysRef} cameraYawRef={cameraYawRef} cameraBehindCharacterRef={cameraBehindCharacterRef} firstPersonViewRef={firstPersonViewRef} map2dDecorationsRef={social.decorationsRef} map2dViewRef={map2dViewRef} locateRequestRef={locateRequestRef} travelFeedback={travel.feedback} travelRequesting={travel.requesting} onCancelTravel={() => roomRef.current?.send("auto-move-cancel", {})} propsConfigVersion={modifyPropsOpen ? modifyPropsVersion : mapPropsConfigVersion} roomLayout={displayedOfficeMapLayout} personalDeskZone={personalDeskZone} onReturnToDesk={returnToDesk} deskClaimingZoneId={deskClaimingZoneId} currentPrivateZoneId={privateZoneId} inboundAudioMuted={inboundAudioMutedRef.current} appPaused={deskManagerOpen || conversationsOpen || Boolean(social.interaction) || workspaceOverlayOpen} idleAnimationsEnabled={idleAnimationsEnabled} ghostSessionIds={ghostSessionIds} mapEditMode={mapEditMode} selectedMapZoneId={selectedMapZoneId} buildMode={modifyPropsOpen || mapBuildingPickerOpen} selectedAsset={mapBuildingPickerOpen ? selectedMapBuildingAsset : selectedModifyPropAsset} selectedMapItemId={selectedModifyPropId} onPlaceProp={(asset, position) => mapEditMode ? placeMapBuilding(asset, position) : placeOfficeProp(asset, position)} onPlacementComplete={() => { if (!mapEditMode) setSelectedModifyPropAsset(null); else if (ROOM_PROP_CATALOG.find((item) => item.asset === selectedMapBuildingAsset)?.editorRole !== "map-component") setSelectedMapBuildingAsset(null); }} onMoveProp={(id, position) => mapEditMode ? moveMapBuilding(id, position) : moveOfficeProp(id, position)} onRotateProp={(id) => mapEditMode ? rotateMapBuilding(id) : rotateOfficeProp(id)} onDeleteProp={(id) => mapEditMode ? deleteMapBuilding(id) : deleteOfficeProp(id)} onSelectMapItem={setSelectedModifyPropId} onModifyProps={() => void enterModifyPropsMode()} spawnPlacementMode={spawnPlacementMode} onMoveSpawnPoint={(position) => void saveMapSpawnPoint(position)} zoneDrawing={mapZoneDrawing} onZoneAreaDrawn={(area) => { setMapZoneArea(area); setMapZoneDrawing(false); setMapZoneName(""); setLobbyError(null); }} onSelectDeskZone={(zoneId) => setSelectedDeskZoneId(zoneId)} onSelectMapZone={(zoneId) => setSelectedMapZoneId(zoneId)} onClaimDeskZone={(zoneId) => void claimDeskZone(zoneId)} canClaimDesk={canClaimAnyDesk} canEditMap={authUser?.role === "maintainer" || activeOffice.role === "owner" || activeOffice.role === "admin"} mapEditorUsername={mapEditorUsername} mapEditLockPending={mapEditLockRequestPending} onEditMap={() => enterMapEditMode(activeOffice)} blasterEventsRef={blasterEventsRef} jumpStartedAtRef={jumpStartedAtRef} onJump={() => roomRef.current?.send("jump", true)} onBlasterShot={(shot) => { if (!appPausedRef.current) roomRef.current?.send("blaster-shot", shot); }} onWeaponEquip={(weaponId) => { if (!appPausedRef.current) roomRef.current?.send("weapon-equip", weaponId); }} onVehicleInteract={(vehicleId, propId) => { if (!appPausedRef.current) roomRef.current?.send("vehicle-interact", vehicleId ? { vehicleId, propId } : ""); }} onAutoMove={(destination) => { if (appPausedRef.current) return; if (!travel.expectDestination(destination)) return; heldKeysRef.current.clear(); lockedMovementRef.current = null; roomRef.current?.send("auto-move", { ...destination, randomVehicle: true }); }} onSelectPlayer={(sessionId) => { const player = playersRef.current.get(sessionId); if (player?.presence === "online") setMapPlayerAction({ sessionId }); }} onGhostModeChange={setGhostMode} />
      <OfficeSocialOverlay social={social} room={status === "connected" ? roomRef.current as unknown as ChatTransport : null} endpoint={endpoint} officeId={activeOffice.id} username={authUser.username} sessionKey={localSessionIdRef.current} chatTarget={chatTarget} chatTargetRevision={chatTargetRevision} chatContainer={chatContainer} chatVisible={activeLeftTab === "chat" && workspacePanelOpen} onUnread={setChatUnread} doNotDisturb={mediaSuppressed} zoneUsernames={zoneAudioUsernames} />
      <Minimap layout={displayedOfficeMapLayout} configVersion={mapPropsConfigVersion} playersRef={playersRef} localSessionIdRef={localSessionIdRef} cameraYawRef={cameraYawRef} hidden={mapEditMode || modifyPropsOpen} />
      <VoiceMediaWorkspace viewer={remoteMediaViewer} people={voiceRosterPeople} speakingUsernames={speakingUsernames} activities={voiceRosterActivities}
        audioLevels={participantAudioLevels} canMuteAll={voiceRosterPeople.filter(person => !person.local).length > 1 && ["owner", "admin"].includes(activeOffice.role)}
        onSetAudioLevel={setParticipantAudioLevel}
        onModeratePerson={(username, source) => void moderateVoiceMedia(source, username)} onMuteAll={source => void moderateVoiceMedia(source)} />
      <OfficeConversationHub model={officeConversations} open={conversationsOpen} connected={status === "connected"}
        userStatus={userStatus} localSessionId={localSessionIdRef.current} onOpen={openConversations} onClose={() => setConversationsOpen(false)}
        onApproach={id => { if (!travel.expectDestination(null)) return; if (!publicConversations.approach(id)) travel.reset(); }}
        onOfferAction={(id, action) => { if (meetOffers.act(id, action) && action === "accept") travel.reset(); }} />
      {selectedMapPerson && <MapPersonDialog {...personActionContext} {...personActionCallbacks} entry={selectedMapPerson} onClose={() => setMapPlayerAction(null)} />}
      {blasterHitNotice !== null && <div className="blaster-hit-feedback" key={blasterHitNotice} aria-hidden="true" />}
      <WorkspaceChrome key={activeOffice.id} officeId={activeOffice.id} offices={offices}
        username={authUser.nickname ?? authUser.username} onlineCount={people.filter(([, person]) => person.presence === "online").length} people={people.filter(([id]) => id !== localSessionIdRef.current).map(([sessionId, person]) => ({ ...person, sessionId }))}
        rooms={officeMapLayout?.zones ?? []} panel={activeLeftTab} panelOpen={workspacePanelOpen} unread={chatUnread} accountOpen={characterPanelOpen}
        navigationDisabled={status !== "connected" || mapEditMode || modifyPropsOpen} onInputBlocked={setWorkspaceInputBlocked}
        onSelectPanel={(panel) => { setWorkspacePanelOpen(panel !== activeLeftTab || !workspacePanelOpen); setActiveLeftTab(panel); setCharacterPanelOpen(false); }}
        onOpenPanel={openWorkspacePanel} onAccount={() => { setCharacterPanelOpen((open) => !open); setWorkspacePanelOpen(false); setCharacterError(null); }}
        onSwitchOffice={(id) => { const office = offices.find((item) => item.id === id); if (office) selectOffice(office); }}
        onLocate={personActionCallbacks.onLocate} onGoTo={personActionCallbacks.onGoTo}
        onGoToRoom={(zoneId) => { const zone = officeMapLayout?.zones.find((item) => item.id === zoneId); if (zone) { if (!travel.expectDestination(zone)) return; roomRef.current?.send("auto-move", { x: zone.x, z: zone.z, randomVehicle: true }); } }} />
      {workspacePanelMounted && <aside id="office-sidebar" onKeyDown={onWorkspacePanelKeyDown} className={`office-sidebar sidebar-transition${workspacePanelOpen ? " is-open" : ""}`} aria-labelledby="office-panel-title" aria-hidden={!workspacePanelOpen} inert={!workspacePanelOpen}>
        <OfficePanelHeader panel={activeLeftTab} />
        <div className="office-chat-slot" ref={setChatContainer} />
        {activeLeftTab === "workspace" && <section className="sidebar-workspace" aria-label="Your workspace">
          <span className="eyebrow">WORKSPACE</span>
          <h1>{activeOffice.name}</h1>
          <div className="room-meta"><span className="live-indicator" /> {activeOffice.role} <span className="meta-divider">·</span> Owner: {activeOffice.ownerUsername}</div>
          <div className="office-space-card" aria-label="Office space"><span>{mapDimensions.width} × {mapDimensions.depth} m</span><span>One shared space</span></div>
          {(["owner", "admin", "maintainer"] as string[]).includes(activeOffice.role) ? <button type="button" className="workspace-share-button" aria-label={SHARE_OFFICE_LABEL} title={SHARE_OFFICE_LABEL} onClick={() => officeShare.open(activeOffice)}>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10.5 10.5 7a3 3 0 0 1 4.2 4.2l-2 2"/><path d="m13 9.5-3.5 3.5a3 3 0 0 1-4.2-4.2l2-2"/></svg>
            <span>{SHARE_OFFICE_LABEL}</span>
          </button> : <p className="workspace-share-notice">Ask an office admin to invite someone.</p>}
        </section>}
        {activeLeftTab === "people" && <PeoplePanel {...personActionContext} {...personActionCallbacks} people={people}
          directoryEndpoint={endpoint} officeId={activeOffice.id} directoryRefreshKey={status} emptyMessage={emptyPeopleMessage} />}
        {activeLeftTab === "activity" && <section className="sidebar-activity" aria-label="Office activity log">
          <div className="card-heading"><div><span className="eyebrow">OFFICE HISTORY</span><h2>Activity</h2></div><span className="activity-retention">Last 24 hours</span></div>
          {activityError ? <p className="empty-people" role="alert">{activityError}</p> : officeActivities.length === 0 ? <p className="empty-people">{activityBusy ? "Loading activity…" : "No activity recorded in the last 24 hours."}</p> : <ul className="office-activity-list">
            {officeActivities.map((activity) => <li key={activity.id} className="office-activity-row">
              <span className="person-avatar">{activity.actorUsername.slice(0, 1).toUpperCase()}</span>
              <span className="office-activity-copy"><strong>{activity.actorUsername}</strong><small>{officeActivityLabels[activity.activityType]}{officeActivityLocation(activity) ? ` · ${officeActivityLocation(activity)}` : ""}</small></span>
              <time dateTime={activity.occurredAt}>{new Date(activity.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
            </li>)}
          </ul>}
        </section>}
      </aside>}

      {characterPanelMounted && <aside id="character-drawer" className={`character-drawer sidebar-transition${characterPanelOpen ? " is-open" : ""}`} aria-label="User settings menu" aria-hidden={!characterPanelOpen} inert={!characterPanelOpen}>
        <header className="character-drawer-header"><div><span className="eyebrow">YOUR ACCOUNT</span><h2>Account & settings</h2></div></header>
        <section className="character-account" aria-label="Your account"><span className="character-account-avatar">{(authUser?.username ?? "U").slice(0, 1).toUpperCase()}</span><div className="character-account-name"><strong>{playerName({ displayName: authUser.username, isMaintainer: authUser.role === "maintainer" })}</strong><span>{authUser.role}</span></div></section>
        <div className="user-settings-content">
          <section className="user-settings-section"><button type="button" className="settings-menu-row" onClick={() => { setCharacterPanelOpen(false); setProfileDialogOpen(true); }}><span><strong>Profile</strong><small>Edit your display name</small></span><span aria-hidden="true">›</span></button></section>
          <section className="user-settings-section" aria-labelledby="character-settings-title">
            <button type="button" className="settings-menu-row" id="character-settings-title" onClick={() => { setCharacterDraft(authUser.characterId ?? DEFAULT_CHARACTER_ID); setCharacterDialogInitialPetId(activePetId); setCharacterPanelOpen(false); setWorkspacePanelOpen(false); setCharacterDialogOpen(true); }}><span><strong>Character</strong><small>View and customize your character</small></span><span aria-hidden="true">›</span></button>
          </section>
          <section className="user-settings-section" aria-labelledby="user-settings-title">
            <button type="button" className="settings-menu-row" id="user-settings-title" onClick={() => { setSettingsSection("general"); setPermissionMessage(null); setCharacterPanelOpen(false); setWorkspacePanelOpen(false); setSettingsOpen(true); void refreshBrowserPermissions(); }}><span><strong>Settings</strong><small>General, permissions, and security</small></span><span aria-hidden="true">›</span></button>
          </section>
        </div>
        <footer className="character-drawer-footer"><button type="button" className="right-drawer-map-mode" aria-label={map2dViewActive ? "Switch to 3D view" : "Switch to 2D view"} onClick={() => map2dToggleRef.current()}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 7 6-3 6 3 6-3v13l-6 3-6-3-6 3V7Z"/><path d="M9 4v13m6-10v13"/></svg><span>{map2dViewActive ? "Switch to 3D" : "Switch to 2D"}</span></button><button type="button" className="account-action signout" onClick={signOut.request}>Sign out</button></footer>
      </aside>}

      {characterDialogOpen && createPortal(<div className="profile-dialog-backdrop character-select-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCharacterDialogOpen(false); }}><section className="profile-dialog character-select-dialog" role="dialog" aria-modal="true" aria-labelledby="character-select-title">
        <header className="profile-dialog-header"><div><span className="eyebrow">APPEARANCE</span><h2 id="character-select-title">Choose your character</h2></div><button type="button" className="icon-button" aria-label="Close character selection" onClick={() => setCharacterDialogOpen(false)}><FeatherIcon name="close" size={17} /></button></header>
        <div className="profile-dialog-content">
          <section className="character-preview-card" aria-label="Selected character preview">
            <CharacterPreview3D characterId={previewCharacterId} endpoint={endpoint} label={previewCharacter.label} fallbackImage={previewCharacter.preview} />
            <div className="character-preview-copy"><span className="eyebrow">3D PREVIEW</span><strong>{previewCharacter.label}</strong><span>{previewCharacter.source}</span><small>Drag the model to rotate it</small></div>
          </section>
          <CharacterPicker value={characterDraft} currentCharacterId={authUser.characterId ?? DEFAULT_CHARACTER_ID} onChange={setCharacterDraft} />
          <section className="personal-models-section" aria-label="Personal 3D models">
            <div className="personal-models-heading"><div><span className="eyebrow">YOUR MODELS</span><p className="personal-model-help">One GLB file with embedded model textures, up to 10 MiB. Only you can choose or remove it.</p></div><button type="button" className="personal-model-add" disabled={avatarUploadBusy} onClick={() => avatarUploadInputRef.current?.click()}>{avatarUploadBusy ? "Uploading…" : "Add model"}</button></div>
            <input ref={avatarUploadInputRef} className="visually-hidden" type="file" accept=".glb,model/gltf-binary" onChange={(event) => void uploadPersonalAvatar(event)} aria-label="Upload a GLB character model" />
            {personalModelsBusy && <p className="personal-model-status">Loading your models…</p>}
            {personalModelsError && <p className="auth-error" role="alert">{personalModelsError}</p>}
            <PersonalAvatarPicker models={personalAvatarModels} value={characterDraft} currentCharacterId={authUser.characterId ?? DEFAULT_CHARACTER_ID} onChange={setCharacterDraft} onRemove={(model) => void removePersonalAvatar(model)} />
          </section>
          <section className="companion-section" aria-label="Choose a companion pet">
            <div className="personal-models-heading"><div><span className="eyebrow">COMPANION</span><p className="personal-model-help">Choose a pet to follow you around the office.</p></div><button type="button" className="companion-none" aria-pressed={!activePetId} onClick={() => { localPetIdRef.current = ""; setActivePetId(""); window.localStorage.removeItem(`gammyverse.pet.${authUser.username}`); roomRef.current?.send("pet", ""); }}>None</button></div>
            {activePetId && <section className="character-preview-card companion-preview-card" aria-label={`3D preview of ${petLabel(activePetId)}`}>
              <CharacterPreview3D characterId={activePetId} modelUrl={petModelUrl(activePetId)} endpoint={endpoint} label={petLabel(activePetId)} fallbackImage={petPreviewUrl(activePetId)} />
              <div className="character-preview-copy"><span className="eyebrow">PET PREVIEW</span><strong>{petLabel(activePetId)}</strong><span>Drag the model to rotate it</span></div>
            </section>}
            <div className="companion-picker" role="group" aria-label="Available pets">{KENNEY_PET_IDS.map((petId) => <button type="button" key={petId} className={`companion-card${activePetId === petId ? " selected" : ""}`} aria-pressed={activePetId === petId} title={petLabel(petId)} onClick={() => { localPetIdRef.current = petId; setActivePetId(petId); window.localStorage.setItem(`gammyverse.pet.${authUser.username}`, petId); roomRef.current?.send("pet", petId); }}><PetThumbnail petId={petId} fallbackPreview={petPreviewUrl(petId)} /><span>{petLabel(petId)}</span></button>)}</div>
          </section>
        </div>
        <footer className="profile-dialog-footer">{characterError && <p className="auth-error" role="alert">{characterError}</p>}<button type="button" className="auth-submit" aria-busy={characterBusy} disabled={characterBusy || !characterDraft || (characterDraft === authUser.characterId && activePetId === characterDialogInitialPetId)} onClick={() => { if (characterDraft === authUser.characterId) setCharacterDialogOpen(false); else void saveCharacter(); }}>{characterBusy ? "Saving…" : "Save character"}</button></footer>
      </section></div>, document.body)}

      {settingsDialog}{signOut.dialog}{officeShare.dialog}

      {changePasswordOpen && <WorkspaceDialog labelledBy="change-password-title" onClose={() => setChangePasswordOpen(false)} className="password-settings-dialog"><form className="manager-dialog password-dialog" onSubmit={(event) => void changePassword(event)}><button type="button" className="manager-close" aria-label="Close" onClick={() => setChangePasswordOpen(false)}>×</button><span className="eyebrow">ACCOUNT SECURITY</span><h2 id="change-password-title">Change password</h2><label>Current password<input type="password" autoComplete="current-password" required minLength={8} maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label>New password<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>{accountError && <p className="auth-error" role="alert">{accountError}</p>}<button className="lobby-button primary" disabled={lobbyBusy} type="submit">Update password</button></form></WorkspaceDialog>}

      {mapEditMode && <div className="map-edit-controls">
        <div className="map-edit-mode-bar">
          <div className="map-edit-summary"><span className="eyebrow">MAP SIZE</span><strong>{mapDimensions.width} × {mapDimensions.depth} m</strong><small>Grid 1 m · Major lines 10 m</small></div>
          <div className="map-edit-group map-edit-layout-group"><span className="map-edit-group-label">LAYOUT</span>
            {mapZoneDrawing ? <><span className="map-edit-hint">Drag on map to draw zone</span><button type="button" className="lobby-button quiet" onClick={() => setMapZoneDrawing(false)}>Cancel</button></> : <button type="button" className="lobby-button primary" onClick={() => { setSpawnPlacementMode(false); startMapZoneDrawing(); }}>＋ Zone</button>}
          </div>
          {!mapZoneDrawing && <div className="map-edit-group"><span className="map-edit-group-label">WORLD</span>
            <button type="button" className={`lobby-button quiet${mapBuildingPickerOpen ? " primary" : ""}`} onClick={() => { setSpawnPlacementMode(false); setMapZoneDrawing(false); setMapBuildingPickerOpen((open) => !open); setSelectedMapBuildingAsset(null); setSelectedModifyPropId(null); }}>Components</button>
            <button type="button" className={`lobby-button quiet${spawnPlacementMode ? " primary" : ""}`} disabled={mapSpawnSaving} title="Choose where new users start" onClick={() => { setMapZoneDrawing(false); setLobbyError(null); setSpawnPlacementMode((placing) => !placing); }}>{mapSpawnSaving ? "Saving…" : spawnPlacementMode ? "Cancel spawn" : "◎ Spawn"}</button>
          </div>}
          {spawnPlacementMode && <span className="map-edit-hint">Click map to move spawn</span>}
          <div className="map-edit-group map-edit-finish-group"><span className="map-edit-group-label">FINISH</span>
            {mapDraftDirty && <button type="button" className="lobby-button primary" disabled={mapSaving || Boolean(mapConflictLatest)} onClick={() => void saveMapDraft()}>{mapSaving ? "Saving…" : "Save"}</button>}
            <button type="button" className="lobby-button quiet" onClick={exitMapEditMode}>{mapDraftDirty ? "Discard & exit" : "Exit"}</button>
          </div>
        </div>
        {mapBuildingPickerOpen && officeMapLayout && <MapBuildingPicker props={officeMapLayout.props} selectedAsset={selectedMapBuildingAsset} selectedPropId={selectedModifyPropId} onSelectAsset={(asset) => setSelectedMapBuildingAsset(asset as RoomLayoutProp["asset"] | null)} onSelectProp={setSelectedModifyPropId} onDeleteProp={deleteMapBuilding} onClose={() => { setMapBuildingPickerOpen(false); setSelectedMapBuildingAsset(null); setSelectedModifyPropId(null); }} />}
        {mapConflictLatest && <div className="map-edit-error map-edit-conflict" role="alert"><span>{mapConflictLatest.message} Your unsaved draft is preserved. Reloading the latest map will discard it.</span><button type="button" className="lobby-button" onClick={reloadLatestMapAfterConflict}>Discard draft & load latest</button></div>}
        {lobbyError && !mapConflictLatest && <p className="map-edit-error" role="alert">{lobbyError}</p>}
        {selectedMapZone && <section className="map-zone-selection" aria-label="Selected map zone">
          <div><span className="eyebrow">SELECTED ZONE</span><strong>{selectedMapZone.kind === "private" ? selectedMapZone.ownerUsername ? `${selectedMapZone.ownerUsername}\x27s desk` : "Available desk" : selectedMapZone.name}</strong><small>{selectedMapZone.kind === "private" ? "Desk zone" : selectedMapZone.kind === "restroom" ? "Restroom" : "Meeting zone"} · {selectedMapZone.width} × {selectedMapZone.depth} m</small></div>
          {selectedZoneEntranceBlocked && <span className="auth-error" role="alert">Entrance is blocked.</span>}
          {selectedZoneEntranceBlocked && selectedZoneHasGeneratedDoor && <button type="button" className="lobby-button" onClick={() => moveMapZoneEntranceToClearSide(selectedMapZone.id)}>Move entrance to clear side</button>}
          <button type="button" className="lobby-button danger" onClick={deleteMapZone}>Delete zone</button>
          <button type="button" className="icon-button" aria-label="Deselect zone" onClick={() => setSelectedMapZoneId(null)}>×</button>
        </section>}
        {mapZoneArea && <section className="map-zone-wizard" aria-label="Create zone">
          <header><div><span className="eyebrow">NEW ZONE · {mapZoneArea.width} × {mapZoneArea.depth} m</span><strong>Configure the zone</strong></div><button type="button" className="icon-button" aria-label="Cancel zone creation" onClick={() => { setMapZoneArea(null); setLobbyError(null); }}>×</button></header>
          {mapZoneKind === "meeting" && <label>Zone name<input maxLength={32} value={mapZoneName} onChange={(event) => setMapZoneName(event.target.value)} placeholder="Meeting zone" /></label>}
          <label>Type<select value={mapZoneKind} onChange={(event) => setMapZoneKind(event.target.value as "meeting" | "private" | "restroom")}><option value="meeting">Meeting zone</option><option value="private">Desk zone</option><option value="restroom">Restroom</option></select></label>
          {mapZoneKind === "private" && <p className="map-zone-help">This desk starts available. Its name becomes the owner’s desk when claimed.</p>}
          {mapZoneKind === "meeting" && <p className="map-zone-help">Anyone can enter. Audio and video are scoped to people inside the zone.</p>}
          {mapZoneKind === "restroom" && <p className="map-zone-help">A restroom is a map destination for the Toilet status. It does not create a voice room.</p>}
          <label className="map-zone-enclosure-option"><input type="checkbox" checked={mapZoneEnclosureEnabled} onChange={(event) => setMapZoneEnclosureEnabled(event.target.checked)} /> Create enclosing walls and an entrance</label>
          {mapZoneEnclosureEnabled ? <>
            <label>Wall style<select value={mapZoneWallStyle} onChange={(event) => setMapZoneWallStyle(event.target.value as "geometry" | "asset")}><option value="geometry">Geometry wall</option><option value="asset">Asset model</option></select></label>
            {mapZoneWallStyle === "asset" && <><label>Wall model<select value={mapZoneWallAsset} onChange={(event) => setMapZoneWallAsset(event.target.value as (typeof ROOM_WALL_MODEL_ASSETS)[number])}>{ROOM_WALL_OPTION_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.items.map((item) => <option key={item.asset} value={item.asset}>{item.label}</option>)}</optgroup>)}</select></label>{selectedWallAssetDefinition?.preview ? <img src={selectedWallAssetDefinition.preview} alt={`${selectedWallAssetDefinition.label} preview`} style={{ width: "100%", height: 78, objectFit: "contain", borderRadius: 10, background: "rgba(255,255,255,.55)" }} /> : selectedWallAssetDefinition ? <PropModelPreview item={selectedWallAssetDefinition} className="wall-asset-model-preview" label={`${selectedWallAssetDefinition.label} preview`} /> : null}</>}
            {mapZoneWallStyle === "geometry" && <label>Wall color<input type="color" value={mapZoneWallColor} onChange={(event) => setMapZoneWallColor(event.target.value)} /></label>}
            {mapZoneEntranceKind === "door" && <label>Door frame<select value={mapZoneDoorStyle} onChange={(event) => setMapZoneDoorStyle(event.target.value as "geometry" | "asset")}><option value="geometry">Geometry frame</option><option value="asset">Kenney doorway · Building Kit</option></select></label>}
            <div className="map-zone-wizard-row"><label>Door wall<select value={mapZoneEntranceSide} onChange={(event) => { const side = event.target.value as "north" | "east" | "south" | "west"; setMapZoneEntranceSide(side); changeMapZoneDoorCount(mapZoneDoorCount, side); }}><option value="north">North wall</option><option value="east">East wall</option><option value="south">South wall</option><option value="west">West wall</option></select></label><label>Entrance<select value={mapZoneEntranceKind} onChange={(event) => setMapZoneEntranceKind(event.target.value as "door" | "opening")}><option value="door">Door</option><option value="opening">Open gap</option></select></label></div>
            <div className="map-zone-wizard-row"><label>Number of doors<select value={mapZoneDoorCount} onChange={(event) => changeMapZoneDoorCount(Number(event.target.value))}><option value={1}>1 entrance</option><option value={2}>2 entrances</option><option value={3}>3 entrances</option><option value={4}>4 entrances</option></select></label>{mapZoneEntranceKind === "door" && <label>Door leaves<select value={mapZoneDoorLeaves} onChange={(event) => { const leaves = Number(event.target.value) as 1 | 2; setMapZoneDoorLeaves(leaves); changeMapZoneDoorCount(mapZoneDoorCount, mapZoneEntranceSide, leaves); }}><option value={1}>Single leaf</option><option value={2}>Double leaf</option></select></label>}</div>
          {mapZoneArea && Array.from({ length: mapZoneDoorCount }, (_, index) => {
            const wallLength = mapZoneEntranceSide === "north" || mapZoneEntranceSide === "south" ? mapZoneArea.width : mapZoneArea.depth;
            const openingWidth = Math.min(mapZoneEntranceKind === "opening" ? 1.2 : mapZoneDoorLeaves === 2 ? 2.4 : 1.2, wallLength);
            const maxOffset = Math.max(0, wallLength / 2 - openingWidth / 2);
            return <label key={index}>{mapZoneDoorCount > 1 ? `Door ${index + 1} position along the wall` : "Door position along the wall"}<input type="range" min={-maxOffset} max={maxOffset} step="0.5" value={Math.max(-maxOffset, Math.min(maxOffset, mapZoneDoorOffsets[index] ?? 0))} onChange={(event) => setMapZoneDoorOffsets((offsets) => offsets.map((offset, offsetIndex) => offsetIndex === index ? Number(event.target.value) : offset))} /><small>{(mapZoneDoorOffsets[index] ?? 0).toFixed(1)} m from wall center</small></label>;
          })}
          </> : <p className="map-zone-help">This zone still marks the room and controls its features, but creates no physical walls or doors.</p>}
          {!entrancesFit && <p className="auth-error" role="alert">{entrancesOverlap ? "Door positions overlap. Move them apart along the wall." : "The selected wall is too short for this many entrances. Choose fewer doors or draw a wider zone."}</p>}
          {mapZoneDraft && !mapZoneDraft.withinBounds && <p className="auth-error" role="alert">This zone is too close to the map edge. Move it inward so its walls stay inside the office.</p>}
          {zoneOverlapsExisting && <p className="auth-error" role="alert">This zone overlaps an existing room. Move it to an empty part of the map.</p>}
          {zoneEntranceIssue && <p className="auth-error" role="alert">This entrance has no clear path outside the room. Move the zone away from the map edge or nearby walls, or choose another door wall.</p>}
          {mapZoneEnclosureEnabled && <p className="map-zone-help">Walls and the selected entrance will be created around this grid area.</p>}
          {lobbyError && <p className="auth-error" role="alert">{lobbyError}</p>}
          <footer><button type="button" className="lobby-button" onClick={() => { setMapZoneArea(null); setLobbyError(null); }}>Cancel</button><button type="button" className="lobby-button primary" disabled={!zoneCreationValid} onClick={saveMapZone}>Add to map draft</button></footer>
        </section>}
      </div>}

      <section className="touch-controls" aria-label="Touch movement controls">
        <TouchMoveButton label="Move forward" code="KeyW" heldKeysRef={heldKeysRef} onInputChange={() => sendHeldMovementRef.current()} disabled={status !== "connected"}>↑</TouchMoveButton>
        <TouchMoveButton label="Left / turn left" code="KeyA" heldKeysRef={heldKeysRef} onInputChange={() => sendHeldMovementRef.current()} disabled={status !== "connected"}>←</TouchMoveButton>
        <TouchMoveButton label="Move backward" code="KeyS" heldKeysRef={heldKeysRef} onInputChange={() => sendHeldMovementRef.current()} disabled={status !== "connected"}>↓</TouchMoveButton>
        <TouchMoveButton label="Right / turn right" code="KeyD" heldKeysRef={heldKeysRef} onInputChange={() => sendHeldMovementRef.current()} disabled={status !== "connected"}>→</TouchMoveButton>
      </section>

      {deskManagerOpen && <DeskManagerDialog context={{ endpoint, officeId: activeOffice.id, username: authUser.username,
        sessionKey: status === "connected" ? roomRef.current?.sessionId ?? null : null, configVersion: mapServerVersion }}
        room={status === "connected" ? roomRef.current : null}
        officeName={activeOffice.name} onClose={() => setDeskManagerOpen(false)} onChanged={() => void officeDesks.refresh()} />}
      <OfficeContextOverlay deskError={deskClaimError} desksLoading={officeDesks.loading} onRetryDesks={() => void officeDesks.refresh()}
        deskAssignmentNotice={deskAssignmentNotice.notice} onDismissDeskAssignmentNotice={deskAssignmentNotice.dismiss}
        voiceNotice={voiceMediaNotice} onDismissVoiceNotice={() => setVoiceMediaNotice(null)} availabilityError={!availabilityEditorOpen ? availability.error : null}
        >
      {(meetingZoneId || privateZoneId || selectedDeskZoneId) && <div className="zone-access-control" role="group" aria-label={`${activeDeskZoneLabel ?? mediaZoneName ?? "Desk"} access settings`}>
        <span><strong>{activeDeskZoneLabel ?? mediaZoneName ?? "Zone"}</strong><small>{zoneAccessDetail}</small></span>
        {activeDeskZone && !activeDeskZone.ownerUsername && !userOwnsAnotherDesk && <button type="button" disabled={deskClaimBusy} onClick={() => void claimDeskZone(activeDeskZone.id)}>{deskClaimBusy && deskClaimingZoneId === activeDeskZone.id ? "Claiming…" : "Claim desk"}</button>}
        {activeDeskZone && !activeDeskZone.ownerUsername && userOwnsAnotherDesk && <small className="desk-claim-limit">You already own a desk.</small>}
        {zonePrivacyTargetId && <>
          <button type="button" className={`zone-lock-button${roomIsLocked ? " is-locked" : ""}`} disabled={!roomLockEnabled}
            aria-label={roomIsLocked ? "Unlock room" : "Lock room"} aria-pressed={roomIsLocked}
            title={roomLockEnabled ? (roomIsLocked ? "Unlock room" : "Lock room") : "Room lock is unavailable while access settings load or for your role"}
            onClick={() => officeConversations.privateAccess.command(roomLockAction)}>
            <FeatherIcon name={roomIsLocked ? "lock" : "unlock"} size={20} />
          </button>
        </>}
        {canManageCurrentDesk && activeDeskZone && <button type="button" disabled={deskClaimBusy} onClick={() => void unclaimDeskZone(activeDeskZone.id)}>{deskClaimBusy && deskClaimingZoneId === activeDeskZone.id ? "Unclaiming…" : "Unclaim"}</button>}
      </div>}
      </OfficeContextOverlay>

      <div className="bottom-dock" data-tutorial-target="office-toolbar" aria-label="Office controls">
        {voiceRetryExhausted && !mediaSuppressed ? <button type="button" className="dock-button" aria-label={RECONNECT_VOICE_LABEL} title={RECONNECT_VOICE_LABEL} onClick={() => voiceSessionRef.current?.reconnect()}><span aria-hidden="true">↻</span></button> :
        <button data-tutorial-target="office-microphone" type="button" className={`dock-button ${selectedVoiceConnected && !selectedMicMuted ? "active" : ""}`} disabled={!selectedVoiceConnected || !canPublishConversation} title={publishingDisabledReason ? publishingDisabledReason : selectedVoiceConnected ? (selectedMicMuted ? "Turn microphone on" : "Turn microphone off") : "Voice connects automatically when you enter a voice zone"} aria-label={selectedMicMuted ? "Turn microphone on" : "Turn microphone off"} onClick={() => void toggleMicrophone()}><FeatherIcon name={selectedMicMuted ? "micOff" : "mic"} /></button>}
        <button type="button" className={`dock-button ${cameraEnabled ? "active" : ""}`} aria-pressed={cameraEnabled} disabled={!selectedVoiceConnected || !canPublishConversation} title={publishingDisabledReason ? publishingDisabledReason : cameraEnabled ? "Turn camera off" : "Turn camera on"} aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"} onClick={() => void toggleCamera()}><FeatherIcon name={cameraEnabled ? "video" : "videoOff"} /></button>
        <button type="button" className={`dock-button ${screenShareEnabled ? "active" : ""}`} aria-pressed={screenShareEnabled} disabled={!selectedVoiceConnected || !canPublishConversation} title={publishingDisabledReason ? publishingDisabledReason : screenShareEnabled ? "Stop sharing screen" : "Share screen"} aria-label={screenShareEnabled ? "Stop sharing screen" : "Share screen"} onClick={() => void toggleScreenShare()}><FeatherIcon name={screenShareEnabled ? "screen" : "screenOff"} /></button>
        <button type="button" className={`dock-button ${mediaSuppressed ? "active" : ""}`} aria-pressed={mediaSuppressed} title={mediaSuppressed ? "Headphones off · click to set Available" : "Headphones on · click to turn on Do not disturb"} aria-label={mediaSuppressed ? "Turn headphones on" : "Turn headphones off"} onClick={toggleHeadphones}><FeatherIcon name={mediaSuppressed ? "headphonesOff" : "headphones"} /></button>
        <ReactionPicker room={status === "connected" ? roomRef.current as unknown as ChatTransport : null} disabled={status !== "connected"} />
        <HandRaiseButton room={status === "connected" ? roomRef.current as unknown as ChatTransport : null} raised={playersRef.current.get(localSessionIdRef.current ?? "")?.handRaised ?? false} disabled={status !== "connected"} />
        <span className="dock-separator" />
        <div className="user-status-dock-control">
          <button type="button" className={`dock-button user-status-trigger${userStatusMenuOpen ? " active" : ""}`} aria-label={`Your status: ${userStatusOptions.find((item) => item.value === userStatus)?.label ?? "Available"}`} title={`Status · ${userStatusOptions.find((item) => item.value === userStatus)?.label ?? "Available"}`} aria-haspopup="menu" aria-expanded={userStatusMenuOpen} onClick={() => setUserStatusMenuOpen((open) => !open)}>
            <span className={`user-status-dot status-${userStatus}`} aria-hidden="true">{userStatusOptions.find((item) => item.value === userStatus)?.icon ?? "✓"}</span>
          </button>
          {userStatusMenuOpen && <div className="user-status-menu"><AvailabilityMenu status={userStatus} disabled={availability.pending || status !== "connected"}
            onStatusChange={next => { void selectUserStatus(next); }} onEditCustomStatus={() => { setUserStatusMenuOpen(false); setAvailabilityEditorOpen(true); }} /></div>}
        </div>
        <span className="dock-separator" />
          <button type="button" className="leave-button" title="Leave office" aria-label="Leave office" onClick={() => {
            intentionalLeaveRef.current = true;
            meetingZoneActiveRef.current = false;
            const room = roomRef.current;
            roomRef.current = null;
            clearSelectedOffice();
            voiceSessionRef.current?.dispose();
            proximityGroupIdRef.current = null;
            setProximityGroupId(null);
            void room?.leave();
          }}><FeatherIcon name="exit" /></button>
      </div>

      {availabilityEditorOpen && <AvailabilityDialog status={userStatus} customStatus={customStatusFromFields(playersRef.current.get(localSessionIdRef.current ?? "") ?? {})}
        pending={availability.pending} error={availability.error} onClose={() => setAvailabilityEditorOpen(false)}
        onSave={(nextStatus, customStatus) => { void selectUserStatus(nextStatus, customStatus).then(saved => { if (saved) setAvailabilityEditorOpen(false); }); }} />}
      {statusTravelError && <div className="auto-move-toast" role="status">{statusTravelError}</div>}



      {(travel.requestNotice || autoMoveNotice) && <div className="auto-move-toast" role="status">{travel.requestNotice ?? autoMoveNotice}</div>}

      {followAlerts.length > 0 && <div className="social-alert-stack follow-alert-stack" role="region" aria-label="People following you">
        {followAlerts.map((alert) => <div className="social-alert follow-alert" key={alert.followerSessionId} role="status">
          <span className="social-alert-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4v6h6M4 10a8 8 0 1 1 2 8"/><path d="m12 16 4-4-4-4m4 4H9"/></svg></span>
          <span className="social-alert-copy"><strong>{alert.followerName} is following you</strong><small>They are walking over to your location.</small></span>
          <button type="button" className="social-alert-action" onClick={() => roomRef.current?.send("follow-cancel", { followerSessionId: alert.followerSessionId })}>Cancel</button>
        </div>)}
      </div>}
      {waveAlerts.length > 0 && <div className="social-alert-stack wave-alert-stack" role="region" aria-label="Waves from people">
        {waveAlerts.map((alert) => <div className="social-alert wave-alert" key={alert.senderSessionId} role="dialog" aria-label={`${alert.senderName} waved to you`}>
          <span className="social-alert-icon wave-hand" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12V5a1.7 1.7 0 0 1 3.4 0v5-6a1.7 1.7 0 0 1 3.4 0v6-4a1.7 1.7 0 0 1 3.4 0v7l.8-1.8a1.8 1.8 0 0 1 3.3 1.4l-2.2 5.5A6 6 0 0 1 14 21h-1.5a6 6 0 0 1-4.2-1.7L4 15a1.8 1.8 0 0 1 2.5-2.6L8 14"/></svg></span>
          <span className="social-alert-copy"><strong>{alert.senderName} waved to you</strong><small>Walk over and say hello.</small></span>
          <button type="button" className="social-alert-walk" aria-label={`Walk to ${alert.senderName}`} title="Walk to them" onClick={() => { roomRef.current?.send("auto-move-to-player", { targetSessionId: alert.senderSessionId }); setWaveAlerts((current) => current.filter((item) => item.senderSessionId !== alert.senderSessionId)); }}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4v6h6M4 10a8 8 0 1 1 2 8"/><path d="m12 16 4-4-4-4m4 4H9"/></svg>
          </button>
          <button type="button" className="social-alert-close" aria-label="Dismiss wave notification" title="Dismiss" onClick={() => setWaveAlerts((current) => current.filter((item) => item.senderSessionId !== alert.senderSessionId))}><FeatherIcon name="close" size={16} /></button>
        </div>)}
      </div>}

      <div ref={audioOutputRef} className="audio-output" aria-label="Meeting audio" />
      {voiceError && <div className="voice-error" role="alert">{voiceError}<button onClick={() => setVoiceError(null)} aria-label="Dismiss audio error">×</button></div>}
      {(status === "error" || status === "disconnected") && (
        <div className="error-toast" role="alert">
          <span>{error ?? (status === "disconnected" ? "You left the office connection." : "Could not connect to the realtime server.")}</span>
          <button onClick={() => {
            autoRejoiningRef.current = false;
            setConnectionAttempt((attempt) => attempt + 1);
          }}>Rejoin office</button>
        </div>
      )}
      <p className="screen-reader-only">With the camera locked behind your character, W and S walk forward and backward; hold A or D to turn in 15 degree steps. Right-drag to free the camera, and use Focus character to lock it again. Hold Shift while moving to run. Click the ground to travel automatically by a randomly selected vehicle. Drag the map to pan it.</p>
      {modifyPropsOpen && officeMapLayout && <ModifyPropsEditor open={modifyPropsOpen} officeName={activeOffice.name} dimension={{ width: mapDimensions.width, depth: mapDimensions.depth, gridSize: 1 }} props={modifyPropsDraft} selectedPropId={selectedModifyPropId} placingAsset={selectedModifyPropAsset} error={modifyPropsError} onDraftChange={setModifyPropsDraft} onRequestPlacement={(asset) => setSelectedModifyPropAsset(asset as RoomLayoutProp["asset"] | null)} onSelectProp={setSelectedModifyPropId} onRotateProp={rotateOfficeProp} onSave={saveModifyProps} onCancel={() => { setModifyPropsOpen(false); setSelectedModifyPropAsset(null); setSelectedModifyPropId(null); setModifyPropsError(null); }} />}
      {modifyPropsBusy && <FullScreenLoading label="Loading office props…" />}
    </main>
  );
}
