import { Client, type Room } from "@colyseus/sdk";
import { CAMPUS_WORLD, DEFAULT_CAMERA_YAW, DEFAULT_CHARACTER_ID, KENNEY_BLASTER_IDS, KENNEY_CHARACTER_IDS, KENNEY_PET_IDS, KENNEY_VEHICLE_IDS, OfficeState, campusWorldFromConfig, generateCampusMap, isPositionWalkable, readRoomLayout, roomPropPlacementSupport, roomZoneEntranceIssues, ROOM_DOOR_FRAME_ASSETS, ROOM_PROP_CATALOG, ROOM_WALL_MODEL_ASSETS, screenMovementToWorld, type KenneyBlasterId, type KenneyCharacterId, type KenneyPetId, type KenneyVehicleId, type OfficeState as OfficeStateType, type PlayerState, type RoomLayout, type RoomLayoutDoor, type RoomLayoutProp, type RoomLayoutWall, type RoomLayoutZone } from "@gammyverse/shared";

const ROOM_WALL_OPTIONS = ROOM_WALL_MODEL_ASSETS.map((asset) => ROOM_PROP_CATALOG.find((item) => item.asset === asset)).filter((item): item is (typeof ROOM_PROP_CATALOG)[number] => item !== undefined);
const ROOM_WALL_OPTION_GROUPS = ROOM_WALL_OPTIONS.reduce<Array<{ label: string; items: typeof ROOM_WALL_OPTIONS }>>((groups, item) => {
  const label = item.group ?? "Other walls";
  const group = groups.find((candidate) => candidate.label === label);
  if (group) group.items.push(item);
  else groups.push({ label, items: [item] });
  return groups;
}, []);
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { LocalVideoTrack, RemoteAudioTrack, RemoteVideoTrack, Room as LiveKitRoomInstance } from "livekit-client";
import { CharacterPreview3D } from "../world/CharacterPreview3D";
import { QUATERNIUS_CHARACTERS } from "../assets/characterAssets";
import { WorldCanvas } from "../world/WorldCanvas";
import { FullScreenLoading } from "./FullScreenLoading";
import { ModifyPropsEditor } from "./ModifyPropsEditor";
import { PageTutorial } from "./PageTutorial";
import { playSocialNotificationSound, unlockSocialNotificationAudio } from "../audio/notificationSounds";

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";
type CharacterSelectionId = KenneyCharacterId | `custom-${string}`;
type PersonalAvatarModel = { id: `custom-${string}`; label: string; modelUrl: string };
type SettingsSection = "general" | "permissions" | "security";
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
type UserStatus = PlayerSnapshot["status"];
const userStatusOptions: Array<{ value: UserStatus; label: string; icon: string; color: string }> = [
  { value: "available", label: "Available", icon: "✓", color: "#2f9e62" },
  { value: "do-not-disturb", label: "Do not disturb", icon: "⊖", color: "#dc3545" },
  { value: "in-meeting", label: "In meeting", icon: "▣", color: "#7950c7" },
  { value: "toilet", label: "Toilet", icon: "WC", color: "#168aad" },
  { value: "lunch", label: "Lunch", icon: "♨", color: "#e08b22" },
  { value: "coffee-break", label: "Coffee break", icon: "☕", color: "#8a5a35" },
];
type PlayerSnapshot = { x: number; z: number; rotation: number; displayName: string; characterId: CharacterSelectionId; petId: KenneyPetId | ""; weaponId: KenneyBlasterId | ""; vehicleId: KenneyVehicleId | ""; vehicleMode: "" | "manual" | "auto"; vehiclePropId: string; vehiclePropX: number; vehiclePropZ: number; vehiclePropRotation: number; sittingPropId: string; status: "available" | "do-not-disturb" | "in-meeting" | "toilet" | "lunch" | "coffee-break"; presence: "online" | "away"; nearby: boolean };

function voiceParticipantUsername(participant: { name?: string; identity: string }) {
  return (participant.name?.trim() || participant.identity.replace(/-[a-f0-9]{16}$/i, "")).toLocaleLowerCase();
}
type FollowAlert = { followerSessionId: string; followerName: string };
type WaveAlert = { senderSessionId: string; senderName: string };
type BlasterVector = { x: number; y: number; z: number };
type BlasterShotEvent = { shooterSessionId: string; start: BlasterVector; end: BlasterVector };
type AuthUser = { username: string; role: "maintainer" | "user"; characterId: CharacterSelectionId | null };
type Office = { id: string; name: string; ownerUsername: string; role: "owner" | "admin" | "user" | "maintainer" };
type OfficeInvite = { id: string; officeId: string; officeName: string; inviter: string; role: "admin" | "user"; expiresAt: string };
type OfficeMember = { username: string; role: "owner" | "admin" | "user"; joinedAt: string | null };
type ProximityAudioTrack = { track: RemoteAudioTrack; username: string };
type VideoTileItem = { key: string; track: LocalVideoTrack | RemoteVideoTrack; label: string; local: boolean };
type ManagedAccount = { username: string; email: string | null; lastActiveAt: string | null };

const movementKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"];

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

function CharacterPicker({ value, onChange }: { value: CharacterSelectionId | null; onChange: (id: KenneyCharacterId) => void }) {
  return <div className="character-picker" role="radiogroup" aria-label="Choose a character">
    {KENNEY_CHARACTER_IDS.map((id) => {
      const blocky = id.startsWith("character-blocky-");
      const suffix = blocky ? id.slice("character-blocky-".length) : id.replace("character-", "");
      const quaternius = QUATERNIUS_CHARACTERS[id as keyof typeof QUATERNIUS_CHARACTERS];
      const label = quaternius?.label ?? (blocky
        ? `Blocky ${suffix.toUpperCase()}`
        : suffix.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));
      const preview = quaternius?.preview ?? (blocky
        ? `/assets/kenney/blocky-characters/Previews/character-${suffix}.png`
        : `/assets/kenney/mini-characters/Previews/${id}.png`);
      return <button type="button" className={`character-option${value === id ? " selected" : ""}`} key={id} role="radio" aria-checked={value === id} onClick={() => onChange(id)}>
        <img src={preview} alt="" loading="lazy" />
        <span>{label}</span>
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
  const suffix = blocky ? characterId.slice("character-blocky-".length) : characterId.replace("character-", "");
  return {
    label: quaternius?.label ?? (blocky ? `Blocky ${suffix.toUpperCase()}` : suffix.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())),
    source: quaternius?.source ?? (blocky ? "Kenney Blocky Characters" : "Kenney Mini Characters"),
    preview: quaternius?.preview ?? (blocky ? `/assets/kenney/blocky-characters/Previews/character-${suffix}.png` : `/assets/kenney/mini-characters/Previews/${characterId}.png`),
  };
}

const petLabel = (id: KenneyPetId) => id.replace("animal-", "").replace(/(^|-)([a-z])/g, (_match, dash: string, letter: string) => `${dash ? " " : ""}${letter.toUpperCase()}`);
const vehicleLabel = (id: KenneyVehicleId) => ({
  "vehicle-speedster": "Speedster", "vehicle-racer": "Racer", "vehicle-suv": "Toy SUV", "vehicle-monster-truck": "Monster Truck", "vehicle-truck": "Toy Truck",
  "car-sedan": "Sedan", "car-hatchback-sports": "Sports Hatchback", "car-taxi": "Taxi", "car-kart-oopi": "Kart",
})[id];
function TouchMoveButton({
  label,
  code,
  heldKeysRef,
  disabled = false,
  children,
}: {
  label: string;
  code: string;
  heldKeysRef: MutableRefObject<Set<string>>;
  disabled?: boolean;
  children: string;
}) {
  const hold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    heldKeysRef.current.add(code);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const release = (event?: ReactPointerEvent<HTMLButtonElement> | ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event && "preventDefault" in event) event.preventDefault();
    heldKeysRef.current.delete(code);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.code === "Enter" || event.code === "Space") {
      event.preventDefault();
      heldKeysRef.current.add(code);
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
      onBlur={() => heldKeysRef.current.delete(code)}
    >
      {children}
    </button>
  );
}

function VideoTile({ track, label, local, focused, onFocus, compact = false }: { track: LocalVideoTrack | RemoteVideoTrack; label: string; local: boolean; focused: boolean; onFocus: () => void; compact?: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    track.attach(element);
    return () => { track.detach(element); };
  }, [track]);
  return <article className={`video-tile${focused ? " focused" : ""}${compact ? " compact" : ""}`} onClick={onFocus}>
    <video ref={videoRef} autoPlay playsInline muted={local} />
    <span>{label}{local ? " · You" : ""}</span>
    <button type="button" className="video-focus-button" aria-label={focused ? `Currently showing ${label}` : `Show ${label} full screen`} title={focused ? "Currently shown" : "Show full screen"} onClick={(event) => { event.stopPropagation(); onFocus(); }}><FeatherIcon name="maximize" /></button>
  </article>;
}

