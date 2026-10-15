import {
  effectiveAvailability, isValidUserStatusCommand, isValidStatusRequestId,
  type AvailabilityProfile, type PlayerState, type UserStatus, type UserStatusCommand,
} from "@gammyverse/shared";
import { AvailabilityRepository } from "./availabilityRepository.js";

const STATUS_SAVE_FAILED_LABEL = "Could not save your availability. Try again.";
const STATUS_INVALID_LABEL = "Invalid availability or custom status.";
const STATUS_EXPIRY_CHECK_INTERVAL_MS = 1000;
export const STATUS_UPDATE_MIN_INTERVAL_MS = 500;
const STATUS_UPDATE_PENDING_LABEL = "Availability update is busy. Try again shortly.";
export type AvailabilityClient = { sessionId: string; send(event: string, payload: unknown): void };
export type AvailabilityRoom = {
  onMessage(event: string, handler: (client: AvailabilityClient, payload: unknown) => void): unknown;
  broadcast(event: string, payload: unknown): void;
};
export type AvailabilityState = {
  username(sessionId: string): string | undefined;
  player(sessionId: string): PlayerState | undefined;
  sessions(): Iterable<string>;
  maintainer(sessionId: string): boolean;
};
export type AvailabilityStore = Pick<AvailabilityRepository, "load" | "save">;
export function playerAvailability(player: PlayerState): AvailabilityProfile {
  return {
    status: player.status as UserStatus,
    customStatus: player.customStatusText || player.customStatusEmoji ? {
      text: player.customStatusText, emoji: player.customStatusEmoji, expiresAtMs: player.customStatusExpiresAtMs || null,
    } : null,
  };
}
export function applyPlayerAvailability(player: PlayerState, profile: AvailabilityProfile) {
  player.status = profile.status;
  player.customStatusText = profile.customStatus?.text ?? "";
  player.customStatusEmoji = profile.customStatus?.emoji ?? "";
  player.customStatusExpiresAtMs = profile.customStatus?.expiresAtMs ?? 0;
}
function statusRequestId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value: unknown = Reflect.get(payload, "requestId");
  return isValidStatusRequestId(value) ? value : undefined;
}
export class AvailabilityMessages {
  private readonly queues = new Map<string, Promise<unknown>>();
  private disposed = false;
  private readonly pendingUsernames = new Set<string>();
  private readonly lastAcceptedAtBySessionId = new Map<string, number>();
  constructor(private readonly officeId: string, private readonly room: AvailabilityRoom,
    private readonly state: AvailabilityState, private readonly store: AvailabilityStore = new AvailabilityRepository(), private readonly nowMs: () => number = Date.now) {}
  private enqueue<T>(username: string, action: () => Promise<T>): Promise<T> {
    const pending = this.queues.get(username) ?? Promise.resolve();
    const result = pending.then(action, action);
    this.queues.set(username, result);
    const cleanup = () => { if (this.queues.get(username) === result) this.queues.delete(username); };
    void result.then(cleanup, cleanup);
    return result;
  }
  load(username: string, maintainer: boolean) {
    return this.enqueue(username, () => this.store.load(username, this.officeId, maintainer));
  }
  async command(client: AvailabilityClient, payload: unknown): Promise<void> {
    const nowMs = this.nowMs();
    const requestId = statusRequestId(payload);
    if (!isValidUserStatusCommand(payload, nowMs)) { this.error(client, STATUS_INVALID_LABEL, requestId); return; }
    const username = this.state.username(client.sessionId);
    const player = this.state.player(client.sessionId);
    if (!username || !player || this.disposed) return;
    if (!this.accept(username, client.sessionId, nowMs)) { this.error(client, STATUS_UPDATE_PENDING_LABEL, requestId); return; }
    try {
      await this.enqueue(username, () => this.saveCommand(client.sessionId, username, player, payload));
    } catch { this.error(client, STATUS_SAVE_FAILED_LABEL, requestId); }
    finally { this.pendingUsernames.delete(username); }
  }
  private async saveCommand(sessionId: string, username: string, player: PlayerState, command: UserStatusCommand) {
    if (!this.current(sessionId, username, player)) return;
    const current = effectiveAvailability(playerAvailability(player), this.nowMs());
    const profile = effectiveAvailability({ status: command.status, customStatus: command.customStatus === undefined ? current.customStatus : command.customStatus }, this.nowMs());
    await this.store.save(username, this.officeId, profile, this.state.maintainer(sessionId));
    if (this.current(sessionId, username, player)) this.publish(sessionId, player, effectiveAvailability(profile, this.nowMs()), command.requestId);
  }
  private accept(username: string, sessionId: string, nowMs: number) {
    const previousMs = this.lastAcceptedAtBySessionId.get(sessionId);
    if (this.pendingUsernames.has(username) || (previousMs !== undefined && nowMs - previousMs < STATUS_UPDATE_MIN_INTERVAL_MS)) return false;
    this.pendingUsernames.add(username);
    this.lastAcceptedAtBySessionId.set(sessionId, nowMs);
    return true;
  }
  private error(client: AvailabilityClient, error: string, requestId?: string) {
    client.send("user-status-error", { error, ...(requestId ? { requestId } : {}) });
  }
  private current(sessionId: string, username: string, player: PlayerState) {
    return !this.disposed && this.state.username(sessionId) === username && this.state.player(sessionId) === player;
  }
  private publish(sessionId: string, player: PlayerState, profile: AvailabilityProfile, requestId?: string) {
    applyPlayerAvailability(player, profile);
    this.room.broadcast("user-status", { sessionId, ...profile, ...(requestId ? { requestId } : {}) });
  }
  expire(nowMs = Date.now()) {
    if (this.disposed) return;
    const sessions = new Set(this.state.sessions());
    for (const sessionId of this.lastAcceptedAtBySessionId.keys()) {
      if (!sessions.has(sessionId)) this.lastAcceptedAtBySessionId.delete(sessionId);
    }
    for (const sessionId of sessions) {
      const player = this.state.player(sessionId);
      if (!player?.customStatusExpiresAtMs || player.customStatusExpiresAtMs > nowMs) continue;
      this.publish(sessionId, player, effectiveAvailability(playerAvailability(player), nowMs));
    }
  }
  dispose() { this.disposed = true; }
}
export function registerAvailabilityMessages(room: AvailabilityRoom, messages: AvailabilityMessages) {
  room.onMessage("user-status", (client, payload) => { void messages.command(client, payload); });
  const timer = setInterval(() => messages.expire(), STATUS_EXPIRY_CHECK_INTERVAL_MS);
  timer.unref();
  return () => { clearInterval(timer); messages.dispose(); };
}
