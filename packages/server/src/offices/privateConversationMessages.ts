import { PRIVATE_ZONE_ACCESS_REQUEST_EVENT, PRIVATE_ZONE_COMMAND_EVENT } from "@gammyverse/shared";
import type { PrivateConversations, PrivateAccessEvent } from "./privateConversations.js";
type PrivateClient = {
  sessionId: string;
  send(event: string, payload: unknown): void;
};
type PrivateRoom = {
  clients: readonly PrivateClient[];
  onMessage(event: string, handler: (client: PrivateClient, payload: unknown) => void): unknown;
};
export function deliverPrivateAccessEvents(room: Pick<PrivateRoom, "clients">, events: PrivateAccessEvent[]) {
  for (const event of events)
    room.clients.find(client => client.sessionId === event.sessionId)?.send(event.event, event.payload);
}
export function registerPrivateConversationMessages(room: PrivateRoom, conversations: PrivateConversations) {
  room.onMessage(PRIVATE_ZONE_ACCESS_REQUEST_EVENT, (client, payload) => { void conversations.request(client.sessionId, payload).then(events => deliverPrivateAccessEvents(room, events)); });
  room.onMessage("zone-lock", (client, payload) => { void conversations.legacyLock(client.sessionId, payload).then(events => deliverPrivateAccessEvents(room, events)); });
  room.onMessage(PRIVATE_ZONE_COMMAND_EVENT, (client, payload) => { void conversations.command(client.sessionId, payload).then(events => deliverPrivateAccessEvents(room, events)); });
}
