import {
  isValidReaction,
  type PlayerState,
} from "@gammyverse/shared";
import type { SpotlightRequest } from "@gammyverse/shared";
import { OfficeChat, type ChatPerson } from "./chat.js";
import { persistChatMessage } from "./chatRepository.js";
import { getOfficeRole } from "./repository.js";
import { Spotlight } from "./spotlight.js";
import { ReactionGate } from "./reactions.js";
import { revokeSpotlightParticipant } from "../media/service.js";
import { logServerError } from "../infra/logger.js";
const CHAT_SEND_FAILED_LABEL = "Chat could not be sent.";
const SPOTLIGHT_COMMAND_FAILED_LABEL = "Spotlight command failed.";
export { HAND_RAISE_MAX_DURATION_MS } from "./handRaiseLifetime.js";

type Client = {
  sessionId: string;
  send: (event: string, payload: unknown) => void;
};
type SocialRoom = {
  state: {
    spotlightUsernames: Map<string, boolean>;
    spotlightEpoch: string;
  };
  onMessage: (
    event: string,
    handler: (client: Client, payload: unknown) => void,
  ) => void;
  broadcast: (event: string, payload: unknown) => void;
};
type SpotlightRequestSnapshot = { incoming: SpotlightRequest[]; outgoing: SpotlightRequest[] };
type SocialState = {
  username: (id: string) => string | undefined;
  player: (id: string) => PlayerState | undefined;
  people: () => ChatPerson[];
  client: (id: string) => Client | undefined;
};
type OfficeSocial = {
  states: Map<SocialRoom, SocialState>;
  spotlight: Spotlight;
  chat: OfficeChat;
  reactions: ReactionGate;
};
const offices = new Map<string, OfficeSocial>();
function sendSpotlightState(
  room: SocialRoom,
  snapshot: {
    usernames: string[];
    epoch: string;
  },
) {
  room.state.spotlightUsernames.clear();
  for (const username of snapshot.usernames)
    room.state.spotlightUsernames.set(username, true);
  room.state.spotlightEpoch = snapshot.epoch;
  room.broadcast("spotlight-state", snapshot);
}
function sendSpotlightRequests(states: ReadonlyMap<SocialRoom, SocialState>, username: string, snapshot: SpotlightRequestSnapshot) {
  for (const state of states.values())
    for (const person of state.people())
      if (person.username === username) state.client(person.sessionId)?.send("spotlight-requests", snapshot);
}
function officeSocial(officeId: string) {
  const existing = offices.get(officeId);
  if (existing) return existing;
  const states = new Map<SocialRoom, SocialState>();
  const spotlight = new Spotlight(officeId, {
    role: (username) => getOfficeRole(username, officeId),
    revoke: revokeSpotlightParticipant,
    changed: (snapshot) => {
      for (const room of states.keys()) sendSpotlightState(room, snapshot);
    },
    requestsChanged: (username, snapshot) => sendSpotlightRequests(states, username, snapshot),
  });
  const chat = new OfficeChat(officeId, {
    role: (username) => getOfficeRole(username, officeId),
    persist: persistChatMessage,
    people: () => [...states.values()].flatMap((state) => state.people()),
    deliver: (id, message) => {
      for (const state of states.values())
        state.client(id)?.send("chat-message", message);
    },
  });
  const social = { states, spotlight, chat, reactions: new ReactionGate() };
  offices.set(officeId, social);
  return social;
}
function registerChat(room: SocialRoom, state: SocialState, chat: OfficeChat) {
  room.onMessage("chat", (client, payload) => {
    const username = state.username(client.sessionId);
    if (username)
      void chat
        .send(client.sessionId, username, payload)
        .catch(() =>
          client.send("chat-error", { error: CHAT_SEND_FAILED_LABEL }),
        );
  });
}
function registerReactions(
  room: SocialRoom,
  state: SocialState,
  social: OfficeSocial,
) {
  room.onMessage("reaction", (client, payload) => {
    if (
      !state.player(client.sessionId) ||
      !isValidReaction(payload) ||
      !social.reactions.accept(client.sessionId)
    )
      return;
    for (const target of social.states.keys())
      target.broadcast("reaction", {
        sessionId: client.sessionId,
        emoji: payload.emoji,
      });
  });
}
export function registerSocialMessages(
  room: SocialRoom,
  officeId: string,
  state: SocialState,
) {
  const social = officeSocial(officeId);
  social.states.set(room, state);
  sendSpotlightState(room, social.spotlight.snapshot());
  for (const person of state.people())
    if (person.username) state.client(person.sessionId)?.send("spotlight-requests", social.spotlight.requestSnapshot(person.username));
  registerChat(room, state, social.chat);
  registerReactions(room, state, social);
  room.onMessage("spotlight", (client, payload) => {
    const username = state.username(client.sessionId);
    if (username)
      void social.spotlight.command(username, payload).catch(() =>
        client.send("spotlight-error", {
          error: SPOTLIGHT_COMMAND_FAILED_LABEL,
        }),
      );
  });
  room.onMessage("spotlight-sync", (client) => {
    const username = state.username(client.sessionId);
    if (username) client.send("spotlight-requests", social.spotlight.requestSnapshot(username));
  });
  return social.spotlight;
}
export function unregisterSocialMessages(room: SocialRoom, officeId: string, rotateOnFinalDispose = true) {
  const social = offices.get(officeId);
  if (!social) return;
  social.states.delete(room);
  if (social.states.size > 0) return;
  offices.delete(officeId);
  if (!rotateOnFinalDispose) return;
  void social.spotlight
    .close()
    .catch((error) =>
      logServerError("realtime", "spotlight.close.failed", error, { officeId }),
    );
}

export function socialPeople(
  players: Iterable<[string, PlayerState]>,
  zones: Map<string, { id: string }>,
  groups: Map<string, string>,
  admittedZoneSessions?: ReadonlySet<string>,
) {
  const people: ChatPerson[] = [];
  for (const [sessionId, player] of players) {
    if (player.presence !== "online") continue;
    const zone = zones.get(sessionId);
    const group = groups.get(sessionId);
    let channel = ["solo", sessionId];
    if (zone && (!admittedZoneSessions || admittedZoneSessions.has(sessionId))) channel = ["zone", zone.id];
    else if(zone) channel = ["solo",sessionId];
    else if (group) channel = ["proximity", group];
    people.push({
      sessionId,
      username: player.username,
      channel: JSON.stringify(channel),
    });
  }
  return people;
}
