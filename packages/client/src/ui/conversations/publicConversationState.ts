import { isPublicConversationsSnapshot, type PublicConversationsSnapshot } from "@gammyverse/shared";

export class PublicConversationState {
  snapshot: PublicConversationsSnapshot | null = null;
  constructor(readonly officeId: string, readonly roomIncarnationId?: string) {}
  receive(payload: unknown): boolean {
    if (!isPublicConversationsSnapshot(payload) || payload.officeId !== this.officeId) return false;
    const incarnation = this.roomIncarnationId ?? this.snapshot?.roomIncarnationId;
    if (incarnation && payload.roomIncarnationId !== incarnation) return false;
    if (this.snapshot && payload.revision <= this.snapshot.revision) return false;
    this.snapshot = payload;
    return true;
  }
}
