import { isValidReturnToDeskIntent, type PlayerState, type RoomLayoutZone } from "@gammyverse/shared";
import { DeskRepository } from "./deskRepository.js";

const INVALID_DESK_DESTINATION_LABEL = "Invalid desk destination.";
const DESK_ROUTE_UNAVAILABLE_LABEL = "This desk route is unavailable. Try again.";
const DESK_LOOKUP_BUSY_LABEL = "Desk lookup is busy. Try again shortly.";
const DESK_TRAVEL_UNAVAILABLE_LABEL = "Desk travel is unavailable.";
const RETURN_TO_DESK_EVENT_LABEL = "return-to-desk";
const AUTO_MOVE_STATUS_EVENT_LABEL = "auto-move-status";
type DeskClient = { sessionId: string; send(event: string, payload: unknown): void };
type DeskRoom = { onMessage(event: string, handler: (client: DeskClient, payload: unknown) => void): unknown };
export type DeskTravelState = {
  navigationIntent?(sessionId: string): void;
  username(sessionId: string): string | undefined;
  player(sessionId: string): PlayerState | undefined;
  start(sessionId: string, player: PlayerState, zone: RoomLayoutZone): "started" | "arrived" | false;
};
export class DeskMessages {
  private readonly pending = new Map<string, { valid: boolean }>();
  constructor(private readonly officeId: string, private readonly state: DeskTravelState, private readonly store: Pick<DeskRepository, "destination"> = new DeskRepository()) {}
  async command(client: DeskClient, payload: unknown) {
    if (!isValidReturnToDeskIntent(payload)) { this.failed(client, INVALID_DESK_DESTINATION_LABEL); return; }
    const username = this.state.username(client.sessionId);
    const player = this.state.player(client.sessionId);
    if (!username || !player) return;
    this.state.navigationIntent?.(client.sessionId);
    if (this.pending.has(client.sessionId)) { this.invalidate(client.sessionId); this.failed(client, DESK_LOOKUP_BUSY_LABEL); return; }
    const request = { valid: true };
    this.pending.set(client.sessionId, request);
    try {
      const { zone } = await this.store.destination(username, this.officeId, payload.deskId);
      if (!request.valid || this.state.player(client.sessionId) !== player || this.state.username(client.sessionId) !== username) return;
      const status = this.state.start(client.sessionId, player, zone);
      if (!status) this.failed(client, DESK_ROUTE_UNAVAILABLE_LABEL);
      else client.send(AUTO_MOVE_STATUS_EVENT_LABEL, { status, destination: { x: zone.x, z: zone.z }, ...(status === "arrived" ? { teleported: true } : {}) });
    } catch (error) { if (request.valid) this.failed(client, error instanceof Error ? error.message : DESK_TRAVEL_UNAVAILABLE_LABEL); }
    finally { this.pending.delete(client.sessionId); }
  }
  invalidate(sessionId: string) {
    const request = this.pending.get(sessionId);
    const wasValid = request?.valid === true;
    if (request) request.valid = false;
    return wasValid;
  }
  invalidateAll() {
    const sessions = [...this.pending.keys()].filter(sessionId => this.invalidate(sessionId));
    return sessions;
  }
  private failed(client: DeskClient, message: string) { client.send(AUTO_MOVE_STATUS_EVENT_LABEL, { status: "unreachable", message }); }
}
export function registerDeskMessages(room: DeskRoom, messages: DeskMessages) {
  room.onMessage(RETURN_TO_DESK_EVENT_LABEL, (client, payload) => { void messages.command(client, payload); });
}
