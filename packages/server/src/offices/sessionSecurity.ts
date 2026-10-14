interface AccountAccess {
  username: string;
  role: string;
}
interface ReconnectAccessQueries {
  account(token: string | undefined): Promise<AccountAccess | null>;
  officeRole(username: string, officeId: string, maintainer: boolean): Promise<string | null>;
}
const MAINTAINER_ROLE_LABEL = "maintainer";

const SECURITY_REVOKED_REASON_LABEL = "Session access was revoked.";
const OFFICE_CLOSED_REASON_LABEL = "Office session was closed.";

export interface ReconnectionSeat {
  reject(error: Error): unknown;
}
export interface ReconnectAccess {
  accountActive: boolean;
  officeMember: boolean;
  playerExists: boolean;
}

/** Owns session access and seats; the room applies the returned media decisions. */
export class SessionSecurity {
  private readonly activeByUsername = new Map<string, string>();
  private readonly tokensBySessionId = new Map<string, string>();
  private readonly revokedSessionIds = new Set<string>();
  private readonly seatsBySessionId = new Map<string, ReconnectionSeat>();
  private closed = false;

  activate(username: string, sessionId: string, sessionToken?: string) {
    this.activeByUsername.set(username, sessionId);
    if (sessionToken) this.tokensBySessionId.set(sessionId, sessionToken);
  }

  activeSession(username: string) { return this.activeByUsername.get(username); }
  token(sessionId: string) { return this.tokensBySessionId.get(sessionId); }
  isRevoked(sessionId: string) { return this.closed || this.revokedSessionIds.has(sessionId); }

  reserve(username: string, sessionId: string, seat: ReconnectionSeat) {
    if (this.closed || this.revokedSessionIds.has(sessionId) || this.activeSession(username) !== sessionId) {
      seat.reject(new Error(SECURITY_REVOKED_REASON_LABEL));
      return false;
    }
    this.seatsBySessionId.set(sessionId, seat);
    return true;
  }

  releaseSeat(sessionId: string, seat: ReconnectionSeat) {
    if (this.seatsBySessionId.get(sessionId) === seat) this.seatsBySessionId.delete(sessionId);
  }

  cancelSeat(sessionId: string, reason: string) {
    const seat = this.seatsBySessionId.get(sessionId);
    this.seatsBySessionId.delete(sessionId);
    seat?.reject(new Error(reason));
  }

  revoke(sessionId: string) {
    if (this.closed || this.revokedSessionIds.has(sessionId)) return false;
    this.revokedSessionIds.add(sessionId);
    this.cancelSeat(sessionId, SECURITY_REVOKED_REASON_LABEL);
    return true;
  }

  canReconnect(username: string, sessionId: string, access: ReconnectAccess) {
    return !this.closed && !this.revokedSessionIds.has(sessionId) &&
      this.activeSession(username) === sessionId && access.accountActive &&
      access.officeMember && access.playerExists;
  }

  finish(username: string | undefined, sessionId: string) {
    this.cancelSeat(sessionId, SECURITY_REVOKED_REASON_LABEL);
    this.tokensBySessionId.delete(sessionId);
    this.revokedSessionIds.delete(sessionId);
    if (username && this.activeSession(username) === sessionId) this.activeByUsername.delete(username);
  }

  close() {
    if (this.closed) return false;
    for (const sessionId of this.activeByUsername.values()) this.revoke(sessionId);
    this.closed = true;
    for (const sessionId of [...this.seatsBySessionId.keys()]) {
      this.revokedSessionIds.add(sessionId);
      this.cancelSeat(sessionId, OFFICE_CLOSED_REASON_LABEL);
    }
    return true;
  }
}

/** Query errors deny access; the coordinator retains the error for diagnostics. */
export async function readReconnectAccess(username: string | undefined, token: string | undefined, officeId: string, queries: ReconnectAccessQueries) {
  try {
    const account = await queries.account(token);
    if (!username || account?.username !== username) return { accountActive: false, officeMember: false };
    const role = await queries.officeRole(username, officeId, account.role === MAINTAINER_ROLE_LABEL);
    return { accountActive: true, officeMember: !!role };
  } catch (error) {
    return { accountActive: false, officeMember: false, error };
  }
}
