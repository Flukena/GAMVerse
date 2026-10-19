import { spotlightAfterRoomChange } from "./socialState";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  CHAT_BUBBLE_MS,
  REACTION_EMOJIS,
  REACTION_FLOAT_MS,
  nearestInteractiveProp,
  type RoomLayout,
  type PropInteraction,
} from "@gammyverse/shared";
import type { SpotlightRequest } from "@gammyverse/shared";
import type { ChatMessage, ChatTransport } from "./ChatPanel";
import type { Map2dDecoration } from "../../world/map2d/map2dDynamicLayer";
import { playSocialNotificationSound } from "../../audio/notificationSounds";

interface SocialPlayer {
  x: number;
  z: number;
  username: string;
  handRaised?: boolean;
}
interface SocialInputs {
  officeId: string | null;
  room: ChatTransport | null;
  playersRef: MutableRefObject<Map<string, SocialPlayer>>;
  localSessionId: string | null;
  layout: RoomLayout | null;
  heldKeys: Set<string>;
  paused: boolean;
}
const SOCIAL_WORLD_SELECTOR = ".world-canvas";
const SOCIAL_WORLD_FOCUS_SELECTOR = ".world-canvas canvas";
const SOCIAL_INTERACTION_CHECK_INTERVAL_MS = 200;
const REACTION_QUICK_KEYS = [
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
];
export function useOfficeSocial({
  officeId,
  room,
  playersRef,
  localSessionId,
  layout,
  heldKeys,
  paused,
}: SocialInputs) {
  const spotlightOfficeRef = useRef(officeId);
  const spotlightRequestIds = useRef(new Set<string>());
  const decorationsRef = useRef<Map2dDecoration[]>([]);
  const [spotlight, setSpotlight] = useState<{
    usernames: string[];
    epoch: string;
  }>({ usernames: [], epoch: "" });
  const [spotlightRequests, setSpotlightRequests] = useState<{ incoming: SpotlightRequest[]; outgoing: SpotlightRequest[] }>({ incoming: [], outgoing: [] });
  const [spotlightCommandError, setSpotlightCommandError] = useState<string | null>(null);
  const [interaction, setInteraction] = useState<PropInteraction | null>(null);
  const [nearestTitle, setNearestTitle] = useState<string | null>(null);
  const nearbyMessage = useCallback((message: ChatMessage) => {
    decorationsRef.current.push({
      sessionId: message.sessionId,
      text: message.text,
      expiresAtMs: performance.now() + CHAT_BUBBLE_MS,
    });
  }, []);
  useEffect(() => {
    const previousOfficeId = spotlightOfficeRef.current;
    spotlightOfficeRef.current = officeId;
    setSpotlight((current) =>
      spotlightAfterRoomChange(current, previousOfficeId, officeId),
    );
    if (previousOfficeId !== officeId) {
      setSpotlightRequests({ incoming: [], outgoing: [] });
      spotlightRequestIds.current.clear();
    }
    setInteraction(null);
    decorationsRef.current = [];
    if (!room) return;
    const removeReaction = room.onMessage(
      "reaction",
      (message: { sessionId: string; emoji: string }) =>
        decorationsRef.current.push({
          sessionId: message.sessionId,
          text: message.emoji,
          expiresAtMs: performance.now() + REACTION_FLOAT_MS,
        }),
    );
    const removeSpotlight = room.onMessage(
      "spotlight-state",
      (state: { usernames: string[]; epoch: string }) => setSpotlight(state),
    );
    const removeSpotlightRequests = room.onMessage("spotlight-requests", (state: { incoming: SpotlightRequest[]; outgoing: SpotlightRequest[] }) => {
      const incomingIds = new Set(state.incoming.map(request => request.id));
      if (state.incoming.some(request => !spotlightRequestIds.current.has(request.id))) playSocialNotificationSound("spotlight");
      spotlightRequestIds.current = incomingIds;
      setSpotlightRequests(state);
      setSpotlightCommandError(null);
    });
    const removeSpotlightError = room.onMessage("spotlight-error", (payload: unknown) => {
      const error = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : "Spotlight request failed.";
      setSpotlightCommandError(error);
    });
    room.send("spotlight-sync", {});
    room.send("request-spatial-state", {});
    return () => {
      removeReaction();
      removeSpotlight();
      removeSpotlightRequests();
      removeSpotlightError();
      decorationsRef.current = [];
    };
  }, [room, officeId]);
  useEffect(() => {
    const updateNearest = () => {
      decorationsRef.current = decorationsRef.current.filter(
        (item) => item.expiresAtMs > performance.now(),
      );
      const player = localSessionId
        ? playersRef.current.get(localSessionId)
        : undefined;
      setNearestTitle(
        player && layout
          ? (nearestInteractiveProp(layout.props, player)?.interaction?.title ??
              null)
          : null,
      );
    };
    const interval = setInterval(
      updateNearest,
      SOCIAL_INTERACTION_CHECK_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, [localSessionId, layout, playersRef]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        paused ||
        interaction ||
        event.repeat ||
        !(event.target instanceof HTMLElement) ||
        !event.target.closest(SOCIAL_WORLD_SELECTOR)
      )
        return;
      const index = REACTION_QUICK_KEYS.indexOf(event.code);
      if (index >= 0) {
        room?.send("reaction", { emoji: REACTION_EMOJIS[index] });
        return;
      }
      if (event.code !== "KeyX" || !layout || !localSessionId) return;
      const player = playersRef.current.get(localSessionId);
      const nearest = player
        ? nearestInteractiveProp(layout.props, player)
        : null;
      if (!nearest?.interaction) return;
      event.preventDefault();
      heldKeys.clear();
      setInteraction(nearest.interaction);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [room, paused, interaction, layout, localSessionId, playersRef, heldKeys]);
  const closeInteraction = () => {
    setInteraction(null);
    document
      .querySelectorAll<HTMLCanvasElement>(SOCIAL_WORLD_FOCUS_SELECTOR)
      .forEach((canvas) => {
        if (canvas.style.display !== "none") canvas.focus();
      });
  };
  return {
    decorationsRef,
    spotlight,
    spotlightRequests,
    spotlightCommandError,
    interaction,
    nearestTitle,
    nearbyMessage,
    closeInteraction,
  };
}
