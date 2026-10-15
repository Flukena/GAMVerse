import type { ConversationKind, ConversationSnapshot, SpatialMediaTokenRequest, ConversationTokenMode } from "@gammyverse/shared";
import { zoneMediaReady, type ZoneMediaDescriptor } from "./zoneMediaDescriptor.js";
export class ConversationAuthorizationError extends Error {}
export class ConversationMediaUnavailableError extends Error {}
export type CanonicalConversationMediaGrant = { snapshot: ConversationSnapshot; descriptor: ZoneMediaDescriptor | null };
interface GrantDependencies<T> {
  role(): Promise<string | null>;
  current(): CanonicalConversationMediaGrant | null | Promise<CanonicalConversationMediaGrant | null>;
  mint(targetId: string, mode: ConversationTokenMode, descriptor: ZoneMediaDescriptor | null): Promise<T>;
}
const ACCESS_DENIED_LABEL = "Office access denied.";
const ACCESS_CHANGED_LABEL = "Conversation access changed.";
const MEDIA_UNAVAILABLE_LABEL = "Conversation media is temporarily unavailable.";
function binding(grant: CanonicalConversationMediaGrant): string {
  const { snapshot, descriptor } = grant;
  const conversation = snapshot.conversation;
  return JSON.stringify([snapshot.roomIncarnationId, conversation?.id, conversation?.kind, conversation?.mediaTarget,
    descriptor && [descriptor.generation, descriptor.epoch, descriptor.roomName, descriptor.state, descriptor.available]]);
}
function matches(snapshot: ConversationSnapshot, kind: ConversationKind, request: SpatialMediaTokenRequest): boolean {
  const conversation = snapshot.conversation;
  if (!conversation || snapshot.officeId !== request.officeId || conversation.kind !== kind) return false;
  const requestedTarget = kind === "meeting" ? request.roomKey : kind === "private" ? request.zoneId : undefined;
  if (kind !== "proximity" && requestedTarget !== conversation.mediaTarget.id) return false;
  return request.conversationId === undefined || (request.conversationId === conversation.id && request.conversationGeneration === conversation.mediaTarget.generation && request.roomIncarnationId === snapshot.roomIncarnationId);
}
function readyGrant(grant: CanonicalConversationMediaGrant | null, kind: ConversationKind, request: SpatialMediaTokenRequest): CanonicalConversationMediaGrant {
  if (!grant || !matches(grant.snapshot, kind, request)) throw new ConversationAuthorizationError(ACCESS_CHANGED_LABEL);
  const conversation = grant.snapshot.conversation!;
  if (kind === "proximity") return grant;
  const descriptor = grant.descriptor;
  if (!descriptor || descriptor.officeId !== grant.snapshot.officeId || descriptor.roomIncarnationId !== grant.snapshot.roomIncarnationId
    || descriptor.zoneId !== conversation.mediaTarget.id || descriptor.kind !== kind) throw new ConversationAuthorizationError(ACCESS_CHANGED_LABEL);
  if (conversation.mediaTarget.available === false || !zoneMediaReady(descriptor)) throw new ConversationMediaUnavailableError(MEDIA_UNAVAILABLE_LABEL);
  return grant;
}
export async function mintConversationGrant<T>(kind: ConversationKind, request: SpatialMediaTokenRequest, dependencies: GrantDependencies<T>) {
  if (!(await dependencies.role())) throw new ConversationAuthorizationError(ACCESS_DENIED_LABEL);
  const grant = readyGrant(await dependencies.current(), kind, request);
  const initialBinding = binding(grant);
  const conversation = grant.snapshot.conversation!;
  const token = await dependencies.mint(conversation.mediaTarget.id, request.mode ?? "join", grant.descriptor);
  const role = await dependencies.role();
  const current = readyGrant(await dependencies.current(), kind, request);
  if (!role || binding(current) !== initialBinding) throw new ConversationAuthorizationError(ACCESS_CHANGED_LABEL);
  return { token, conversation };
}
