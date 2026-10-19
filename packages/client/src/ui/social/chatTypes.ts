export interface ChatMessage {
  id: string;
  officeId: string;
  scope: "nearby" | "office" | "dm";
  senderUsername: string;
  recipientUsername?: string;
  text: string;
  createdAt: string;
  sessionId: string;
}
export interface ChatTransport {
  send(type: string, payload: unknown): void;
  onMessage(type: string, callback: (message: never) => void): () => void;
}
