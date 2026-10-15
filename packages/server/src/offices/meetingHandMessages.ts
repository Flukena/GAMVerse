import { MEETING_HAND_COMMAND_EVENT, MEETING_HANDS_REQUEST_EVENT } from "@gammyverse/shared";
import type { MeetingHandCoordinator, MeetingHandEvent } from "./meetingHandCoordinator.js";

type HandClient = { sessionId: string; send(event: string, payload: unknown): void };
type HandRoom = {
  clients: readonly HandClient[];
  onMessage(event: string, handler: (client: HandClient, payload: unknown) => void): unknown;
};

export function deliverMeetingHandEvents(room: Pick<HandRoom, "clients">, events: MeetingHandEvent[]) {
  for (const event of events) room.clients.find(client => client.sessionId === event.sessionId)?.send(event.event, event.payload);
}

export function registerMeetingHandMessages(room: HandRoom, hands: MeetingHandCoordinator) {
  room.onMessage(MEETING_HANDS_REQUEST_EVENT, (client, payload) => {
    void hands.request(client.sessionId, payload).then(events => deliverMeetingHandEvents(room, events));
  });
  room.onMessage(MEETING_HAND_COMMAND_EVENT, (client, payload) => {
    void hands.command(client.sessionId, payload).then(events => deliverMeetingHandEvents(room, events));
  });
  room.onMessage("hand-raise", (client, payload) => {
    void hands.legacy(client.sessionId, payload).then(events => deliverMeetingHandEvents(room, events));
  });
}
