import { randomBytes, randomUUID } from "node:crypto";
import {
  isValidSpotlightCommand,
  type SpotlightCommand,
  type SpotlightRequest,
  SPOTLIGHT_REVOKE_DEADLINE_MS,
} from "@gammyverse/shared";
import { logServerError } from "../infra/logger.js";

const SPOTLIGHT_EPOCH_BYTES = 12;
const SPOTLIGHT_ACCESS_CHANGED_LABEL = "Spotlight access changed.";
const SPOTLIGHT_REVOKE_RETRY_LABEL = "spotlight.revoke.retry";
const SPOTLIGHT_REQUEST_TTL_MS = 30_000;
const SPOTLIGHT_REQUEST_UNAVAILABLE_LABEL = "This spotlight request is no longer available.";
const SPOTLIGHT_REQUEST_BUSY_LABEL = "This person already has a spotlight request.";
type Dependencies = {
  role: (username: string) => Promise<string | null>;
  revoke: (room: string, identity: string) => Promise<void>;
  changed: (state: { usernames: string[]; epoch: string }) => void;
  requestsChanged?: (username: string, state: { incoming: SpotlightRequest[]; outgoing: SpotlightRequest[] }) => void;
};
export type SpotlightDeparture = "drop" | "leave" | "replace" | "security";
export type DeparturePhase = "drop" | "leave";
// Colyseus close codes: CONSENTED is a voluntary leave; the two app codes are
// sent by OfficeRoom when access is revoked or the office is deleted.
export const OFFICE_ACCESS_REVOKED_CLOSE_CODE = 4003;
export const OFFICE_CLOSED_CLOSE_CODE = 4004;
function isSecurityCloseCode(code: number | undefined) {
  return (
    code === OFFICE_ACCESS_REVOKED_CLOSE_CODE ||
    code === OFFICE_CLOSED_CLOSE_CODE
  );
}
export function spotlightDepartureReason(
  code: number | undefined,
  phase: DeparturePhase,
): "security" | "drop" | "leave" {
  if (isSecurityCloseCode(code)) return "security";
  return phase;
}
export class Spotlight {
  private readonly usernames = new Set<string>();
  private readonly identities = new Map<string, Set<string>>();
  private readonly requests = new Map<string, SpotlightRequest>();
  private readonly requestTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private closed = false;
  private epoch = randomBytes(SPOTLIGHT_EPOCH_BYTES).toString("hex");

  constructor(
    private readonly officeId: string,
    private readonly dependencies: Dependencies,
  ) {}

  snapshot() {
    return { usernames: [...this.usernames], epoch: this.epoch };
  }

  requestSnapshot(username: string) {
    const requests = [...this.requests.values()];
    return {
      incoming: requests.filter(request => request.targetUsername === username),
      outgoing: requests.filter(request => request.fromUsername === username),
    };
  }

  grant(username: string, publish: boolean) {
    if (this.closed) return null;
    if (publish && !this.usernames.has(username)) return null;
    return {
      epoch: this.epoch,
      publish,
      roomName: this.roomName(),
    };
  }

  private roomName() {
    return `office-${this.officeId}-spotlight-${this.epoch}`;
  }

  track(username: string, identity: string) {
    if (this.closed) return;
    const identities = this.identities.get(username) ?? new Set<string>();
    identities.add(identity);
    this.identities.set(username, identities);
  }

  isTracked(username: string, identity: string) {
    return this.identities.get(username)?.has(identity) === true;
  }

  async command(sender: string, payload: unknown) {
    if (!isValidSpotlightCommand(payload))
      throw new Error("Invalid spotlight command.");
    if (payload.action === "request") return this.createRequest(sender, payload);
    if (payload.action === "respond") return this.respond(sender, payload);
    if (payload.action === "cancel") return this.cancel(sender, payload);
    return this.stop(sender, payload);
  }

  private async createRequest(sender: string, command: Extract<SpotlightCommand, { action: "request" }>) {
    const epoch = this.epoch;
    const role = await this.dependencies.role(sender);
    if (role !== "owner" && role !== "admin")
      throw new Error("Only owners and admins can request a spotlight.");
    if (!(await this.dependencies.role(command.targetUsername)))
      throw new Error("Target is not an office member.");
    if (this.closed || epoch !== this.epoch)
      throw new Error(SPOTLIGHT_ACCESS_CHANGED_LABEL);
    if (this.usernames.has(command.targetUsername))
      throw new Error(SPOTLIGHT_REQUEST_BUSY_LABEL);
    if ([...this.requests.values()].some(request => request.targetUsername === command.targetUsername))
      throw new Error(SPOTLIGHT_REQUEST_BUSY_LABEL);
    const request: SpotlightRequest = { id: randomUUID(), fromUsername: sender, targetUsername: command.targetUsername, expiresAtMs: Date.now() + SPOTLIGHT_REQUEST_TTL_MS };
    this.requests.set(request.id, request);
    const timer = setTimeout(() => this.finishRequest(request.id), SPOTLIGHT_REQUEST_TTL_MS);
    timer.unref();
    this.requestTimers.set(request.id, timer);
    this.publishRequest(request);
  }