function FeatherIcon({ name, size = 18 }: { name: "mic" | "micOff" | "video" | "videoOff" | "screen" | "headphones" | "headphonesOff" | "close" | "maximize" | "exit" | "car" | "lock" | "unlock"; size?: number }) {
  const shared = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const drawings = {
    mic: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>,
    micOff: <><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9V5a3 3 0 0 0-5.83-1M5 10v2a7 7 0 0 0 11.4 5.45M19 10v2c0 .6-.08 1.17-.22 1.71M12 19v3m-4 0h8M2 2l20 20"/></>,
    video: <><rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></>,
    videoOff: <><path d="m3 3 18 18M10.6 5H14a2 2 0 0 1 2 2v2l5-3v10l-5-3v2a2 2 0 0 1-.59 1.41M3 7v10a2 2 0 0 0 2 2h9"/></>,
    screen: <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4m-3-9 2-2 2 2 3-4"/></>,
    headphones: <><path d="M3 14v-3a9 9 0 0 1 18 0v3"/><path d="M5 13h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Zm12 0h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z"/></>,
    headphonesOff: <><path d="M3 14v-3a9 9 0 0 1 15.4-6.4M21 11v3M5 13h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Zm12 0h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1M2 2l20 20"/></>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    maximize: <><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/></>,
    exit: <><path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>,
    car: <><path d="m5 11 1.5-5h11L19 11l2 2v5h-2m-14 0H3v-5l2-2Z"/><path d="M5 11h14M7 18h10"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></>,
    unlock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2m-3.5 9v3"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...shared}>{drawings[name]}</svg>;
}

const endpoint = import.meta.env.VITE_REALTIME_URL ?? (import.meta.env.PROD ? window.location.origin : "http://localhost:2567");
const CAMERA_CAPTURE_720P30 = { resolution: { width: 1280, height: 720, frameRate: 30 }, frameRate: { ideal: 30, max: 30 } };
const SCREEN_CAPTURE_1080P30 = { resolution: { width: 1920, height: 1080, frameRate: 30 }, contentHint: "detail" as const };
const getInviteRouteToken = (path: string) => path.match(/^\/join\/([A-Za-z0-9_-]{30,100})\/?$/)?.[1] ?? null;
const getResetRouteToken = (path: string) => path.match(/^\/reset\/([A-Za-z0-9_-]{30,100})\/?$/)?.[1] ?? null;
const getMeetingRouteOfficeId = (path: string) => path.match(/^\/meeting\/([0-9a-f-]{36})\/?$/i)?.[1] ?? null;
const getOfficeRouteId = (path = window.location.pathname) => path.match(/^\/office\/([0-9a-f-]{36})\/?$/i)?.[1] ?? null;

export function OfficeApp() {
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const [meetingEntry, setMeetingEntry] = useState(() => Boolean(getMeetingRouteOfficeId(window.location.pathname)));
  const routePathRef = useRef(routePath);
  routePathRef.current = routePath;
  const maintainerPortal = routePath === "/maintainer";
  const inviteLinkToken = getInviteRouteToken(routePath);
  const resetLinkToken = getResetRouteToken(routePath);
  const meetingLinkOfficeId = getMeetingRouteOfficeId(routePath);
  const client = useMemo(() => new Client(endpoint), []);
  const roomRef = useRef<Room<OfficeStateType> | null>(null);
  const liveKitRoomRef = useRef<LiveKitRoomInstance | null>(null);
  const privateLiveKitRoomRef = useRef<LiveKitRoomInstance | null>(null);
  const privateRoomZoneIdRef = useRef<string | null>(null);
  const proximityLiveKitRoomRef = useRef<LiveKitRoomInstance | null>(null);
  const proximityRoomGroupRef = useRef<string | null>(null);
  const proximityAudioTracksRef = useRef(new Map<string, ProximityAudioTrack>());
  const speakingUsernamesRef = useRef(new Set<string>());
  const speakingByVoiceRoomRef = useRef(new Map<LiveKitRoomInstance, Set<string>>());
  const proximityJoiningGroupRef = useRef<string | null>(null);
  const audioOutputRef = useRef<HTMLDivElement>(null);
  const inboundAudioMutedRef = useRef(false);
  const appPausedRef = useRef(false);
  const playersRef = useRef<Map<string, PlayerSnapshot>>(new Map());
  const blasterEventsRef = useRef<BlasterShotEvent[]>([]);
  const localSessionIdRef = useRef<string | null>(null);
  const cameraYawRef = useRef(DEFAULT_CAMERA_YAW);
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
  const [blasterHitNotice, setBlasterHitNotice] = useState<number | null>(null);
  const blasterHitSequenceRef = useRef(0);
  const [officeName, setOfficeName] = useState("");
  const [createOfficeDialogOpen, setCreateOfficeDialogOpen] = useState(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [lobbyBusy, setLobbyBusy] = useState(false);
  const [initialLobbyLoading, setInitialLobbyLoading] = useState(false);
  const [managingOffice, setManagingOffice] = useState<Office | null>(null);
  const [mapEditMode, setMapEditMode] = useState(false);
  const [spawnPlacementMode, setSpawnPlacementMode] = useState(false);
  const [mapSpawnSaving, setMapSpawnSaving] = useState(false);
  const mapEditModeRef = useRef(mapEditMode);
  mapEditModeRef.current = mapEditMode;
  const [mapEditorUsername, setMapEditorUsername] = useState<string | null>(null);
  const [mapEditLockRequestPending, setMapEditLockRequestPending] = useState(false);
  const [officeMapLayout, setOfficeMapLayout] = useState<RoomLayout | null>(null);
  const [mapEditBaseline, setMapEditBaseline] = useState<RoomLayout | null>(null);
  const mapDimensions = officeMapLayout?.dimensions ?? { width: CAMPUS_WORLD.width, depth: CAMPUS_WORLD.depth };
  const [mapConfigVersion, setMapConfigVersion] = useState(1);
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
  const [mapGeneratorOpen, setMapGeneratorOpen] = useState(false);
  const [generatorTotalPeople, setGeneratorTotalPeople] = useState(150);
  const [generatorPeoplePerTeam, setGeneratorPeoplePerTeam] = useState(15);
  const [generatorTeamCount, setGeneratorTeamCount] = useState(10);
  const createOfficePeoplePerTeam = generatorTeamCount > 0 ? generatorTotalPeople / generatorTeamCount : Number.NaN;
  const createOfficeInputsValid = Number.isInteger(createOfficePeoplePerTeam) && createOfficePeoplePerTeam > 0 && createOfficePeoplePerTeam <= 16;
  const [generatorError, setGeneratorError] = useState<string | null>(null);
  const [mapZoneArea, setMapZoneArea] = useState<{ x: number; z: number; width: number; depth: number } | null>(null);
  const [mapZoneName, setMapZoneName] = useState("");
  const [mapZoneKind, setMapZoneKind] = useState<"meeting" | "private" | "restroom">("meeting");
  const [mapZoneEntranceSide, setMapZoneEntranceSide] = useState<"north" | "east" | "south" | "west">("south");
  const [mapZoneEntranceKind, setMapZoneEntranceKind] = useState<"door" | "opening">("door");
  const [mapZoneDoorCount, setMapZoneDoorCount] = useState(1);
  const [mapZoneDoorLeaves, setMapZoneDoorLeaves] = useState<1 | 2>(1);
  const [mapZoneDoorOffsets, setMapZoneDoorOffsets] = useState<number[]>([0]);
  const [mapZoneWallStyle, setMapZoneWallStyle] = useState<"geometry" | "asset">("geometry");
  const [mapZoneWallAsset, setMapZoneWallAsset] = useState<(typeof ROOM_WALL_MODEL_ASSETS)[number]>(ROOM_WALL_MODEL_ASSETS[0]);
  const [mapZoneWallColor, setMapZoneWallColor] = useState("#023047");
  const [mapZoneDoorStyle, setMapZoneDoorStyle] = useState<"geometry" | "asset">("geometry");
  const [mapZoneSaving, setMapZoneSaving] = useState(false);
  const [selectedMapZoneId, setSelectedMapZoneId] = useState<string | null>(null);
  const [mapZoneDeleting, setMapZoneDeleting] = useState(false);
  const [officeDeleteConfirmOpen, setOfficeDeleteConfirmOpen] = useState(false);
  const [officeDeleteName, setOfficeDeleteName] = useState("");
  const [officeDeleteError, setOfficeDeleteError] = useState<string | null>(null);
  const [managedOfficeName, setManagedOfficeName] = useState("");
  const [officeMembers, setOfficeMembers] = useState<OfficeMember[]>([]);
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [inviteLinkBusyOfficeId, setInviteLinkBusyOfficeId] = useState<string | null>(null);
  const [inviteLinkFeedback, setInviteLinkFeedback] = useState<{ officeId: string; message: string } | null>(null);
  const [meetingZoneActive, setMeetingZoneActive] = useState(false);
  const [meetingZoneId, setMeetingZoneId] = useState<string | null>(null);
  const [activeCameraRoomKey, setActiveCameraRoomKey] = useState("lobby");
  const [privateZoneId, setPrivateZoneId] = useState<string | null>(null);
  const [privateZoneName, setPrivateZoneName] = useState<string | null>(null);
  const [selectedDeskZoneId, setSelectedDeskZoneId] = useState<string | null>(null);
  const [mediaZoneName, setMediaZoneName] = useState<string | null>(null);
  const [deskClaimBusy, setDeskClaimBusy] = useState(false);
  const [deskClaimingZoneId, setDeskClaimingZoneId] = useState<string | null>(null);
  const [deskClaimError, setDeskClaimError] = useState<string | null>(null);
  useEffect(() => { setDeskClaimBusy(false); setDeskClaimError(null); }, [selectedDeskZoneId]);
  const [lockedZoneIds, setLockedZoneIds] = useState<string[]>([]);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [proximityGroupId, setProximityGroupId] = useState<string | null>(null);
  const [proximityVoiceConnected, setProximityVoiceConnected] = useState(false);
  const [proximityVoiceMuted, setProximityVoiceMuted] = useState(false);
  const [proximityVoiceBusy, setProximityVoiceBusy] = useState(false);
  const [privateVoiceConnected, setPrivateVoiceConnected] = useState(false);
  const [privateVoiceMuted, setPrivateVoiceMuted] = useState(false);
  const [privateVoiceBusy, setPrivateVoiceBusy] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [videoTiles, setVideoTiles] = useState<VideoTileItem[]>([]);
  const [focusedVideoKey, setFocusedVideoKey] = useState<string | null>(null);
  const [videoPopupOpen, setVideoPopupOpen] = useState(false);
  const addRemoteVideoTile = (tile: VideoTileItem) => {
    setVideoTiles((current) => [...current.filter((item) => item.key !== tile.key), tile]);
  };
  const [resetUrls, setResetUrls] = useState<Record<string, string>>({});
  const [accountError, setAccountError] = useState<string | null>(null);
  const [characterPanelOpen, setCharacterPanelOpen] = useState(false);
  const [characterDialogOpen, setCharacterDialogOpen] = useState(false);
  const [activePetId, setActivePetId] = useState<KenneyPetId | "">("");
  const [autoMoveNotice, setAutoMoveNotice] = useState<string | null>(null);
  const [followingSessionId, setFollowingSessionId] = useState<string | null>(null);
  const [followAlerts, setFollowAlerts] = useState<FollowAlert[]>([]);
  const [waveAlerts, setWaveAlerts] = useState<WaveAlert[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const [idleAnimationsEnabled, setIdleAnimationsEnabled] = useState(() => {
    try { return window.localStorage.getItem("gammyverse.idleAnimationsEnabled") !== "false"; }
    catch { return true; }
  });
  const updateIdleAnimationsEnabled = (enabled: boolean) => {
    setIdleAnimationsEnabled(enabled);
    try { window.localStorage.setItem("gammyverse.idleAnimationsEnabled", String(enabled)); }
    catch { /* Keep the preference for this session when storage is unavailable. */ }
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
  const [peopleSearch, setPeopleSearch] = useState("");
  const [userStatus, setUserStatus] = useState<UserStatus>("available");
  const userStatusRef = useRef<UserStatus>("available");
  userStatusRef.current = userStatus;
  const toiletReturnPositionRef = useRef<{ x: number; z: number } | null>(null);
  const [statusMenuOverlayOpen, setStatusMenuOverlayOpen] = useState(false);
  const [statusTravelError, setStatusTravelError] = useState<string | null>(null);
  const appPaused = userStatus === "do-not-disturb" || userStatus === "in-meeting";
  appPausedRef.current = appPaused;
  const [userStatusMenuOpen, setUserStatusMenuOpen] = useState(false);
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(false);
  const [activeLobbyTab, setActiveLobbyTab] = useState<"offices" | "invitations">("offices");
  const workspacePanelMounted = usePanelPresence(workspacePanelOpen);
  const characterPanelMounted = usePanelPresence(characterPanelOpen);
  const [activeLeftTab, setActiveLeftTab] = useState<"workspace" | "people" | "activity">("workspace");
  const [officeActivities, setOfficeActivities] = useState<OfficeActivity[]>([]);
  const [activityBusy, setActivityBusy] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);

  const setInboundAudioMuted = (muted: boolean) => {
    if (inboundAudioMutedRef.current === muted) return;
    inboundAudioMutedRef.current = muted;
    audioOutputRef.current?.querySelectorAll("audio").forEach((element) => { element.muted = muted; });
  };
  const selectUserStatus = (nextStatus: UserStatus) => {
    const previousStatus = userStatus;
    const shouldPause = nextStatus === "do-not-disturb" || nextStatus === "in-meeting";
    appPausedRef.current = shouldPause;
    setUserStatus(nextStatus);
    userStatusRef.current = nextStatus;
    setUserStatusMenuOpen(false);
    setStatusMenuOverlayOpen(false);
    setInboundAudioMuted(shouldPause);
    roomRef.current?.send("user-status", { status: nextStatus });
    if (nextStatus === "toilet" && previousStatus !== "toilet") {
      setStatusTravelError(null);
      const localSessionId = localSessionIdRef.current;
      const localPlayer = localSessionId ? playersRef.current.get(localSessionId) : undefined;
      if (localPlayer) toiletReturnPositionRef.current = { x: localPlayer.x, z: localPlayer.z };
      const restroom = officeMapLayout?.zones
        .filter((zone) => zone.kind === "restroom")
        .sort((a, b) => Math.hypot(a.x - (localPlayer?.x ?? 0), a.z - (localPlayer?.z ?? 0)) - Math.hypot(b.x - (localPlayer?.x ?? 0), b.z - (localPlayer?.z ?? 0)))[0];
      if (restroom) {
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
        heldKeysRef.current.clear();
        roomRef.current?.send("auto-move", { ...returnPosition, randomVehicle: false });
      }
    }
  };
  const toggleHeadphones = () => {
    const mutedByStatus = userStatus === "do-not-disturb" || userStatus === "in-meeting";
    selectUserStatus(mutedByStatus ? "available" : "do-not-disturb");
  };
  const attachRemoteAudio = (track: RemoteAudioTrack) => {
    const element = track.attach();
    element.autoplay = true;
    element.muted = inboundAudioMutedRef.current;
    audioOutputRef.current?.appendChild(element);
  };

  useEffect(() => {
    const unlockAudio = () => {
      unlockSocialNotificationAudio();
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
        if ((result.user.role === "maintainer") !== maintainerPortal) {
          await fetch(`${endpoint}/auth/logout`, { method: "POST", credentials: "include" });
          setAuthError(maintainerPortal ? "This account is not a maintainer account." : "Use the maintainer sign-in page for this account.");
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
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      const responseText = await response.text();
      let result: { characterId?: CharacterSelectionId; error?: string };
      try {
        result = JSON.parse(responseText) as { characterId?: CharacterSelectionId; error?: string };
      } catch {
        throw new Error("The character service returned an invalid response. Please retry.");
      }
      if (!response.ok || result.characterId !== characterId) throw new Error(result.error ?? "Could not save your character.");
      setAuthUser((user) => user ? { ...user, characterId: result.characterId! } : user);
      roomRef.current?.send("character", characterId);
      setCharacterDialogOpen(false);
    } catch (cause) {
      setCharacterError(cause instanceof Error ? cause.message : "Could not save your character.");
    } finally {
      setCharacterBusy(false);
    }
  };

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

  const leaveMeetingVoice = () => {
    const room = liveKitRoomRef.current;
    liveKitRoomRef.current = null;
    if (room) clearVoiceRoomSpeakers(room);
    setVoiceConnected(false); setVoiceMuted(false);
    setCameraEnabled(false); setScreenShareEnabled(false);
    setVideoTiles((tiles) => tiles.filter((tile) => !tile.local));
    if (room) void room.disconnect();
  };

  const leaveProximityVoice = () => {
    const room = proximityLiveKitRoomRef.current;
    proximityLiveKitRoomRef.current = null;
    if (room) clearVoiceRoomSpeakers(room);
    proximityRoomGroupRef.current = null;
    proximityJoiningGroupRef.current = null;
    proximityAudioTracksRef.current.clear();
    setProximityVoiceConnected(false); setProximityVoiceMuted(false);
    setCameraEnabled(false); setScreenShareEnabled(false);
    setVideoTiles((tiles) => tiles.filter((tile) => !tile.local));
    if (room) void room.disconnect();
  };

  const leavePrivateVoice = () => {
    const room = privateLiveKitRoomRef.current;
    privateLiveKitRoomRef.current = null;
    if (room) clearVoiceRoomSpeakers(room);
    privateRoomZoneIdRef.current = null;
    setPrivateVoiceConnected(false); setPrivateVoiceMuted(false);
    setCameraEnabled(false); setScreenShareEnabled(false);
    setVideoTiles((tiles) => tiles.filter((tile) => !tile.local));
    if (room) void room.disconnect();
  };

  const rebuildSpeakingUsernames = () => {
    const next = new Set<string>();
    for (const usernames of speakingByVoiceRoomRef.current.values()) {
      for (const username of usernames) next.add(username);
    }
    speakingUsernamesRef.current.clear();
    for (const username of next) speakingUsernamesRef.current.add(username);
  };

  const updateVoiceRoomSpeakers = (room: LiveKitRoomInstance) => {
    const usernames = new Set(room.activeSpeakers.map(voiceParticipantUsername).filter(Boolean));
    if (usernames.size) speakingByVoiceRoomRef.current.set(room, usernames);
    else speakingByVoiceRoomRef.current.delete(room);
    rebuildSpeakingUsernames();
  };

  const clearVoiceRoomSpeakers = (room: LiveKitRoomInstance) => {
    speakingByVoiceRoomRef.current.delete(room);
    rebuildSpeakingUsernames();
  };

  const syncLocalVideoTiles = (room: LiveKitRoomInstance) => {
    const activePublications = [...room.localParticipant.videoTrackPublications.values()].filter((publication) => publication.track && !publication.isMuted);
    const localTiles: VideoTileItem[] = activePublications.map((publication) => {
        const track = publication.track as LocalVideoTrack;
        const source = String(publication.source ?? track.source).toLowerCase();
        const screen = source.includes("screen");
        return { key: `local:${String(publication.source ?? track.source)}`, track, label: screen ? "Screen share" : "Camera", local: true };
      });
    setVideoTiles((tiles) => [...tiles.filter((tile) => !tile.local), ...localTiles]);
    if (localTiles.length) {
      setFocusedVideoKey(localTiles[localTiles.length - 1]!.key);
      setVideoPopupOpen(true);
    }
    setCameraEnabled(activePublications.some((publication) => String(publication.source ?? publication.track?.source).toLowerCase().includes("camera")));
    setScreenShareEnabled(activePublications.some((publication) => String(publication.source ?? publication.track?.source).toLowerCase().includes("screen")));
  };

  useEffect(() => {
    if (videoTiles.length === 0) setVideoPopupOpen(false);
  }, [videoTiles.length]);

  useEffect(() => {
    if (!videoPopupOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setVideoPopupOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [videoPopupOpen]);

  const updateProximityAudioVolumes = () => {
    const local = localSessionIdRef.current ? playersRef.current.get(localSessionIdRef.current) : undefined;
    const onlinePlayers = [...playersRef.current.values()].filter((player) => player.presence === "online");
    const onlinePlayersByDisplayName = new Map<string, (typeof onlinePlayers)[number]>();
    for (const player of onlinePlayers) {
      // Match the old Array.find behavior when display names are not unique.
      if (!onlinePlayersByDisplayName.has(player.displayName)) onlinePlayersByDisplayName.set(player.displayName, player);
    }
    for (const { track, username } of proximityAudioTracksRef.current.values()) {
      const remote = onlinePlayersByDisplayName.get(username);
      if (!local || !remote) { track.setVolume(0); continue; }
      const distance = Math.hypot(local.x - remote.x, local.z - remote.z);
      const fade = Math.max(0, Math.min(1, (CAMPUS_WORLD.proximityRadius - distance) / (CAMPUS_WORLD.proximityRadius - CAMPUS_WORLD.voiceFullVolumeRadius)));
      track.setVolume(fade * fade * (3 - 2 * fade));
    }
  };

  const joinProximityVoice = async (groupId: string) => {
    if (appPausedRef.current || !activeOffice || meetingZoneActiveRef.current || proximityLiveKitRoomRef.current || proximityJoiningGroupRef.current === groupId) return;
    proximityJoiningGroupRef.current = groupId;
    setProximityVoiceBusy(true); setVoiceError(null);
    let room: LiveKitRoomInstance | null = null;
    try {
      const response = await fetch(`${endpoint}/media/proximity-token`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ officeId: activeOffice.id }) });
      const result = await response.json() as { url?: string; token?: string; groupId?: string; error?: string };
      if (!response.ok || !result.url || !result.token || !result.groupId) throw new Error(result.error ?? "Could not authorize nearby voice.");
      if (appPausedRef.current || meetingZoneActiveRef.current || result.groupId !== groupId || proximityGroupIdRef.current !== groupId) return;
      const { Room: LiveKitRoom, RoomEvent, Track } = await import("livekit-client");
      room = new LiveKitRoom({ adaptiveStream: true, dynacast: true });
      proximityLiveKitRoomRef.current = room;
      proximityRoomGroupRef.current = groupId;
      room.on(RoomEvent.ActiveSpeakersChanged, () => updateVoiceRoomSpeakers(room!));
      room.on(RoomEvent.LocalTrackPublished, () => syncLocalVideoTiles(room!));
      room.on(RoomEvent.LocalTrackUnpublished, () => syncLocalVideoTiles(room!));
      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        const username = participant.name || participant.identity.replace(/-[a-f0-9]{16}$/i, "");
        if (track.kind === Track.Kind.Audio) {
          proximityAudioTracksRef.current.set(participant.identity, { track: track as RemoteAudioTrack, username });
          updateProximityAudioVolumes();
          attachRemoteAudio(track as RemoteAudioTrack);
        } else if (track.kind === Track.Kind.Video) {
          const screen = String(track.source).toLowerCase().includes("screen");
          addRemoteVideoTile({ key: `${participant.identity}:${String(track.source)}`, track: track as RemoteVideoTrack, label: screen ? `${username} · Screen` : username, local: false });
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        const subscribedAudio = proximityAudioTracksRef.current.get(participant.identity);
        if (subscribedAudio?.track === track) proximityAudioTracksRef.current.delete(participant.identity);
        track.detach().forEach((element) => element.remove());
        setVideoTiles((tiles) => tiles.filter((tile) => tile.track !== track));
      });
      room.on(RoomEvent.Disconnected, () => {
        if (proximityLiveKitRoomRef.current === room) {
          proximityLiveKitRoomRef.current = null;
          proximityRoomGroupRef.current = null;
          proximityAudioTracksRef.current.clear();
          clearVoiceRoomSpeakers(room!);
          setProximityVoiceConnected(false); setProximityVoiceMuted(false);
        }
      });
      await room.connect(result.url, result.token);
      updateVoiceRoomSpeakers(room);
      if (appPausedRef.current || meetingZoneActiveRef.current || proximityGroupIdRef.current !== groupId) { await room.disconnect(); return; }
      await room.localParticipant.setMicrophoneEnabled(true);
      if (appPausedRef.current) { await room.localParticipant.setMicrophoneEnabled(false); await room.disconnect(); return; }
      setProximityVoiceConnected(true); setProximityVoiceMuted(false);
    } catch (cause) {
      room?.disconnect();
      if (proximityLiveKitRoomRef.current === room) leaveProximityVoice();
      setVoiceError(cause instanceof Error ? cause.message : "Could not connect to nearby voice.");
    } finally {
      if (proximityJoiningGroupRef.current === groupId) proximityJoiningGroupRef.current = null;
      setProximityVoiceBusy(false);
    }
  };

  const toggleProximityMute = async () => {
    if (appPausedRef.current) return;
    const room = proximityLiveKitRoomRef.current;
    if (!room) return;
    const nextMuted = !proximityVoiceMuted;
    try { await room.localParticipant.setMicrophoneEnabled(!nextMuted); setProximityVoiceMuted(nextMuted); }
    catch (cause) { setVoiceError(cause instanceof Error ? cause.message : "Could not change microphone state."); }
  };

  const joinPrivateVoice = async (zoneId: string) => {
    if (appPausedRef.current || !activeOffice || meetingZoneActiveRef.current || privateLiveKitRoomRef.current) return;
    setPrivateVoiceBusy(true); setVoiceError(null);
    let room: LiveKitRoomInstance | null = null;
    try {
      const response = await fetch(`${endpoint}/media/private-token`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ officeId: activeOffice.id, zoneId }) });
      const result = await response.json() as { url?: string; token?: string; error?: string };
      if (!response.ok || !result.url || !result.token) throw new Error(result.error ?? "Could not authorize private voice.");
      if (appPausedRef.current || meetingZoneActiveRef.current || privateZoneIdRef.current !== zoneId) return;
      const { Room: LiveKitRoom, RoomEvent, Track } = await import("livekit-client");
      room = new LiveKitRoom({ adaptiveStream: true, dynacast: true });
      privateLiveKitRoomRef.current = room;
      privateRoomZoneIdRef.current = zoneId;
      room.on(RoomEvent.ActiveSpeakersChanged, () => updateVoiceRoomSpeakers(room!));
      room.on(RoomEvent.LocalTrackPublished, () => syncLocalVideoTiles(room!));
      room.on(RoomEvent.LocalTrackUnpublished, () => syncLocalVideoTiles(room!));
      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        const username = participant.name || participant.identity.replace(/-[a-f0-9]{16}$/i, "");
        if (track.kind === Track.Kind.Audio) {
          attachRemoteAudio(track as RemoteAudioTrack);
        } else if (track.kind === Track.Kind.Video) {
          const screen = String(track.source).toLowerCase().includes("screen");
          addRemoteVideoTile({ key: `${participant.identity}:${String(track.source)}`, track: track as RemoteVideoTrack, label: screen ? `${username} · Screen` : username, local: false });
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => { track.detach().forEach((element) => element.remove()); setVideoTiles((tiles) => tiles.filter((tile) => tile.track !== track)); });
      room.on(RoomEvent.Disconnected, () => {
        clearVoiceRoomSpeakers(room!);
        if (privateLiveKitRoomRef.current === room) privateLiveKitRoomRef.current = null;
        setPrivateVoiceConnected(false); setPrivateVoiceMuted(false);
      });
      await room.connect(result.url, result.token);
      updateVoiceRoomSpeakers(room);
      if (appPausedRef.current || meetingZoneActiveRef.current || privateZoneIdRef.current !== zoneId) { await room.disconnect(); return; }
      await room.localParticipant.setMicrophoneEnabled(true);
      if (appPausedRef.current) { await room.localParticipant.setMicrophoneEnabled(false); await room.disconnect(); return; }
      setPrivateVoiceConnected(true); setPrivateVoiceMuted(false);
    } catch (cause) {
      room?.disconnect();
      if (privateLiveKitRoomRef.current === room) leavePrivateVoice();
      setVoiceError(cause instanceof Error ? cause.message : "Could not connect to private voice.");
    } finally { setPrivateVoiceBusy(false); }
  };

  const togglePrivateMute = async () => {
    if (appPausedRef.current) return;
    const room = privateLiveKitRoomRef.current;
    if (!room) return;
    const nextMuted = !privateVoiceMuted;
    try { await room.localParticipant.setMicrophoneEnabled(!nextMuted); setPrivateVoiceMuted(nextMuted); }
    catch (cause) { setVoiceError(cause instanceof Error ? cause.message : "Could not change microphone state."); }
  };

  const joinMeetingVoice = async () => {
    if (appPausedRef.current || !activeOffice || !meetingZoneActive || liveKitRoomRef.current) return;
    setVoiceBusy(true); setVoiceError(null);
    let room: LiveKitRoomInstance | null = null;
    try {
      const response = await fetch(`${endpoint}/media/meeting-token`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ officeId: activeOffice.id, roomKey: meetingZoneId ?? "lobby" }) });
      const result = await response.json() as { url?: string; token?: string; error?: string };
      if (!response.ok || !result.url || !result.token) throw new Error(result.error ?? "Could not authorize meeting audio.");
      if (appPausedRef.current) return;
      const { Room: LiveKitRoom, RoomEvent, Track } = await import("livekit-client");
      room = new LiveKitRoom({ adaptiveStream: true, dynacast: true });
      liveKitRoomRef.current = room;
      room.on(RoomEvent.ActiveSpeakersChanged, () => updateVoiceRoomSpeakers(room!));
      room.on(RoomEvent.LocalTrackPublished, () => syncLocalVideoTiles(room!));
      room.on(RoomEvent.LocalTrackUnpublished, () => syncLocalVideoTiles(room!));
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          attachRemoteAudio(track as RemoteAudioTrack);
        } else if (track.kind === Track.Kind.Video) {
          const participant = [...room!.remoteParticipants.values()].find((candidate) => [...candidate.trackPublications.values()].some((publication) => publication.track === track));
          if (participant) {
            const screen = String(track.source).toLowerCase().includes("screen");
            addRemoteVideoTile({ key: `${participant.identity}:${String(track.source)}`, track: track as RemoteVideoTrack, label: screen ? `${participant.name || participant.identity} · Screen` : participant.name || participant.identity, local: false });
          }
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => { track.detach().forEach((element) => element.remove()); setVideoTiles((tiles) => tiles.filter((tile) => tile.track !== track)); });
      room.on(RoomEvent.Disconnected, () => {
        clearVoiceRoomSpeakers(room!);
        if (liveKitRoomRef.current === room) liveKitRoomRef.current = null;
        setVoiceConnected(false); setVoiceMuted(false);
      });
      await room.connect(result.url, result.token);
      updateVoiceRoomSpeakers(room);
      if (appPausedRef.current) { await room.disconnect(); return; }
      await room.localParticipant.setMicrophoneEnabled(true);
      if (appPausedRef.current) { await room.localParticipant.setMicrophoneEnabled(false); await room.disconnect(); return; }
      setVoiceConnected(true); setVoiceMuted(false);
    } catch (cause) {
      room?.disconnect();
      if (liveKitRoomRef.current === room) liveKitRoomRef.current = null;
      setVoiceConnected(false);
      setVoiceError(cause instanceof Error ? cause.message : "Could not connect to meeting audio.");
    } finally { setVoiceBusy(false); }
  };
