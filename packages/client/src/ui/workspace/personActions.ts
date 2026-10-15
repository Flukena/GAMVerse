import { availabilityPolicy, type UserStatus } from "@gammyverse/shared";
import { MEET_AVAILABILITY_BLOCKED_LABEL } from "../conversations/meetOfferState";
import type { DirectoryEntry } from "./peopleDirectory";

export type PersonActionId = "message" | "goTo" | "locate" | "follow" | "wave" | "spotlight" | "meet" | "inviteToJoin";
export type PersonAction = { id: PersonActionId; label: string; disabled: boolean; pressed?: boolean; disabledReason?: string };
export type PersonActionContext = {
  localSessionId: string | null;
  localUsername?: string;
  followingSessionId: string | null;
  spotlightUsernames: readonly string[];
  canSpotlight: boolean;
  disabled: boolean;
  canMeet?: boolean;
  localStatus?: UserStatus;
  meetPending?: boolean;
};
export type PersonActionCallbacks = {
  onMessage(username: string): void;
  onGoTo(sessionId: string): void;
  onLocate(sessionId: string): void;
  onFollow(sessionId: string): void;
  onWave(sessionId: string): void;
  onSpotlight(username: string): void;
  onMeet?(sessionId: string): void;
  onInviteToJoin?(sessionId: string): void;
};

const ACTION_LABELS: Record<PersonActionId, string> = {
  message: "Message", goTo: "Go to", locate: "Locate", follow: "Follow", wave: "Wave", spotlight: "Spotlight", meet: "Meet", inviteToJoin: "Invite to join me",
};
const STOP_FOLLOWING_LABEL = "Stop following";
const STOP_SPOTLIGHT_LABEL = "Stop spotlight";

export function buildPersonActions([sessionId, person]: DirectoryEntry, context: PersonActionContext): PersonAction[] {
  const isSelf = sessionId === context.localSessionId || person.username === context.localUsername;
  const disabled = context.disabled || person.presence !== "online";
  const following = context.followingSessionId === sessionId;
  const spotlighted = context.spotlightUsernames.includes(person.username);
  const actions: PersonAction[] = isSelf ? [] : [
    { id: "message", label: ACTION_LABELS.message, disabled: context.disabled },
    { id: "goTo", label: ACTION_LABELS.goTo, disabled },
    { id: "locate", label: ACTION_LABELS.locate, disabled },
    { id: "follow", label: following ? STOP_FOLLOWING_LABEL : ACTION_LABELS.follow, disabled, pressed: following },
    { id: "wave", label: ACTION_LABELS.wave, disabled },
  ];
  if (!isSelf && context.canMeet) actions.push(...buildMeetActions(person.status, context, disabled));
  if (context.canSpotlight) actions.push({ id: "spotlight", label: spotlighted ? STOP_SPOTLIGHT_LABEL : ACTION_LABELS.spotlight, disabled, pressed: spotlighted });
  return actions;
}

function buildMeetActions(targetStatus: UserStatus, context: PersonActionContext, unavailable: boolean): PersonAction[] {
  const suppressed = availabilityPolicy(targetStatus).suppressInterruptions || availabilityPolicy(context.localStatus ?? "available").suppressInterruptions;
  const disabled = unavailable || Boolean(context.meetPending) || suppressed;
  const disabledReason = suppressed ? MEET_AVAILABILITY_BLOCKED_LABEL : undefined;
  return [{ id: "meet", label: ACTION_LABELS.meet, disabled, disabledReason }, { id: "inviteToJoin", label: ACTION_LABELS.inviteToJoin, disabled, disabledReason }];
}

export function runPersonAction(action: PersonAction, entry: DirectoryEntry, callbacks: PersonActionCallbacks): void {
  if (action.disabled) return;
  const [sessionId, person] = entry;
  const handlers: Record<PersonActionId, () => void> = {
    message: () => callbacks.onMessage(person.username), goTo: () => callbacks.onGoTo(sessionId),
    locate: () => callbacks.onLocate(sessionId), follow: () => callbacks.onFollow(sessionId),
    wave: () => callbacks.onWave(sessionId), spotlight: () => callbacks.onSpotlight(person.username),
    meet: () => callbacks.onMeet?.(sessionId), inviteToJoin: () => callbacks.onInviteToJoin?.(sessionId),
  };
  handlers[action.id]();
}