  private async respond(sender: string, command: Extract<SpotlightCommand, { action: "respond" }>) {
    const request = this.requests.get(command.requestId);
    if (!request || request.targetUsername !== sender || request.expiresAtMs <= Date.now())
      throw new Error(SPOTLIGHT_REQUEST_UNAVAILABLE_LABEL);
    const epoch = this.epoch;
    const [targetRole, requesterRole] = await Promise.all([this.dependencies.role(sender), this.dependencies.role(request.fromUsername)]);
    if (!targetRole || (requesterRole !== "owner" && requesterRole !== "admin") || this.closed || epoch !== this.epoch
      || this.requests.get(request.id) !== request || request.expiresAtMs <= Date.now())
      throw new Error(SPOTLIGHT_REQUEST_UNAVAILABLE_LABEL);
    this.finishRequest(request.id);
    if (command.accept) {
      this.usernames.add(sender);
      this.dependencies.changed(this.snapshot());
    }
  }

  private async cancel(sender: string, command: Extract<SpotlightCommand, { action: "cancel" }>) {
    const request = this.requests.get(command.requestId);
    const role = await this.dependencies.role(sender);
    if (!request || request.fromUsername !== sender || (role !== "owner" && role !== "admin"))
      throw new Error(SPOTLIGHT_REQUEST_UNAVAILABLE_LABEL);
    this.finishRequest(request.id);
  }

  private async stop(sender: string, command: Extract<SpotlightCommand, { action: "stop" }>) {
    const targetUsername = command.targetUsername;
    const senderRole = await this.dependencies.role(sender);
    if (sender !== targetUsername && senderRole !== "owner" && senderRole !== "admin")
      throw new Error("Only owners and admins can stop another person’s spotlight.");
    if (!await this.dependencies.role(targetUsername)) throw new Error("Target is not an office member.");
    if (this.closed) throw new Error(SPOTLIGHT_ACCESS_CHANGED_LABEL);
    await this.depart(targetUsername, "security");
  }

  private publishRequest(request: SpotlightRequest) {
    this.dependencies.requestsChanged?.(request.fromUsername, this.requestSnapshot(request.fromUsername));
    this.dependencies.requestsChanged?.(request.targetUsername, this.requestSnapshot(request.targetUsername));
  }

  private finishRequest(requestId: string) {
    const request = this.requests.get(requestId);
    if (!request) return;
    this.requests.delete(requestId);
    const timer = this.requestTimers.get(requestId);
    if (timer) clearTimeout(timer);
    this.requestTimers.delete(requestId);
    this.publishRequest(request);
  }

  private finishRequestsFor(username: string) {
    for (const request of this.requests.values())
      if (request.fromUsername === username || request.targetUsername === username) this.finishRequest(request.id);
  }

  async remove(username: string) {
    await this.depart(username, "leave");
  }

  async depart(username: string, reason: SpotlightDeparture) {
    this.finishRequestsFor(username);
    const publisher = this.usernames.has(username);
    if (reason !== "drop") this.usernames.delete(username);
    if (reason === "security" || (publisher && reason !== "drop")) {
      await this.rotate();
      return;
    }
    const identities = [...(this.identities.get(username) ?? [])];
    this.identities.delete(username);
    await this.revokeRoom(this.roomName(), identities);
  }

  private async rotate() {
    const room = this.roomName();
    const identities = [...this.identities.values()].flatMap((values) => [
      ...values,
    ]);
    this.identities.clear();
    this.epoch = randomBytes(SPOTLIGHT_EPOCH_BYTES).toString("hex");
    this.dependencies.changed(this.snapshot());
    await this.revokeRoom(room, identities);
  }

  private async revokeAttempt(room: string, identities: string[]) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("Spotlight revoke deadline exceeded.")),
        SPOTLIGHT_REVOKE_DEADLINE_MS,
      );
    });
    try {
      await Promise.race([
        Promise.all(
          identities.map((identity) =>
            this.dependencies.revoke(room, identity),
          ),
        ),
        deadline,
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async revokeRoom(room: string, identities: string[]) {
    if (identities.length === 0) return;
    try {
      await this.revokeAttempt(room, identities);
    } catch {
      logServerError(
        "realtime",
        SPOTLIGHT_REVOKE_RETRY_LABEL,
        new Error("Spotlight participant removal failed or exceeded deadline."),
        { officeId: this.officeId },
      );
      await this.revokeAttempt(room, identities);
    }
  }

  async departSecurity(usernames: Iterable<string>) {
    if (this.closed) return;
    for (const username of usernames) this.usernames.delete(username);
    await this.rotate();
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const request of this.requests.values()) {
      const timer = this.requestTimers.get(request.id);
      if (timer) clearTimeout(timer);
    }
    this.requests.clear();
    this.requestTimers.clear();
    this.usernames.clear();
    await this.rotate();
  }
}
