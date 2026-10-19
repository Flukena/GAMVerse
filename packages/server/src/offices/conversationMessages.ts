import { CONVERSATION_SNAPSHOT_EVENT, CONVERSATION_SNAPSHOT_REQUEST_EVENT, isConversationSnapshotRequest, type ConversationSnapshot } from "@gammyverse/shared";
interface ConversationClient { sessionId: string; send(type: string, payload: ConversationSnapshot): void }
interface ConversationRoom { onMessage(type: string, handler: (client: ConversationClient, payload: unknown) => void): unknown }
export function registerConversationMessages(room: ConversationRoom, snapshots: { snapshot(sessionId: string): ConversationSnapshot }) {
  room.onMessage(CONVERSATION_SNAPSHOT_REQUEST_EVENT, (client, payload) => {
    if (isConversationSnapshotRequest(payload)) client.send(CONVERSATION_SNAPSHOT_EVENT, snapshots.snapshot(client.sessionId));
  });
}
