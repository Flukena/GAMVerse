import { randomBytes } from "node:crypto";
import {
  isValidSpotlightCommand,
  SPOTLIGHT_REVOKE_DEADLINE_MS,
} from "@gammyverse/shared";
import { logServerError } from "../infra/logger.js";

const SPOTLIGHT_EPOCH_BYTES = 12;
const SPOTLIGHT_ACCESS_CHANGED_LABEL = "Spotlight access changed.";
const SPOTLIGHT_REVOKE_RETRY_LABEL = "spotlight.revoke.retry";
type Dependencies = {
  role: (username: string) => Promise<string | null>;
  revoke: (room: string, identity: string) => Promise<void>;
  changed: (state: { usernames: string[]; epoch: string }) => void;
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
  private closed = false;
  private epoch = randomBytes(SPOTLIGHT_EPOCH_BYTES).toString("hex");

  constructor(
    private readonly officeId: string,
    private readonly dependencies: Dependencies,
  ) {}

  snapshot() {
    return { usernames: [...this.usernames], epoch: this.epoch };
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
    const epoch = this.epoch;
    const role = await this.dependencies.role(sender);
    if (role !== "owner" && role !== "admin")
      throw new Error("Only owners and admins can spotlight.");
    if (!(await this.dependencies.role(payload.targetUsername)))
      throw new Error("Target is not an office member.");
    if (this.closed || epoch !== this.epoch)
      throw new Error(SPOTLIGHT_ACCESS_CHANGED_LABEL);
    if (!payload.on) {
      await this.depart(payload.targetUsername, "security");
      return;
    }
    this.usernames.add(payload.targetUsername);
    this.dependencies.changed(this.snapshot());
  }

  async remove(username: string) {
    await this.depart(username, "leave");
  }

  async depart(username: string, reason: SpotlightDeparture) {
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
    this.usernames.clear();
    await this.rotate();
  }
}