const toggleMeetingMute = async () => {
    if (appPausedRef.current) return;
    const room = liveKitRoomRef.current;
    if (!room) return;
    const nextMuted = !voiceMuted;
    try { await room.localParticipant.setMicrophoneEnabled(!nextMuted); setVoiceMuted(nextMuted); }
    catch (cause) { setVoiceError(cause instanceof Error ? cause.message : "Could not change microphone state."); }
  };

  const selectOffice = (office: Office, syncUrl = true) => {
    exitMapEditMode();
    localStorage.setItem("gammyverse.activeOfficeId", office.id);
    if (syncUrl && window.location.pathname !== `/office/${office.id}`) {
      window.history.pushState({ officeId: office.id }, "", `/office/${office.id}`);
    }
    setRoutePath(window.location.pathname);
    setActiveOffice(office);
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
    void fetch(`${endpoint}/offices/${activeOffice.id}/map`, { credentials: "include" })
      .then(async (response) => {
        const result = await response.json() as { config?: unknown };
        if (response.ok && !cancelled && result.config) setOfficeMapLayout(readRoomLayout(result.config));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authUser?.username, activeOffice?.id]);

  const activeVoiceRoom = () => meetingZoneActive ? liveKitRoomRef.current : privateZoneId ? privateLiveKitRoomRef.current : proximityLiveKitRoomRef.current;
  const toggleCamera = async () => {
    if (appPausedRef.current) return;
    const room = activeVoiceRoom();
    if (!room) return;
    try {
      await room.localParticipant.setCameraEnabled(!cameraEnabled, CAMERA_CAPTURE_720P30, {
        videoEncoding: { maxBitrate: 1_500_000, maxFramerate: 30 },
        degradationPreference: "maintain-resolution",
      });
      setCameraEnabled(!cameraEnabled);
      syncLocalVideoTiles(room);
    } catch (cause) { setVoiceError(cause instanceof Error ? cause.message : "Could not access the camera."); }
  };
  const toggleScreenShare = async () => {
    if (appPausedRef.current) return;
    const room = activeVoiceRoom();
    if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(!screenShareEnabled, SCREEN_CAPTURE_1080P30, {
        screenShareEncoding: { maxBitrate: 4_000_000, maxFramerate: 30 },
        degradationPreference: "maintain-resolution",
      });
      setScreenShareEnabled(!screenShareEnabled);
      syncLocalVideoTiles(room);
    } catch (cause) { setVoiceError(cause instanceof Error ? cause.message : "Could not share the screen."); }
  };

  useEffect(() => {
    if (appPaused || !meetingZoneActive) {
      leaveMeetingVoice();
    } else {
      leaveProximityVoice();
      leavePrivateVoice();
      if (!liveKitRoomRef.current) void joinMeetingVoice();
    }
  }, [appPaused, meetingZoneActive]);

  useEffect(() => {
    if (appPaused || meetingZoneActive || !privateZoneId) {
      leavePrivateVoice();
      return;
    }
    leaveProximityVoice();
    if (privateLiveKitRoomRef.current && privateRoomZoneIdRef.current !== privateZoneId) leavePrivateVoice();
    if (!privateLiveKitRoomRef.current) void joinPrivateVoice(privateZoneId);
  }, [appPaused, meetingZoneActive, privateZoneId]);

  useEffect(() => {
    if (appPaused || meetingZoneActive || privateZoneId || !proximityGroupId) {
      leaveProximityVoice();
      return;
    }
    if (proximityRoomGroupRef.current === proximityGroupId || proximityJoiningGroupRef.current === proximityGroupId) return;
    leaveProximityVoice();
    void joinProximityVoice(proximityGroupId);
  }, [appPaused, meetingZoneActive, privateZoneId, proximityGroupId]);

  useEffect(() => {
    if (!appPaused) return;
    heldKeysRef.current.clear();
    roomRef.current?.send("input", { x: 0, z: 0, sprint: false });
    roomRef.current?.send("auto-move-cancel", {});
    roomRef.current?.send("follow-stop", {});
    setVideoPopupOpen(false);
    leaveMeetingVoice();
    leavePrivateVoice();
    leaveProximityVoice();
  }, [appPaused]);

  const signOut = () => {
    leaveMeetingVoice();
    leaveProximityVoice();
    leavePrivateVoice();
    privateZoneIdRef.current = null; setPrivateZoneId(null);
    proximityGroupIdRef.current = null;
    setProximityGroupId(null);
    void fetch(`${endpoint}/auth/logout`, { method: "POST", credentials: "include" });
    setAuthUser(null);
    clearSelectedOffice();
    setOffices([]);
    setOfficeListVerified(false);
    setInvites([]);
    setStatus("disconnected");
    setError(null);
  };

  const returnToSignIn = () => {
    leaveMeetingVoice();
    leaveProximityVoice();
    leavePrivateVoice();
    privateZoneIdRef.current = null; setPrivateZoneId(null);
    proximityGroupIdRef.current = null;
    setProximityGroupId(null);
    setAuthUser(null);
    clearSelectedOffice();
    setOffices([]);
    setInvites([]);
    setOfficeListVerified(false);
    setAuthError("Your sign-in session expired. Please sign in again.");
    setStatus("disconnected");
    setError(null);
    setPeople([]);
    setPlayerCount(0);
  };

  useEffect(() => {
    if (!authReady || !authUser) return;
    let disposed = false;
    const load = async () => {
      setLobbyBusy(true);
      setInitialLobbyLoading(true);
      try {
        let invitedOfficeId: string | null = null;
        const currentPath = routePathRef.current;
        const currentInviteToken = getInviteRouteToken(currentPath);
        if (currentInviteToken) {
          const accepted = await fetch(`${endpoint}/office-invites/accept`, {
            method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: currentInviteToken }),
          });
          const result = await accepted.json() as { officeId?: string; error?: string };
          if (!accepted.ok) throw new Error(result.error ?? "Invite could not be accepted.");
          if (!result.officeId) throw new Error("Invite was accepted, but its office could not be identified.");
          invitedOfficeId = result.officeId;
          window.history.replaceState(null, "", "/");
          setRoutePath("/");
        }
        const response = await fetch(`${endpoint}/offices`, { credentials: "include" });
        const result = await response.json() as { offices?: Office[]; invites?: OfficeInvite[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load offices.");
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
              setLobbyError("You must be signed in and invited to this office before opening its link.");
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
          } else {
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
  }, [authReady, authUser]);

  useEffect(() => {
    if (!authUser || authUser.role !== "maintainer") return;
    void fetch(`${endpoint}/maintainer/users`, { credentials: "include" })
      .then(async (response) => {
        const result = await response.json() as { users?: ManagedAccount[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load accounts.");
        setAccounts(result.users ?? []);
      })
      .catch((cause) => setAccountError(cause instanceof Error ? cause.message : "Could not load accounts."));
  }, [authUser]);

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
      generatedLayout = generateCampusMap({ totalPeople: generatorTotalPeople, peoplePerTeam: createOfficePeoplePerTeam, teamCount: generatorTeamCount }).layout;
    } catch (cause) {
      setLobbyError(cause instanceof Error ? cause.message : "Check the team and people counts.");
      return;
    }
    setLobbyBusy(true);
    setLobbyError(null);
    try {
      const response = await fetch(`${endpoint}/offices`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: officeName }),
      });
      const result = await response.json() as { office?: Office; error?: string };
      if (!response.ok || !result.office) throw new Error(result.error ?? "Could not create office.");
      setOfficeName("");
      setOffices((current) => [result.office!, ...current]);
      const mapResponse = await fetch(`${endpoint}/offices/${result.office.id}/map`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 1, configVersion: 1, layout: generatedLayout }),
      });
      const mapResult = await mapResponse.json() as { config?: unknown; error?: string };
      if (!mapResponse.ok || !mapResult.config) throw new Error(`Office created, but its generated map could not be saved: ${mapResult.error ?? "Please open Edit map and save the layout again."}`);
      setCreateOfficeDialogOpen(false);
    } catch (cause) {
      setLobbyError(cause instanceof Error ? cause.message : "Could not create office.");
    } finally { setLobbyBusy(false); }
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
      roomRef.current?.send("input", { x: 0, z: 0, sprint: false });
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
    const prop: RoomLayoutProp = { id: `prop-${crypto.randomUUID()}`, asset, x: Math.max(-mapDimensions.width / 2 + definition.width / 2, Math.min(mapDimensions.width / 2 - definition.width / 2, position.x)), z: Math.max(-mapDimensions.depth / 2 + definition.depth / 2, Math.min(mapDimensions.depth / 2 - definition.depth / 2, position.z)), rotation: 0, collision: definition.collision, width: definition.width, depth: definition.depth, ...(position.elevation && position.elevation > 0 ? { elevation: position.elevation } : {}) };
    setModifyPropsDraft((current) => [...current, prop]);
    setSelectedModifyPropId(prop.id);
  };

  const moveOfficeProp = (id: string, position: { x: number; z: number; elevation?: number }) => {
    setModifyPropsDraft((current) => current.map((prop) => {
      if (prop.id !== id) return prop;
      const support = roomPropPlacementSupport(current.filter((item) => item.id !== id), prop.asset, position.x, position.z, prop.rotation);
      const elevation = position.elevation ?? support?.elevation ?? 0;
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
    return {
      ...prop,
      rotation,
      x: snapCenter(prop.x + mapDimensions.width / 2, footprintWidth, mapDimensions.width) - mapDimensions.width / 2,
      z: snapCenter(prop.z + mapDimensions.depth / 2, footprintDepth, mapDimensions.depth) - mapDimensions.depth / 2,
    };
  }));
  const deleteOfficeProp = (id: string) => {
    setModifyPropsDraft((current) => current.filter((prop) => prop.id !== id));
    setSelectedModifyPropId((current) => current === id ? null : current);
  };


  const startMapZoneDrawing = () => {
    setSelectedMapZoneId(null);
    setMapZoneArea(null);
    setMapZoneName("");
    setMapZoneKind("meeting");
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
    const zone: RoomLayoutZone = {
      id, name: name.slice(0, 32), kind: mapZoneKind,
      x, z, width, depth, color: mapZoneKind === "meeting" ? "#8ecae6" : mapZoneKind === "restroom" ? "#70c1b3" : "#ffb703",
    };
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

  const applyGeneratedCampusLayout = async () => {
    if (!officeMapLayout || !activeOffice) return;
    try {
      const generated = generateCampusMap({ totalPeople: generatorTotalPeople, peoplePerTeam: generatorPeoplePerTeam, teamCount: generatorTeamCount });
      const propsResponse = await fetch(`${endpoint}/offices/${activeOffice.id}/props`, { credentials: "include" });
      const propsResult = await propsResponse.json() as { props?: RoomLayoutProp[]; configVersion?: number; error?: string };
      if (!propsResponse.ok || !Array.isArray(propsResult.props)) throw new Error(propsResult.error ?? "Could not load existing office props.");
      const generatedIds = new Set(generated.layout.props.map((prop) => prop.id));
      const isPreviousCampusGeneratedProp = (prop: RoomLayoutProp) => /^(?:team-\d+-office-\d+|meeting-|shared-|campus-)/i.test(prop.id);
      const existingProps = propsResult.props.filter((prop) => !isPreviousCampusGeneratedProp(prop) && !generatedIds.has(prop.id));
      // Keep manually placed props, but replace props from an earlier generated
      // campus so the new rooms do not inherit stale furniture in old positions.
      // If a manual prop is beyond the plan boundary, widen the draft only enough
      // to contain it and extend the cross streets to match.
      const requiredHalfWidth = existingProps.reduce((max, prop) => Math.max(max, Math.abs(prop.x) + prop.width / 2), generated.dimensions.width / 2);
      const preservedWidth = Math.ceil(requiredHalfWidth / 2) * 2;
      const preservedLayout = preservedWidth > generated.dimensions.width
        ? {
            ...generated.layout,
            dimensions: { ...generated.dimensions, width: preservedWidth },
            roadways: generated.layout.roadways?.map((road) => road.width === generated.dimensions.width ? { ...road, width: preservedWidth } : road),
          }
        : generated.layout;
      const outsideDepthProps = existingProps.filter((prop) => Math.abs(prop.z) + prop.depth / 2 > generated.dimensions.depth / 2);
      if (outsideDepthProps.length) throw new Error(`${outsideDepthProps.length} existing prop${outsideDepthProps.length === 1 ? " is" : "s are"} outside the ${generated.dimensions.depth} m map depth. Move them inside before generating this layout.`);
      setMapPropsConfigVersion(propsResult.configVersion ?? 1);
      const next = { ...preservedLayout, props: [...existingProps, ...generated.layout.props] };
      setOfficeMapLayout(next);
      setSelectedMapZoneId(null);
      setMapGeneratorOpen(false);
      setGeneratorError(null);
      setLobbyError(null);
    } catch (cause) {
      setGeneratorError(cause instanceof Error ? cause.message : "Could not generate the campus layout.");
    }
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

  const claimDeskZone = async (zoneId: string) => {
    if (!activeOffice || deskClaimBusy) return;
    setDeskClaimBusy(true);
    setDeskClaimingZoneId(zoneId);
    setDeskClaimError(null);
    try {
      const response = await fetch(`${endpoint}/offices/${activeOffice.id}/desk-zones/${encodeURIComponent(zoneId)}/claim`, { method: "POST", credentials: "include" });
      const result = await response.json().catch(() => null) as { config?: unknown; error?: string } | null;
      if (!result) throw new Error("Desk claiming is temporarily unavailable. Please try again shortly.");
      if (!response.ok || !result.config) throw new Error(result.error ?? "Could not claim this desk.");
      setOfficeMapLayout(readRoomLayout(result.config));
      setSelectedDeskZoneId(zoneId);
    } catch (cause) { setDeskClaimError(cause instanceof Error ? cause.message : "Could not claim this desk."); }
    finally { setDeskClaimBusy(false); setDeskClaimingZoneId(null); }
  };

  const unclaimDeskZone = async (zoneId: string) => {
    if (!activeOffice || deskClaimBusy) return;
    setDeskClaimBusy(true);
    setDeskClaimingZoneId(zoneId);
    setDeskClaimError(null);
    try {
      const response = await fetch(`${endpoint}/offices/${activeOffice.id}/desk-zones/${encodeURIComponent(zoneId)}/unclaim`, { method: "POST", credentials: "include" });
      const result = await response.json().catch(() => null) as { config?: unknown; error?: string } | null;
      if (!result) throw new Error("Desk management is temporarily unavailable. Please try again shortly.");
      if (!response.ok || !result.config) throw new Error(result.error ?? "Could not unclaim this desk.");
      setOfficeMapLayout(readRoomLayout(result.config));
      setSelectedDeskZoneId(null);
      roomRef.current?.send("zone-lock", { zoneId, locked: false });
    } catch (cause) { setDeskClaimError(cause instanceof Error ? cause.message : "Could not unclaim this desk."); }
    finally { setDeskClaimBusy(false); setDeskClaimingZoneId(null); }
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

  const createAndCopyOfficeInviteLink = async (officeId: string) => {
    setInviteLinkBusyOfficeId(officeId);
    setInviteLinkFeedback(null);
    try {
      const response = await fetch(`${endpoint}/offices/${officeId}/invites`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user" }),
      });
      const result = await response.json() as { invite?: { token?: string }; error?: string };
      if (!response.ok || !result.invite?.token) throw new Error(result.error ?? "Could not create an invite link.");
      await navigator.clipboard.writeText(`${window.location.origin}/join/${result.invite.token}`);
      setInviteLinkFeedback({ officeId, message: "Invite link copied · one use · expires in 7 days" });
    } catch (cause) {
      setInviteLinkFeedback({ officeId, message: cause instanceof Error ? cause.message : "Could not copy the invite link." });
    } finally {
      setInviteLinkBusyOfficeId(null);
    }
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
    if (!authReady || !authUser || !activeOffice) return;
    let disposed = false;
    let inputTimer: number | undefined;
    let rejoinTimer: number | undefined;
    const sendHeldMovement = () => {
      const room = roomRef.current;
      if (!room) return;
      if (appPausedRef.current || mapEditModeRef.current || modifyPropsOpenRef.current) { room.send("input", { x: 0, z: 0, sprint: false }); return; }
      const heldKeys = heldKeysRef.current;
      const right = Number(heldKeys.has("KeyD") || heldKeys.has("ArrowRight")) - Number(heldKeys.has("KeyA") || heldKeys.has("ArrowLeft"));
      const forward = Number(heldKeys.has("KeyW") || heldKeys.has("ArrowUp")) - Number(heldKeys.has("KeyS") || heldKeys.has("ArrowDown"));
      room.send("input", { ...screenMovementToWorld({ x: right, z: forward }, cameraYawRef.current), sprint: heldKeys.has("ShiftLeft") || heldKeys.has("ShiftRight") });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if ((appPausedRef.current || mapEditModeRef.current || modifyPropsOpenRef.current) && movementKeys.includes(event.code)) { heldKeysRef.current.delete(event.code); event.preventDefault(); return; }
      if (movementKeys.includes(event.code)) {
        heldKeysRef.current.add(event.code);
        event.preventDefault();
        // Send once immediately, then let the 50 ms heartbeat carry held input.
        // Browser key-repeat events are not useful movement updates and can
        // exceed Colyseus' inbound message limit while a key is held.
        if (!event.repeat) sendHeldMovement();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!heldKeysRef.current.delete(event.code)) return;
      sendHeldMovement();
    };
    const onBlur = () => { heldKeysRef.current.clear(); };
    // Capture movement keys before buttons or other UI elements can consume
    // them, so WASD continues to drive while the world or HUD has focus.
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);

    const connect = async () => {
      try {
        intentionalLeaveRef.current = false;
        const room = await client.joinOrCreate<OfficeStateType>("office", { officeId: activeOffice.id }, OfficeState);
        if (disposed) {
          await room.leave();
          return;
        }
        roomRef.current = room;
        localSessionIdRef.current = room.sessionId;
        blasterEventsRef.current.length = 0;
        room.send("weapon-equip", "");
        const storedPet = window.localStorage.getItem(`gammyverse.pet.${authUser?.username ?? ""}`) ?? "";
        room.send("pet", KENNEY_PET_IDS.includes(storedPet as KenneyPetId) ? storedPet : "");
        window.localStorage.removeItem(`gammyverse.vehicle.${authUser?.username ?? ""}`);
        autoRejoiningRef.current = false;
        autoRejoinAttemptsRef.current = 0;
        room.reconnection.enabled = true;
        room.reconnection.maxRetries = 6;
        room.reconnection.delay = 250;
        room.reconnection.minDelay = 250;
        room.reconnection.maxDelay = 3_000;
        room.reconnection.minUptime = 0;
        setStatus("connected");
        setError(null);

        const applyState = (state: OfficeState) => {
          const snapshot = new Map<string, PlayerSnapshot>();
          const localPlayer = localSessionIdRef.current
            ? state.players.get(localSessionIdRef.current)
            : undefined;
          for (const [sessionId, player] of state.players) {
            const entry = player as PlayerState;
            snapshot.set(sessionId, {
              x: entry.x,
              z: entry.z,
              rotation: entry.rotation,
              displayName: entry.displayName,
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
              status: entry.status === "do-not-disturb" || entry.status === "in-meeting" || entry.status === "toilet" || entry.status === "lunch" || entry.status === "coffee-break" ? entry.status : "available",
              presence: entry.presence === "away" ? "away" : "online",
              nearby: Boolean(localPlayer && sessionId !== localSessionIdRef.current && entry.presence === "online" && nearbySessionIdsRef.current.has(sessionId)),
            });
          }
          playersRef.current = snapshot;
          const localSnapshot = localSessionIdRef.current ? snapshot.get(localSessionIdRef.current) : undefined;
          setInboundAudioMuted(localSnapshot?.status === "do-not-disturb" || localSnapshot?.status === "in-meeting");
          setUserStatus(localSnapshot?.status ?? "available");
          setActivePetId(localSnapshot?.petId ?? "");
          updateProximityAudioVolumes();
          const signature = [...snapshot]
            .map(([id, player]) => `${id}:${player.presence}:${player.nearby}:${player.displayName}:${player.characterId}:${player.petId}:${player.weaponId}:${player.vehicleId}:${player.vehicleMode}:${player.vehiclePropId}:${player.vehiclePropX}:${player.vehiclePropZ}:${player.vehiclePropRotation}:${player.sittingPropId}:${player.status}`)
            .sort()
            .join("|");
          if (signature !== peopleSignatureRef.current) {
            peopleSignatureRef.current = signature;
            setPeople([...snapshot.entries()]);
            setPlayerCount(snapshot.size);
          }
        };
        room.onMessage("blaster-shot", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("shooterSessionId" in payload) || !("start" in payload) || !("end" in payload)) return;
          const shot = payload as BlasterShotEvent;
          const vectorIsFinite = (vector: BlasterVector) => vector && [vector.x, vector.y, vector.z].every((coordinate) => Number.isFinite(coordinate));
          if (typeof shot.shooterSessionId !== "string" || !vectorIsFinite(shot.start) || !vectorIsFinite(shot.end)) return;
          blasterEventsRef.current.push(shot);
          if (blasterEventsRef.current.length > 24) blasterEventsRef.current.splice(0, blasterEventsRef.current.length - 24);
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
          if (typeof payload !== "object" || payload === null || !("followerSessionId" in payload) || typeof payload.followerSessionId !== "string" || !("followerName" in payload) || typeof payload.followerName !== "string") return;
          if (!inboundAudioMutedRef.current) playSocialNotificationSound("follow");
          setFollowAlerts((current) => [...current.filter((alert) => alert.followerSessionId !== payload.followerSessionId), { followerSessionId: payload.followerSessionId as string, followerName: payload.followerName as string }].slice(-3));
        });
        room.onMessage("follow-ended", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("followerSessionId" in payload) || typeof payload.followerSessionId !== "string") return;
          setFollowAlerts((current) => current.filter((alert) => alert.followerSessionId !== payload.followerSessionId));
        });
        room.onMessage("wave-notification", (payload: unknown) => {
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
          if (typeof payload === "object" && payload !== null && "config" in payload) {
            // Preserve edits in this editor's private draft. A successful save
            // is applied from the HTTP response after the server validates it.
            if (!mapEditModeRef.current || !mapDraftDirtyRef.current && !mapCommitInFlightRef.current) {
              const incomingLayout = readRoomLayout(payload.config);
              setOfficeMapLayout(incomingLayout);
              if (mapEditModeRef.current) setMapEditBaseline(incomingLayout);
            }
          }
        });
        room.onMessage("map-edit-lock", (payload: unknown) => {
          if (typeof payload !== "object" || payload === null || !("editorUsername" in payload)) return;
          setMapEditorUsername(typeof payload.editorUsername === "string" ? payload.editorUsername : null);
        });
        room.onMessage("map-edit-lock-result", (payload: unknown) => {
          setMapEditLockRequestPending(false);
          if (typeof payload !== "object" || payload === null || !("granted" in payload)) return;
          if (payload.granted === true) {
            if (activeOffice) void loadMapForEditing(activeOffice);
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
          if (typeof payload !== "object" || payload === null || !("status" in payload) || typeof payload.status !== "string") return;
          if (userStatusRef.current === "toilet" && (payload.status === "unreachable" || payload.status === "blocked")) setStatusTravelError("Could not reach the restroom. Check that its entrance is open and the route is walkable.");
          if (payload.status === "cancelled") { setAutoMoveNotice(null); return; }
          if (payload.status === "arrived" && authUser?.username) {
            window.localStorage.removeItem(`gammyverse.vehicle.${authUser.username}`);
          }
          let message = payload.status === "started" ? "Moving automatically" : payload.status === "arrived" ? "Arrived" : "Can't reach that spot";
          if (payload.status === "started" && "randomVehicle" in payload && payload.randomVehicle === true && "vehicleId" in payload && typeof payload.vehicleId === "string" && KENNEY_VEHICLE_IDS.includes(payload.vehicleId as KenneyVehicleId)) {
            message = `Driving ${vehicleLabel(payload.vehicleId as KenneyVehicleId)}`;
          }
          setAutoMoveNotice(message);
          if (autoMoveNoticeTimerRef.current !== undefined) window.clearTimeout(autoMoveNoticeTimerRef.current);
          autoMoveNoticeTimerRef.current = window.setTimeout(() => setAutoMoveNotice(null), payload.status === "started" ? 2600 : 1800);
        });
        room.onMessage("vehicle-exited", () => {
          if (authUser?.username) window.localStorage.removeItem(`gammyverse.vehicle.${authUser.username}`);
        });
        room.onStateChange(applyState);
        if (room.state) applyState(room.state);
        room.send("request-spatial-state");

        room.onDrop(() => {
          reconnectingRef.current = true;
          meetingZoneActiveRef.current = false;
          privateZoneIdRef.current = null;
          setPrivateZoneId(null);
          leaveMeetingVoice();
          leaveProximityVoice();
          leavePrivateVoice();
          setMeetingZoneActive(false);
          proximityGroupIdRef.current = null;
          setProximityGroupId(null);
          if (!disposed) {
            setStatus("reconnecting");
            setError(null);
          }
        });
        room.onReconnect(() => {
          reconnectingRef.current = false;
          if (!disposed) {
            setStatus("connected");
            setError(null);
          }
        });
        room.onLeave((code, reason) => {
          const shouldRejoin = reconnectingRef.current && !intentionalLeaveRef.current && !disposed;
          reconnectingRef.current = false;
          meetingZoneActiveRef.current = false;
          privateZoneIdRef.current = null;
          setPrivateZoneId(null);
          autoRejoiningRef.current = shouldRejoin;
          autoRejoinAttemptsRef.current = 0;
          if (code === 4004) clearSelectedOffice();
          if (!disposed) {
            setStatus(code === 4004 ? "connected" : shouldRejoin ? "reconnecting" : "disconnected");
            setError(code === 4004 ? null : reason ?? null);
            setPeople([]);
            setPlayerCount(0);
            setFollowingSessionId(null);
            setFollowAlerts([]);
            setWaveAlerts([]);
          }
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
            }, 1_000);
          }
        });
        room.onError((_code, message) => {
          if (!disposed) {
            if (/authentication required|session (expired|invalid)|unauthori[sz]ed/i.test(message ?? "")) {
              returnToSignIn();
              return;
            }
            setStatus("error");
            setError(message || "Realtime connection failed.");
          }
        });

        inputTimer = window.setInterval(() => {
          if (roomRef.current !== room) return;
          sendHeldMovement();
        }, 50);
      } catch (cause) {
        if (!disposed) {
          const reason = cause instanceof Error ? cause.message : String(cause);
          if (/authentication required|session (expired|invalid)|unauthori[sz]ed/i.test(reason)) {
            returnToSignIn();
            return;
          }
          if (autoRejoiningRef.current && autoRejoinAttemptsRef.current < 5) {
            autoRejoinAttemptsRef.current += 1;
            setStatus("reconnecting");
            setError(null);
            const delay = Math.min(4_000, 250 * 2 ** (autoRejoinAttemptsRef.current - 1));
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
      if (inputTimer !== undefined) window.clearInterval(inputTimer);
      if (rejoinTimer !== undefined) window.clearTimeout(rejoinTimer);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      const room = roomRef.current;
      roomRef.current = null;
      if (room) void room.leave();
    };
  }, [client, connectionAttempt, authReady, authUser, activeOffice]);

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
          <p>{inviteLinkToken ? "You’ve been invited to an office. Create an account or sign in to join." : maintainerPortal ? "Sign in to manage GAMVerse and its offices." : "Sign in with your office username and password."}</p>
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
      <PageTutorial page={maintainerPortal ? "maintainer" : authMode === "register" ? "register" : "sign-in"} />
      {authBusy && <FullScreenLoading label={authMode === "register" ? "Creating your account…" : "Signing in…"} />}
      </>
    );
  }

  if (authUser.role === "user" && !authUser.characterId) {
    return <><main className="character-onboarding">
      <section className="character-onboarding-card">
        <span className="eyebrow">FIRST TIME HERE</span>
        <h1>Choose your character</h1>
        <p>Pick how other people will see you in the shared office.</p>
        <div className="tutorial-character-picker" data-tutorial-target="character-picker"><CharacterPicker value={characterDraft} onChange={setCharacterDraft} /></div>
        {characterError && <p className="auth-error" role="alert">{characterError}</p>}
        <button data-tutorial-target="character-continue" className="auth-submit" type="button" disabled={characterBusy || !characterDraft} onClick={() => void saveCharacter()}>{characterBusy ? "Saving…" : "Continue"}</button>
      </section>
    </main><PageTutorial page="character-setup" username={authUser.username} />{characterBusy && <FullScreenLoading label="Saving your character…" />}</>;
  }

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
          <header className="character-drawer-header"><div><span className="eyebrow">YOUR ACCOUNT</span><h2>Profile & settings</h2></div></header>
          <section className="character-account" aria-label="Your account"><span className="character-account-avatar">{authUser.username.slice(0, 1).toUpperCase()}</span><div className="character-account-name"><strong>{authUser.username}</strong><span>{authUser.role}</span></div><button type="button" className="account-action signout" onClick={signOut}>Sign out</button></section>
          <div className="user-settings-content"><section className="user-settings-section"><button type="button" className="settings-menu-row" onClick={() => { setAccountError(null); setChangePasswordOpen(true); }}><span><strong>Change password</strong><small>Update your sign-in password</small></span><span aria-hidden="true">›</span></button></section></div>
        </aside>}
        <section className="lobby-content">
          <div className="lobby-intro"><span className="eyebrow">YOUR WORKSPACE</span><h1>{authUser.role === "maintainer" ? "Manage offices" : "Choose an office"}</h1><p>Enter an office you belong to, accept an invitation, or start a new office.</p></div>
          <div className="lobby-create-office-action"><button data-tutorial-target="lobby-create-office" className="lobby-button primary" type="button" onClick={() => { setLobbyError(null); setCreateOfficeDialogOpen(true); }}>＋ Create office</button></div>
          {lobbyError && <p className="auth-error" role="alert">{lobbyError}</p>}
          {accountError && <p className="auth-error" role="alert">{accountError}</p>}
          {createOfficeDialogOpen && <div className="manager-backdrop create-office-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !lobbyBusy) setCreateOfficeDialogOpen(false); }}><form className="manager-dialog create-office-dialog" role="dialog" aria-modal="true" aria-labelledby="create-office-title" onSubmit={(event) => void createOfficeAction(event)}>
            <button type="button" className="manager-close" aria-label="Close" disabled={lobbyBusy} onClick={() => setCreateOfficeDialogOpen(false)}>×</button>
            <span className="eyebrow">NEW WORKSPACE</span><h2 id="create-office-title">Create office</h2><p className="manager-owner">Set a name and team size. We’ll generate a campus map to fit.</p>
            <label>Office name<input autoFocus required minLength={2} maxLength={64} value={officeName} onChange={(event) => setOfficeName(event.target.value)} placeholder="Office name" /></label>
            <div className="create-office-generator-fields" aria-label="Campus size inputs">
              <label>Total people<input type="number" min="1" max="4000" step="1" value={generatorTotalPeople} onChange={(event) => setGeneratorTotalPeople(Number(event.target.value))} /></label>
              <label>Teams<input type="number" min="1" max="250" step="1" value={generatorTeamCount} onChange={(event) => setGeneratorTeamCount(Number(event.target.value))} /></label>
            </div>
            {createOfficeInputsValid ? <p className="map-zone-help create-office-derived-size">{createOfficePeoplePerTeam} people per team · {generatorTotalPeople} ÷ {generatorTeamCount}</p> : <p className="auth-error" role="alert">Total people must divide evenly across teams, with 1–16 people per team.</p>}
            {lobbyError && <p className="auth-error" role="alert">{lobbyError}</p>}
            <footer className="create-office-dialog-actions"><button className="lobby-button" type="button" disabled={lobbyBusy} onClick={() => setCreateOfficeDialogOpen(false)}>Cancel</button><button className="lobby-button primary" type="submit" disabled={lobbyBusy || !createOfficeInputsValid}>{lobbyBusy ? "Creating…" : "Create office & map"}</button></footer>
          </form></div>}
          {authUser.role === "maintainer" && <section className="lobby-panel account-panel"><div className="card-heading"><div><span className="eyebrow">PLATFORM ACCOUNTS</span><h2>Accounts and recovery</h2></div><span className="count-chip">{accounts.length}</span></div><p className="empty-people">Create a fresh one-time reset link for a user and share it with them. No email is sent.</p><ul className="manager-member-list">{accounts.map((account) => <li key={account.username}><div><strong>{account.username}</strong><small>{account.email || "No email"} · Active {account.lastActiveAt ? new Date(account.lastActiveAt).toLocaleString() : "unknown"}</small></div><div className="member-actions"><button className="lobby-button" disabled={account.username === authUser.username} onClick={() => void issueResetLink(account.username)}>Generate reset link</button></div>{resetUrls[account.username] && <div className="invite-link-box account-reset-link"><code>{resetUrls[account.username]}</code><button className="lobby-button" onClick={() => void navigator.clipboard.writeText(resetUrls[account.username]!)}>Copy link</button><small>One use · expires in 15 minutes · generating another link invalidates this one</small></div>}</li>)}</ul></section>}
          <nav className="lobby-section-tabs" role="tablist" aria-label="Workspace sections">
            <button data-tutorial-target="lobby-offices" type="button" role="tab" id="offices-tab" aria-selected={activeLobbyTab === "offices"} aria-controls="offices-panel" className={activeLobbyTab === "offices" ? "active" : ""} onClick={() => setActiveLobbyTab("offices")}>Offices <span>{offices.length}</span></button>
            <button data-tutorial-target="lobby-invitations" type="button" role="tab" id="invitations-tab" aria-selected={activeLobbyTab === "invitations"} aria-controls="invitations-panel" className={activeLobbyTab === "invitations" ? "active" : ""} onClick={() => setActiveLobbyTab("invitations")}>Invitations <span>{invites.length}</span></button>
          </nav>
          <div className="lobby-tab-content">
            {activeLobbyTab === "offices" && <section id="offices-panel" role="tabpanel" aria-labelledby="offices-tab" className="lobby-panel"><div className="card-heading"><div><span className="eyebrow">OFFICES</span><h2>Your offices</h2></div><span className="count-chip">{offices.length}</span></div>
              {offices.length === 0 ? <p className="empty-people">No offices yet. Create one or accept an invite.</p> : <div className="office-grid">{offices.map((office) => <article className="office-tile" key={office.id}>
                <div><span className="live-indicator" /><span className="office-role">{office.role}</span></div><h3>{office.name}</h3><p>Owner: {office.ownerUsername}</p>
                <button className="lobby-button primary" disabled={lobbyBusy} onClick={() => selectOffice(office)}>Enter office</button>
                {(["owner", "admin", "maintainer"] as string[]).includes(office.role) ? <button className="lobby-button" disabled={lobbyBusy || inviteLinkBusyOfficeId !== null} onClick={() => void createAndCopyOfficeInviteLink(office.id)}>{inviteLinkBusyOfficeId === office.id ? "Creating invite…" : "Copy invite link"}</button> : <p className="invite-notice">Ask an office admin to invite someone.</p>}
                {inviteLinkFeedback?.officeId === office.id && <p className="invite-notice" role="status">{inviteLinkFeedback.message}</p>}
                {["owner", "admin", "maintainer"].includes(office.role) && <button className="lobby-button office-manage-button" disabled={lobbyBusy} onClick={() => void openOfficeManager(office)}>Manage office</button>}
              </article>)}</div>}
            </section>}
            {activeLobbyTab === "invitations" && <section id="invitations-panel" role="tabpanel" aria-labelledby="invitations-tab" className="lobby-panel"><div className="card-heading"><div><span className="eyebrow">INVITATIONS</span><h2>Invited to join</h2></div><span className="count-chip">{invites.length}</span></div>
              {invites.length === 0 ? <p className="empty-people">No pending invitations.</p> : <ul className="invite-list">{invites.map((invite) => <li key={invite.id}><div><strong>{invite.officeName}</strong><small>Invited by {invite.inviter} as {invite.role}</small></div><button className="lobby-button primary" disabled={lobbyBusy} onClick={() => void acceptInvite(invite.id)}>Accept</button></li>)}</ul>}
              {inviteLinkToken && <p className="invite-notice">Processing your one-time office invite…</p>}
            </section>}
          </div>
        </section>
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
  const selectedVoiceLabel = meetingZoneActive ? "Meeting" : privateZoneId ? (privateZoneName ?? "Private zone") : "Public";
  const activeDeskZoneId = privateZoneId ?? selectedDeskZoneId;
  const selectedMapZone = selectedMapZoneId ? officeMapLayout?.zones.find((zone) => zone.id === selectedMapZoneId) ?? null : null;
  const mapDraftDirty = Boolean(mapEditMode && officeMapLayout && mapEditBaseline && JSON.stringify(officeMapLayout) !== JSON.stringify(mapEditBaseline));
  mapDraftDirtyRef.current = mapDraftDirty;
  const entranceWallLength = mapZoneArea ? mapZoneEntranceSide === "north" || mapZoneEntranceSide === "south" ? mapZoneArea.width : mapZoneArea.depth : 0;
  const entranceOpeningWidth = Math.min(mapZoneEntranceKind === "opening" ? 1.2 : mapZoneDoorLeaves === 2 ? 2.4 : 1.2, entranceWallLength);
  const entrancePositions = mapZoneDoorOffsets.slice(0, mapZoneDoorCount).map((offset) => Math.max(-entranceWallLength / 2 + entranceOpeningWidth / 2, Math.min(entranceWallLength / 2 - entranceOpeningWidth / 2, offset))).sort((a, b) => a - b);
  const entrancesOverlap = entrancePositions.some((offset, index) => index > 0 && offset - entrancePositions[index - 1]! < entranceOpeningWidth - 0.01);
  const entrancesFit = entranceWallLength >= entranceOpeningWidth * mapZoneDoorCount && !entrancesOverlap;
  const mapZoneDraft = mapZoneArea ? buildMapZoneDraft("zone-preview") : null;
  const zoneEntranceIssue = mapZoneDraft ? roomZoneEntranceIssues(mapZoneDraft.layout, new Set(["zone-preview"]))[0] : undefined;
  const zoneOverlapsExisting = Boolean(mapZoneArea && officeMapLayout?.zones.some((zone) =>
    Math.abs(mapZoneArea.x - zone.x) < (mapZoneArea.width + zone.width) / 2 - 0.01 &&
    Math.abs(mapZoneArea.z - zone.z) < (mapZoneArea.depth + zone.depth) / 2 - 0.01));
  const zoneCreationValid = Boolean(entrancesFit && mapZoneDraft?.withinBounds && !zoneOverlapsExisting && !zoneEntranceIssue);
  const selectedZoneEntranceBlocked = Boolean(selectedMapZoneId && officeMapLayout && roomZoneEntranceIssues(officeMapLayout, new Set([selectedMapZoneId])).length);
  const selectedZoneHasGeneratedDoor = Boolean(selectedMapZoneId && officeMapLayout?.doors.some((door) => door.id.startsWith(`${selectedMapZoneId}-entrance-`)));
  const activeDeskZone = activeDeskZoneId ? officeMapLayout?.zones.find((zone) => zone.id === activeDeskZoneId && zone.kind === "private") ?? null : null;
  const personalDeskZone = authUser && officeMapLayout ? officeMapLayout.zones.find((zone) => zone.kind === "private" && zone.ownerUsername === authUser.username) ?? null : null;
  const activeDeskZoneLabel = activeDeskZone?.ownerUsername ? `${activeDeskZone.ownerUsername}'s desk` : activeDeskZone ? "Available desk" : null;
  const activeDeskZoneIsCurrent = Boolean(privateZoneId && activeDeskZone?.id === privateZoneId);
  const canManageCurrentDesk = Boolean(activeDeskZoneIsCurrent && activeDeskZone?.ownerUsername === authUser?.username);
  const zoneLockTargetId = meetingZoneId ?? (canManageCurrentDesk ? privateZoneId : null);
  const zoneAccessDetail = activeDeskZone
    ? `${activeDeskZoneIsCurrent ? "You’re here · " : ""}${activeDeskZone.ownerUsername ? activeDeskZone.ownerUsername === authUser?.username ? "Your desk" : `Desk owned by ${activeDeskZone.ownerUsername}` : "No owner · available to claim"}`
    : meetingZoneId ? `You’re here · ${lockedZoneIds.includes(meetingZoneId) ? "Locked to current occupants" : "Open to everyone"}` : "Open to everyone";
  const userOwnsAnotherDesk = Boolean(activeDeskZone && authUser && officeMapLayout?.zones.some((zone) => zone.kind === "private" && zone.ownerUsername === authUser.username && zone.id !== activeDeskZone.id));
  const canClaimAnyDesk = !authUser || !officeMapLayout?.zones.some((zone) => zone.kind === "private" && zone.ownerUsername === authUser.username);
  const focusedVideoTile = videoTiles.find((tile) => tile.key === focusedVideoKey) ?? videoTiles[0] ?? null;
  const secondaryVideoTiles = focusedVideoTile ? videoTiles.filter((tile) => tile.key !== focusedVideoTile.key) : [];
  const miniVideoTiles = secondaryVideoTiles.length > 0 ? secondaryVideoTiles : focusedVideoTile ? [focusedVideoTile] : [];
  const previewCharacterId = characterDraft ?? authUser.characterId ?? DEFAULT_CHARACTER_ID;
  const previewCharacter = characterDetails(previewCharacterId, personalAvatarModels);
  const displayedOfficeMapLayout = modifyPropsOpen && officeMapLayout ? { ...officeMapLayout, props: modifyPropsDraft } : officeMapLayout;

  return (
    <main className={`app-shell${characterPanelOpen ? " character-panel-open" : ""}`}>
      <PageTutorial page={meetingEntry ? "meeting" : "office"} username={authUser.username} />
      <WorldCanvas activeRoomKey="lobby" cameraRoomKey={activeCameraRoomKey} playersRef={playersRef} localSessionIdRef={localSessionIdRef} speakingUsernamesRef={speakingUsernamesRef} heldKeysRef={heldKeysRef} cameraYawRef={cameraYawRef} roomLayout={displayedOfficeMapLayout} personalDeskZone={personalDeskZone} currentPrivateZoneId={privateZoneId} inboundAudioMuted={inboundAudioMutedRef.current} appPaused={appPaused} idleAnimationsEnabled={idleAnimationsEnabled} mapEditMode={mapEditMode} selectedMapZoneId={selectedMapZoneId} buildMode={modifyPropsOpen} selectedAsset={selectedModifyPropAsset} selectedMapItemId={selectedModifyPropId} onPlaceProp={placeOfficeProp} onPlacementComplete={() => setSelectedModifyPropAsset(null)} onMoveProp={moveOfficeProp} onRotateProp={rotateOfficeProp} onDeleteProp={deleteOfficeProp} onSelectMapItem={setSelectedModifyPropId} onModifyProps={() => void enterModifyPropsMode()} spawnPlacementMode={spawnPlacementMode} onMoveSpawnPoint={(position) => void saveMapSpawnPoint(position)} zoneDrawing={mapZoneDrawing} onZoneAreaDrawn={(area) => { setMapZoneArea(area); setMapZoneDrawing(false); setMapZoneName(""); setLobbyError(null); }} onSelectDeskZone={(zoneId) => setSelectedDeskZoneId(zoneId)} onSelectMapZone={(zoneId) => setSelectedMapZoneId(zoneId)} onClaimDeskZone={(zoneId) => void claimDeskZone(zoneId)} canClaimDesk={canClaimAnyDesk} canEditMap={activeOffice.role === "owner" || activeOffice.role === "admin"} mapEditorUsername={mapEditorUsername} mapEditLockPending={mapEditLockRequestPending} onEditMap={() => enterMapEditMode(activeOffice)} blasterEventsRef={blasterEventsRef} onBlasterShot={(shot) => { if (!appPausedRef.current) roomRef.current?.send("blaster-shot", shot); }} onWeaponEquip={(weaponId) => { if (!appPausedRef.current) roomRef.current?.send("weapon-equip", weaponId); }} onVehicleInteract={(vehicleId, propId) => { if (!appPausedRef.current) roomRef.current?.send("vehicle-interact", vehicleId ? { vehicleId, propId } : ""); }} onAutoMove={(destination, randomVehicle) => { if (appPausedRef.current) return; heldKeysRef.current.clear(); roomRef.current?.send("auto-move", { ...destination, randomVehicle }); }} />
      {blasterHitNotice !== null && <div className="blaster-hit-feedback" key={blasterHitNotice} aria-hidden="true" />}
      <header className="topbar">
        <div className="topbar-side topbar-side-left">
          <button type="button" className={`left-sidebar-tab${workspacePanelOpen ? " selected" : ""}`} aria-controls="office-sidebar" aria-expanded={workspacePanelOpen} aria-label={workspacePanelOpen ? "Hide office panel" : "Show office panel"} title={workspacePanelOpen ? "Hide office panel" : "Show office panel"} onClick={() => setWorkspacePanelOpen((open) => !open)}>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><rect x="2.5" y="3" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M7.5 3v14" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>
        </div>
        <div className="topbar-title"><span className="brand-mark" aria-hidden="true">G</span><strong>GAMVerse</strong></div>
        <div className="topbar-side topbar-side-right">
          <button type="button" className={`right-character-tab${characterPanelOpen ? " selected" : ""}`} aria-label={characterPanelOpen ? "Hide user settings" : "Open user settings"} aria-expanded={characterPanelOpen} aria-controls="character-drawer" title="User settings" onClick={() => { setCharacterPanelOpen((open) => !open); setCharacterError(null); }}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.7"/><path d="M5.5 20c.3-3.5 2.8-5.6 6.5-5.6s6.2 2.1 6.5 5.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
          </button>
        </div>
      </header>
      {workspacePanelMounted && <aside id="office-sidebar" className={`office-sidebar sidebar-transition${workspacePanelOpen ? " is-open" : ""}`} aria-label="Office and people" aria-hidden={!workspacePanelOpen} inert={!workspacePanelOpen}>
        <nav className="left-sidebar-nav" aria-label="Office navigation">
          <button type="button" aria-pressed={activeLeftTab === "workspace"} className={activeLeftTab === "workspace" ? "active" : ""} onClick={() => setActiveLeftTab("workspace")}>Workspace</button>
          <button type="button" aria-pressed={activeLeftTab === "people"} className={activeLeftTab === "people" ? "active" : ""} onClick={() => setActiveLeftTab("people")}>People <span>{playerCount}</span></button>
          <button type="button" aria-pressed={activeLeftTab === "activity"} className={activeLeftTab === "activity" ? "active" : ""} onClick={() => setActiveLeftTab("activity")}>Activity</button>
        </nav>
        {activeLeftTab === "workspace" && <section className="sidebar-workspace" aria-label="Your workspace">
          <span className="eyebrow">WORKSPACE</span>
          <h1>{activeOffice.name}</h1>
          <div className="room-meta"><span className="live-indicator" /> {activeOffice.role} <span className="meta-divider">·</span> Owner: {activeOffice.ownerUsername}</div>
          <div className="office-space-card" aria-label="Office space"><span>200 × 250 m</span><span>One shared space</span></div>
          {(["owner", "admin", "maintainer"] as string[]).includes(activeOffice.role) ? <button type="button" className="workspace-share-button" aria-label="Create and copy office invite link" title="Create and copy invite link" disabled={inviteLinkBusyOfficeId !== null} onClick={() => void createAndCopyOfficeInviteLink(activeOffice.id)}>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10.5 10.5 7a3 3 0 0 1 4.2 4.2l-2 2"/><path d="m13 9.5-3.5 3.5a3 3 0 0 1-4.2-4.2l2-2"/></svg>
            <span>{inviteLinkBusyOfficeId === activeOffice.id ? "Creating…" : "Copy invite link"}</span>
          </button> : <p className="workspace-share-notice">Ask an office admin to invite someone.</p>}
          {inviteLinkFeedback?.officeId === activeOffice.id && <p className="workspace-share-notice" role="status">{inviteLinkFeedback.message}</p>}
        </section>}
        {activeLeftTab === "people" && <section id="people-panel" className="sidebar-people" aria-label="People in the office">
        <div className="card-heading"><div><span className="eyebrow">IN THE SPACE</span><h2>People <span>{playerCount}</span></h2></div></div>
        <label className="people-search"><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6"/><path d="m12.5 12.5 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg><input type="search" value={peopleSearch} onChange={(event) => setPeopleSearch(event.target.value)} placeholder="Search people" aria-label="Search people in the office" /></label>
        {playerCount === 0 ? (
          <p className="empty-people">{emptyPeopleMessage}</p>
        ) : (
          <ul className="people-list">
            {people.filter(([id, player]) => `${player.displayName} ${id === localSessionIdRef.current ? "You" : ""}`.toLocaleLowerCase().includes(peopleSearch.trim().toLocaleLowerCase())).map(([id, player]) => (
              <li className="person-row" key={id}>
                <span className="person-avatar">{player.displayName.slice(0, 1)}</span>
                <span className="person-info"><strong>{id === localSessionIdRef.current ? "You" : player.displayName}</strong><small>{player.presence === "away" ? "Reconnecting" : id === localSessionIdRef.current ? "At your desk" : player.nearby ? "Nearby" : "In the office"}</small></span>
                <span className="presence-dot" aria-label={player.presence === "away" ? "Reconnecting" : "Online"} />
                {id !== localSessionIdRef.current && player.presence === "online" && <span className="person-actions">
                  <button type="button" className={`person-action-button${followingSessionId === id ? " is-active" : ""}`} aria-label={followingSessionId === id ? `Stop following ${player.displayName}` : `Follow ${player.displayName}`} title={followingSessionId === id ? "Stop following" : "Follow"} onClick={() => {
                    if (followingSessionId === id) roomRef.current?.send("follow-stop");
                    else roomRef.current?.send("follow-player", { targetSessionId: id });
                  }}>
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4v6h6M4 10a8 8 0 1 1 2 8"/><path d="m12 16 4-4-4-4m4 4H9"/></svg>
                  </button>
                  <button type="button" className="person-action-button" aria-label={`Wave to ${player.displayName}`} title="Wave" onClick={() => roomRef.current?.send("wave", { targetSessionId: id })}>
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12V5a1.7 1.7 0 0 1 3.4 0v5-6a1.7 1.7 0 0 1 3.4 0v6-4a1.7 1.7 0 0 1 3.4 0v7l.8-1.8a1.8 1.8 0 0 1 3.3 1.4l-2.2 5.5A6 6 0 0 1 14 21h-1.5a6 6 0 0 1-4.2-1.7L4 15a1.8 1.8 0 0 1 2.5-2.6L8 14"/></svg>
                  </button>
                </span>}
              </li>
            ))}
          </ul>
        )}
        {playerCount > 0 && people.filter(([id, player]) => `${player.displayName} ${id === localSessionIdRef.current ? "You" : ""}`.toLocaleLowerCase().includes(peopleSearch.trim().toLocaleLowerCase())).length === 0 && <p className="empty-people">No people match “{peopleSearch.trim()}”.</p>}
        </section>}
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
        <header className="character-drawer-header"><div><span className="eyebrow">YOUR ACCOUNT</span><h2>Profile & settings</h2></div></header>
        <section className="character-account" aria-label="Your account"><span className="character-account-avatar">{authUser.username.slice(0, 1).toUpperCase()}</span><div className="character-account-name"><strong>{authUser.username}</strong><span>{authUser.role}</span></div><button type="button" className="account-action signout" onClick={signOut}>Sign out</button></section>
        <div className="user-settings-content">
          <section className="user-settings-section" aria-labelledby="character-settings-title">
            <button type="button" className="settings-menu-row" id="character-settings-title" onClick={() => { setCharacterDraft(authUser.characterId ?? DEFAULT_CHARACTER_ID); setCharacterPanelOpen(false); setWorkspacePanelOpen(false); setCharacterDialogOpen(true); }}><span><strong>Character</strong><small>View and customize your character</small></span><span aria-hidden="true">›</span></button>
          </section>
          <section className="user-settings-section" aria-labelledby="user-settings-title">
            <button type="button" className="settings-menu-row" id="user-settings-title" onClick={() => { setSettingsSection("general"); setPermissionMessage(null); setCharacterPanelOpen(false); setWorkspacePanelOpen(false); setSettingsOpen(true); void refreshBrowserPermissions(); }}><span><strong>Settings</strong><small>General, permissions, and security</small></span><span aria-hidden="true">›</span></button>
          </section>
        </div>
      </aside>}

      {characterDialogOpen && <div className="profile-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCharacterDialogOpen(false); }}><section className="profile-dialog character-select-dialog" role="dialog" aria-modal="true" aria-labelledby="character-select-title">
        <header className="profile-dialog-header"><div><span className="eyebrow">APPEARANCE</span><h2 id="character-select-title">Choose your character</h2></div><button type="button" className="icon-button" aria-label="Close character selection" onClick={() => setCharacterDialogOpen(false)}><FeatherIcon name="close" size={17} /></button></header>
        <div className="profile-dialog-content">
          <section className="character-preview-card" aria-label="Selected character preview">
            <CharacterPreview3D characterId={previewCharacterId} endpoint={endpoint} label={previewCharacter.label} fallbackImage={previewCharacter.preview} />
            <div className="character-preview-copy"><span className="eyebrow">3D PREVIEW</span><strong>{previewCharacter.label}</strong><span>{previewCharacter.source}</span><small>Drag the model to rotate it</small></div>
          </section>
          <CharacterPicker value={characterDraft} onChange={setCharacterDraft} />
          <section className="personal-models-section" aria-label="Personal 3D models">
            <div className="personal-models-heading"><div><span className="eyebrow">YOUR MODELS</span><p className="personal-model-help">One GLB file with embedded model textures, up to 10 MiB. Only you can choose or remove it.</p></div><button type="button" className="personal-model-add" disabled={avatarUploadBusy} onClick={() => avatarUploadInputRef.current?.click()}>{avatarUploadBusy ? "Uploading…" : "Add model"}</button></div>
            <input ref={avatarUploadInputRef} className="visually-hidden" type="file" accept=".glb,model/gltf-binary" onChange={(event) => void uploadPersonalAvatar(event)} aria-label="Upload a GLB character model" />
            {personalModelsBusy && <p className="personal-model-status">Loading your models…</p>}
            {personalModelsError && <p className="auth-error" role="alert">{personalModelsError}</p>}
            <PersonalAvatarPicker models={personalAvatarModels} value={characterDraft} currentCharacterId={authUser.characterId} onChange={setCharacterDraft} onRemove={(model) => void removePersonalAvatar(model)} />
          </section>
          <section className="companion-section" aria-label="Choose a companion pet">
            <div className="personal-models-heading"><div><span className="eyebrow">COMPANION</span><p className="personal-model-help">Choose a pet to follow you around the office.</p></div><button type="button" className="companion-none" aria-pressed={!activePetId} onClick={() => { setActivePetId(""); window.localStorage.removeItem(`gammyverse.pet.${authUser.username}`); roomRef.current?.send("pet", ""); }}>None</button></div>
            <div className="companion-picker" role="group" aria-label="Available pets">{KENNEY_PET_IDS.map((petId) => <button type="button" key={petId} className={`companion-card${activePetId === petId ? " selected" : ""}`} aria-pressed={activePetId === petId} title={petLabel(petId)} onClick={() => { setActivePetId(petId); window.localStorage.setItem(`gammyverse.pet.${authUser.username}`, petId); roomRef.current?.send("pet", petId); }}><img src={`/assets/kenney/cube-pets/Previews/${petId}.png`} alt="" loading="lazy" /><span>{petLabel(petId)}</span></button>)}</div>
          </section>
        </div>
        <footer className="profile-dialog-footer">{characterError && <p className="auth-error" role="alert">{characterError}</p>}<button type="button" className="auth-submit" disabled={characterBusy || !characterDraft || characterDraft === authUser.characterId} onClick={() => void saveCharacter()}>{characterBusy ? "Saving…" : "Save character"}</button></footer>
      </section></div>}

      {settingsOpen && <div className="profile-dialog-backdrop settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><section className="profile-dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
        <header className="profile-dialog-header"><div><span className="eyebrow">USER SETTINGS</span><h2 id="settings-dialog-title">Settings</h2></div><button type="button" className="icon-button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><FeatherIcon name="close" size={17} /></button></header>
        <div className="settings-dialog-body"><nav className="settings-section-nav" aria-label="Settings topics"><button type="button" className={settingsSection === "general" ? "active" : ""} aria-current={settingsSection === "general" ? "page" : undefined} onClick={() => setSettingsSection("general")}>General</button><button type="button" className={settingsSection === "permissions" ? "active" : ""} aria-current={settingsSection === "permissions" ? "page" : undefined} onClick={() => setSettingsSection("permissions")}>Permission</button><button type="button" className={settingsSection === "security" ? "active" : ""} aria-current={settingsSection === "security" ? "page" : undefined} onClick={() => setSettingsSection("security")}>Security</button></nav>
          <div className="settings-section-content">{settingsSection === "general" ? <section aria-labelledby="general-settings-title"><span className="eyebrow">PREFERENCES</span><h3 id="general-settings-title">General</h3><p className="settings-intro">Adjust how characters move and animate on this device.</p><div className="permission-row settings-general-row"><div><strong>Idle animations</strong><small>Turn off idle movement for characters and pets</small></div><label className="settings-toggle-control"><span className="sr-only">Idle animations</span><input type="checkbox" role="switch" checked={idleAnimationsEnabled} onChange={(event) => updateIdleAnimationsEnabled(event.target.checked)} /><span aria-hidden="true" /></label></div></section> : settingsSection === "permissions" ? <section aria-labelledby="permissions-title"><span className="eyebrow">DEVICE ACCESS</span><h3 id="permissions-title">Permissions</h3><p className="settings-intro">Allow GAMVerse to use your microphone, camera, or screen when you choose those controls.</p>
            {(["microphone", "camera"] as const).map((kind) => <div className="permission-row" key={kind}><div><strong>{kind === "microphone" ? "Microphone" : "Camera"}</strong><small className={`permission-state ${browserPermissions[kind]}`}>{browserPermissions[kind] === "unknown" ? "Status unavailable" : browserPermissions[kind]}</small></div><button type="button" className="lobby-button" disabled={permissionBusy !== null} onClick={() => void requestBrowserPermission(kind)}>{permissionBusy === kind ? "Checking…" : browserPermissions[kind] === "denied" ? "Check again" : "Allow access"}</button></div>)}
            <div className="permission-row"><div><strong>Screen sharing</strong><small>Browser asks each time you share</small></div><button type="button" className="lobby-button" disabled={permissionBusy !== null} onClick={() => void requestBrowserPermission("screen")}>{permissionBusy === "screen" ? "Checking…" : "Check sharing"}</button></div>
            {permissionMessage && <p className="permission-message" role="status">{permissionMessage}</p>}{screenPermissionResult && <p className="permission-message" role="status">{screenPermissionResult}</p>}
            {(browserPermissions.microphone === "denied" || browserPermissions.camera === "denied") && <p className="permission-help">If access is blocked, open this site’s permissions from the browser address bar, allow the device, then select Check again.</p>}
          </section> : <section aria-labelledby="security-title"><span className="eyebrow">ACCOUNT SECURITY</span><h3 id="security-title">Security</h3><p className="settings-intro">Update the password you use to sign in to GAMVerse.</p><button type="button" className="settings-menu-row security-password-action" onClick={() => { setAccountError(null); setChangePasswordOpen(true); }}><span><strong>Change password</strong><small>Choose a new sign-in password</small></span><span aria-hidden="true">›</span></button></section>}</div>
        </div>
      </section></div>}

      {changePasswordOpen && <div className="manager-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setChangePasswordOpen(false); }}><form className="manager-dialog password-dialog" onSubmit={(event) => void changePassword(event)}><button type="button" className="manager-close" aria-label="Close" onClick={() => setChangePasswordOpen(false)}>×</button><span className="eyebrow">ACCOUNT SECURITY</span><h2>Change password</h2><label>Current password<input type="password" autoComplete="current-password" required minLength={8} maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label>New password<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>{accountError && <p className="auth-error" role="alert">{accountError}</p>}<button className="lobby-button primary" disabled={lobbyBusy} type="submit">Update password</button></form></div>}

      {mapEditMode && <div className="map-edit-controls">
        <div className="map-edit-mode-bar"><div><span className="eyebrow">EDIT MAP · REAL WORLD</span><strong>{mapDimensions.width} × {mapDimensions.depth} m</strong><small>1 m grid · 10 m major lines</small></div>
          {mapZoneDrawing ? <><span className="map-edit-hint">Drag on the map to draw a zone</span><button type="button" className="lobby-button" onClick={() => setMapZoneDrawing(false)}>Cancel</button></> : <button type="button" className="lobby-button primary" onClick={() => { setSpawnPlacementMode(false); startMapZoneDrawing(); }}>＋ Create zone</button>}
          {!mapZoneDrawing && <button type="button" className="lobby-button" onClick={() => { setSpawnPlacementMode(false); setMapGeneratorOpen((open) => !open); setGeneratorError(null); }}>Generate layout</button>}
          {!mapZoneDrawing && <button type="button" className={`lobby-button${spawnPlacementMode ? " primary" : ""}`} disabled={mapSpawnSaving} title="Choose where new users start" onClick={() => { setMapZoneDrawing(false); setLobbyError(null); setSpawnPlacementMode((placing) => !placing); }}>{mapSpawnSaving ? "Saving spawn…" : spawnPlacementMode ? "Cancel spawn placement" : "◎ Set spawn"}</button>}
          {spawnPlacementMode && <span className="map-edit-hint">Click the map to move the spawn point</span>}
          {mapDraftDirty && <button type="button" className="lobby-button primary" disabled={mapSaving || Boolean(mapConflictLatest)} onClick={() => void saveMapDraft()}>{mapSaving ? "Saving map…" : "Save map"}</button>}
          <button type="button" className="lobby-button" onClick={exitMapEditMode}>{mapDraftDirty ? "Discard & exit" : "Exit edit mode"}</button>
        </div>
        {mapConflictLatest && <div className="map-edit-error map-edit-conflict" role="alert"><span>{mapConflictLatest.message} Your unsaved draft is preserved. Reloading the latest map will discard it.</span><button type="button" className="lobby-button" onClick={reloadLatestMapAfterConflict}>Discard draft & load latest</button></div>}
        {lobbyError && !mapConflictLatest && <p className="map-edit-error" role="alert">{lobbyError}</p>}
        {mapGeneratorOpen && <section className="map-layout-generator" aria-label="Generate office layout">
          <header><div><span className="eyebrow">CAMPUS PLANNER</span><strong>Generate office layout</strong></div><button type="button" className="icon-button" aria-label="Close generator" onClick={() => setMapGeneratorOpen(false)}>×</button></header>
          <div className="map-generator-fields">
            <label>Total people<input type="number" min="1" max="4000" step="1" value={generatorTotalPeople} onChange={(event) => setGeneratorTotalPeople(Number(event.target.value))} /></label>
            <label>People per team<input type="number" min="1" max="16" step="1" value={generatorPeoplePerTeam} onChange={(event) => setGeneratorPeoplePerTeam(Number(event.target.value))} /></label>
            <label>Number of teams<input type="number" min="1" max="250" step="1" value={generatorTeamCount} onChange={(event) => setGeneratorTeamCount(Number(event.target.value))} /></label>
          </div>
          <p className="map-zone-help">For 10 teams, each five-team band uses a 2–1–2 layout divided by two 8 m main roads. The plan gives each person a private 8 × 8 m room arranged 3 × 5. The Lobby on the left is the spawn point; Town Hall is centered between a small meeting room and the cafeteria, with four corner restrooms and two large meeting rooms. Generated furniture is replaced; manually placed props stay in place. Generate updates this draft; Save map stores the layout and props.</p>
          {generatorTotalPeople !== generatorPeoplePerTeam * generatorTeamCount && <p className="auth-error" role="alert">Total people must equal {generatorPeoplePerTeam} × {generatorTeamCount} = {generatorPeoplePerTeam * generatorTeamCount}.</p>}
          {generatorError && <p className="auth-error" role="alert">{generatorError}</p>}
          <footer><button type="button" className="lobby-button" onClick={() => setMapGeneratorOpen(false)}>Cancel</button><button type="button" className="lobby-button primary" disabled={generatorTotalPeople !== generatorPeoplePerTeam * generatorTeamCount} onClick={applyGeneratedCampusLayout}>Generate draft</button></footer>
        </section>}
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
          <label>Wall style<select value={mapZoneWallStyle} onChange={(event) => setMapZoneWallStyle(event.target.value as "geometry" | "asset")}><option value="geometry">Geometry wall</option><option value="asset">Asset model</option></select></label>
          {mapZoneWallStyle === "asset" && <><label>Wall model<select value={mapZoneWallAsset} onChange={(event) => setMapZoneWallAsset(event.target.value as (typeof ROOM_WALL_MODEL_ASSETS)[number])}>{ROOM_WALL_OPTION_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.items.map((item) => <option key={item.asset} value={item.asset}>{item.label}</option>)}</optgroup>)}</select></label>{ROOM_PROP_CATALOG.find((item) => item.asset === mapZoneWallAsset)?.preview && <img src={ROOM_PROP_CATALOG.find((item) => item.asset === mapZoneWallAsset)?.preview} alt={`${ROOM_PROP_CATALOG.find((item) => item.asset === mapZoneWallAsset)?.label ?? "Wall model"} preview`} style={{ width: "100%", height: 78, objectFit: "contain", borderRadius: 10, background: "rgba(255,255,255,.55)" }} />}</>}
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
          {!entrancesFit && <p className="auth-error" role="alert">{entrancesOverlap ? "Door positions overlap. Move them apart along the wall." : "The selected wall is too short for this many entrances. Choose fewer doors or draw a wider zone."}</p>}
          {mapZoneDraft && !mapZoneDraft.withinBounds && <p className="auth-error" role="alert">This zone is too close to the map edge. Move it inward so its walls stay inside the office.</p>}
          {zoneOverlapsExisting && <p className="auth-error" role="alert">This zone overlaps an existing room. Move it to an empty part of the map.</p>}
          {zoneEntranceIssue && <p className="auth-error" role="alert">This entrance has no clear path outside the room. Move the zone away from the map edge or nearby walls, or choose another door wall.</p>}
          <p className="map-zone-help">Walls and the selected entrance will be created around this grid area.</p>
          {lobbyError && <p className="auth-error" role="alert">{lobbyError}</p>}
          <footer><button type="button" className="lobby-button" onClick={() => { setMapZoneArea(null); setLobbyError(null); }}>Cancel</button><button type="button" className="lobby-button primary" disabled={!zoneCreationValid} onClick={saveMapZone}>Add to map draft</button></footer>
        </section>}
      </div>}

      <section className="touch-controls" aria-label="Touch movement controls">
        <TouchMoveButton label="Move forward" code="KeyW" heldKeysRef={heldKeysRef} disabled={appPaused}>↑</TouchMoveButton>
        <TouchMoveButton label="Move left" code="KeyA" heldKeysRef={heldKeysRef} disabled={appPaused}>←</TouchMoveButton>
        <TouchMoveButton label="Move backward" code="KeyS" heldKeysRef={heldKeysRef} disabled={appPaused}>↓</TouchMoveButton>
        <TouchMoveButton label="Move right" code="KeyD" heldKeysRef={heldKeysRef} disabled={appPaused}>→</TouchMoveButton>
      </section>

      {focusedVideoTile && videoPopupOpen && createPortal(
        <section className="video-popup" role="dialog" aria-modal="true" aria-label="Full-screen camera and screen share">
          <header className="video-popup-header"><div><span className="video-popup-live"><i /> LIVE MEDIA</span><strong>{focusedVideoTile.label}{focusedVideoTile.local ? " · You" : ""}</strong><small className="video-quality-target">{String(focusedVideoTile.track.source).toLowerCase().includes("screen") ? "Screen share: up to 1080p · 30 FPS" : "Camera: up to 720p · 30 FPS"} · depends on device and network</small></div><button type="button" className="video-popup-close" aria-label="Close full-screen media" title="Close full-screen media" onClick={() => setVideoPopupOpen(false)}><FeatherIcon name="close" size={21} /></button></header>
          <div className="video-popup-stage"><VideoTile key={focusedVideoTile.key} track={focusedVideoTile.track} label={focusedVideoTile.label} local={focusedVideoTile.local} focused onFocus={() => setFocusedVideoKey(focusedVideoTile.key)} /></div>
          {miniVideoTiles.length > 0 && <section className="video-mini-strip" aria-label="Camera and screen share previews"><div className="video-mini-strip-scroll">{miniVideoTiles.map((tile) => <VideoTile key={`mini:${tile.key}`} track={tile.track} label={tile.label} local={tile.local} focused={tile.key === focusedVideoTile.key} compact onFocus={() => setFocusedVideoKey(tile.key)} />)}</div></section>}
          <div className="video-popup-controls" aria-label="Media controls">
            <button type="button" disabled={!selectedVoiceConnected || appPaused} title={appPaused ? "Unavailable while the app is paused" : selectedMicMuted ? "Turn microphone on" : "Turn microphone off"} aria-label={selectedMicMuted ? "Turn microphone on" : "Turn microphone off"} onClick={() => void (meetingZoneActive ? toggleMeetingMute() : privateZoneId ? togglePrivateMute() : toggleProximityMute())}><FeatherIcon name={selectedMicMuted ? "micOff" : "mic"} /><span>{selectedMicMuted ? "Mic off" : "Mic on"}</span></button>
            <button type="button" className={cameraEnabled ? "active" : ""} disabled={!selectedVoiceConnected || appPaused} title={appPaused ? "Unavailable while the app is paused" : cameraEnabled ? "Turn camera off" : "Turn camera on"} aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"} onClick={() => void toggleCamera()}><FeatherIcon name={cameraEnabled ? "videoOff" : "video"} /><span>{cameraEnabled ? "Camera off" : "Camera"}</span></button>
            <button type="button" className={screenShareEnabled ? "active" : ""} disabled={!selectedVoiceConnected || appPaused} title={appPaused ? "Unavailable while the app is paused" : screenShareEnabled ? "Stop sharing screen" : "Share screen"} aria-label={screenShareEnabled ? "Stop sharing screen" : "Share screen"} onClick={() => void toggleScreenShare()}><FeatherIcon name="screen" /><span>{screenShareEnabled ? "Stop share" : "Share screen"}</span></button>
          </div>
        </section>,
        document.body,
      )}
      {videoTiles.length > 0 && !videoPopupOpen && <button type="button" className="video-popup-reopen" onClick={() => setVideoPopupOpen(true)}><FeatherIcon name="maximize" size={16} /> Show camera / screen</button>}

      <div className="bottom-dock" data-tutorial-target="office-toolbar" aria-label="Office controls">
        <button data-tutorial-target="office-microphone" type="button" className={`dock-button ${selectedVoiceConnected && !selectedMicMuted ? "active" : ""}`} disabled={!selectedVoiceConnected || appPaused} title={appPaused ? "Unavailable while the app is paused" : selectedVoiceConnected ? (selectedMicMuted ? "Turn microphone on" : "Turn microphone off") : "Voice connects automatically when you enter a voice zone"} aria-label={selectedMicMuted ? "Turn microphone on" : "Turn microphone off"} onClick={() => void (meetingZoneActive ? toggleMeetingMute() : privateZoneId ? togglePrivateMute() : toggleProximityMute())}><FeatherIcon name={selectedMicMuted ? "micOff" : "mic"} /></button>
        <button type="button" className={`dock-button ${cameraEnabled ? "active" : ""}`} disabled={!selectedVoiceConnected || appPaused} title={appPaused ? "Unavailable while the app is paused" : cameraEnabled ? "Turn camera off" : "Turn camera on"} aria-label={cameraEnabled ? "Turn camera off" : "Turn camera on"} onClick={() => void toggleCamera()}><FeatherIcon name={cameraEnabled ? "videoOff" : "video"} /></button>
        <button type="button" className={`dock-button ${screenShareEnabled ? "active" : ""}`} disabled={!selectedVoiceConnected || appPaused} title={appPaused ? "Unavailable while the app is paused" : screenShareEnabled ? "Stop sharing screen" : "Share screen"} aria-label={screenShareEnabled ? "Stop sharing screen" : "Share screen"} onClick={() => void toggleScreenShare()}><FeatherIcon name="screen" /></button>
        <button type="button" className={`dock-button ${userStatus === "do-not-disturb" || userStatus === "in-meeting" ? "active" : ""}`} aria-pressed={userStatus === "do-not-disturb" || userStatus === "in-meeting"} title={userStatus === "do-not-disturb" || userStatus === "in-meeting" ? "Headphones off · click to set Available" : "Headphones on · click to turn on Do not disturb"} aria-label={userStatus === "do-not-disturb" || userStatus === "in-meeting" ? "Turn headphones on" : "Turn headphones off"} onClick={toggleHeadphones}><FeatherIcon name={userStatus === "do-not-disturb" || userStatus === "in-meeting" ? "headphonesOff" : "headphones"} /></button>
        <span className="dock-separator" />
        <div className="user-status-dock-control">
          <button type="button" className={`dock-button user-status-trigger${userStatusMenuOpen ? " active" : ""}`} aria-label={`Your status: ${userStatusOptions.find((item) => item.value === userStatus)?.label ?? "Available"}`} title={`Status · ${userStatusOptions.find((item) => item.value === userStatus)?.label ?? "Available"}`} aria-haspopup="menu" aria-expanded={userStatusMenuOpen} onClick={() => setUserStatusMenuOpen((open) => !open)}>
            <span className={`user-status-dot status-${userStatus}`} aria-hidden="true">{userStatusOptions.find((item) => item.value === userStatus)?.icon ?? "✓"}</span>
          </button>
          {userStatusMenuOpen && <div className="user-status-menu" role="menu" aria-label="Set your status">
            <span className="user-status-menu-heading">YOUR STATUS</span>
            {userStatusOptions.map((option) => <button key={option.value} type="button" role="menuitemradio" aria-checked={userStatus === option.value} className={`user-status-option${userStatus === option.value ? " is-selected" : ""}`} onClick={() => selectUserStatus(option.value)}>
              <span className={`user-status-dot status-${option.value}`} aria-hidden="true">{option.icon}</span><span>{option.label}</span>{userStatus === option.value && <span className="user-status-check" aria-hidden="true">✓</span>}
            </button>)}
          </div>}
        </div>
        <span className="dock-separator" />
          <button type="button" className="leave-button" title="Leave office" aria-label="Leave office" onClick={() => {
            intentionalLeaveRef.current = true;
            meetingZoneActiveRef.current = false;
            const room = roomRef.current;
            roomRef.current = null;
            clearSelectedOffice();
            leaveMeetingVoice();
            leaveProximityVoice();
            leavePrivateVoice();
            proximityGroupIdRef.current = null;
            setProximityGroupId(null);
            void room?.leave();
          }}><FeatherIcon name="exit" /></button>
      </div>

      {userStatus !== "available" && <div className="status-pause-overlay" role="dialog" aria-modal="true" aria-label={`Status: ${userStatusOptions.find((item) => item.value === userStatus)?.label ?? userStatus}`}>
        <section className="status-pause-card">
          <span className={`user-status-dot status-${userStatus}`} aria-hidden="true">{userStatusOptions.find((item) => item.value === userStatus)?.icon}</span>
          <span className="eyebrow">YOUR STATUS</span>
          <h2>{userStatusOptions.find((item) => item.value === userStatus)?.label ?? userStatus}</h2>
          {userStatus === "toilet" && <p>{statusTravelError ?? "Traveling to the restroom. Choose Available when you’re back."}</p>}
          {(userStatus === "do-not-disturb" || userStatus === "in-meeting") && <p>The office is paused while this status is active.</p>}
          <button type="button" className="status-return-button" onClick={() => selectUserStatus("available")}>Back to Available</button>
          <button type="button" className="status-dropdown-toggle" aria-expanded={statusMenuOverlayOpen} onClick={() => setStatusMenuOverlayOpen((open) => !open)}>{statusMenuOverlayOpen ? "Choose another status" : "Change status"}</button>
          {statusMenuOverlayOpen && <label className="status-overlay-select-label">Set status<select value={userStatus} onChange={(event) => selectUserStatus(event.target.value as UserStatus)}>{userStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
        </section>
      </div>}

      {(meetingZoneId || privateZoneId || selectedDeskZoneId) && <div className="zone-access-control" role="group" aria-label={`${activeDeskZoneLabel ?? mediaZoneName ?? "Desk"} access settings`}>
        <span><strong>{activeDeskZoneLabel ?? mediaZoneName ?? "Zone"}</strong><small>{zoneAccessDetail}</small></span>
        {activeDeskZone && !activeDeskZone.ownerUsername && !userOwnsAnotherDesk && <button type="button" disabled={deskClaimBusy} onClick={() => void claimDeskZone(activeDeskZone.id)}>{deskClaimBusy && deskClaimingZoneId === activeDeskZone.id ? "Claiming…" : "Claim desk"}</button>}
        {activeDeskZone && !activeDeskZone.ownerUsername && userOwnsAnotherDesk && <small className="desk-claim-limit">You already own a desk.</small>}
        {zoneLockTargetId && <button type="button" className={`zone-lock-button${lockedZoneIds.includes(zoneLockTargetId) ? " is-locked" : ""}`} aria-label={lockedZoneIds.includes(zoneLockTargetId) ? "Unlock room" : "Lock room"} aria-pressed={lockedZoneIds.includes(zoneLockTargetId)} title={lockedZoneIds.includes(zoneLockTargetId) ? "Unlock room" : "Lock room"} onClick={() => roomRef.current?.send("zone-lock", { zoneId: zoneLockTargetId, locked: !lockedZoneIds.includes(zoneLockTargetId) })}>
          <FeatherIcon name={lockedZoneIds.includes(zoneLockTargetId) ? "unlock" : "lock"} size={24} />
        </button>}
        {canManageCurrentDesk && activeDeskZone && <button type="button" disabled={deskClaimBusy} onClick={() => void unclaimDeskZone(activeDeskZone.id)}>{deskClaimBusy && deskClaimingZoneId === activeDeskZone.id ? "Unclaiming…" : "Unclaim"}</button>}
        {activeDeskZone && deskClaimError && <small className="desk-claim-error" role="alert">{deskClaimError}</small>}
      </div>}

      {autoMoveNotice && <div className="auto-move-toast" role="status">{autoMoveNotice}</div>}

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
      <p className="screen-reader-only">Use W, A, S, and D or arrow keys to move. Hold Shift while moving to run. Double-click the ground to travel automatically by a randomly selected vehicle. The camera stays focused on your character.</p>
      {modifyPropsOpen && officeMapLayout && <ModifyPropsEditor open={modifyPropsOpen} officeName={activeOffice.name} dimension={{ width: mapDimensions.width, depth: mapDimensions.depth, gridSize: 1 }} props={modifyPropsDraft} selectedPropId={selectedModifyPropId} placingAsset={selectedModifyPropAsset} error={modifyPropsError} onDraftChange={setModifyPropsDraft} onRequestPlacement={(asset) => setSelectedModifyPropAsset(asset as RoomLayoutProp["asset"] | null)} onSelectProp={setSelectedModifyPropId} onRotateProp={rotateOfficeProp} onSave={saveModifyProps} onCancel={() => { setModifyPropsOpen(false); setSelectedModifyPropAsset(null); setSelectedModifyPropId(null); setModifyPropsError(null); }} />}
      {modifyPropsBusy && <FullScreenLoading label="Loading office props…" />}
    </main>
  );
}


