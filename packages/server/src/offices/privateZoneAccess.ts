import { PrivateAccessDeniedError } from "./privateAccessErrors.js";
import { PRIVATE_ADMISSION_TTL_MS, PRIVATE_KNOCK_TTL_MS, PRIVATE_PENDING_KNOCKS_MAX_COUNT, PRIVATE_TERMINAL_KNOCKS_MAX_COUNT, type PrivateKnock, type PrivateZoneCommand, type PrivateZoneAccessSnapshot, type PrivateTransportState, type RoomLayoutZone } from "@gammyverse/shared";
export type PrivatePerson = {
  sessionId: string;
  username: string;
  displayName: string;
  active: boolean;
  online: boolean;
  sessionToken?: string;
};
export type PrivateAccessFrame = {
  zones: RoomLayoutZone[];
  people: ReadonlyMap<string, PrivatePerson>;
  zoneBySession: ReadonlyMap<string, string>;
};
type Admission = {
  sessionId: string;
  username: string;
  displayName: string;
  expiresAtMs: number | null;
  leaseId?: string;
};
type ZoneState = {
  zone: RoomLayoutZone;
  locked: boolean;
  revision: number;
  admissions: Map<string, Admission>;
  lastMembers: Set<string>;
  retainEmptyUntilMs: number | null;
};
type StoredKnock = PrivateKnock & {
  zoneId: string;
};
const INVALID_ZONE_LABEL = "This room is unavailable.";
const ACCESS_DENIED_LABEL = "You cannot manage access to this room.";
const STALE_ACCESS_LABEL = "Room access changed. Refresh and try again.";
const KNOCK_UNAVAILABLE_LABEL = "Knocking is unavailable for this room.";
const KNOCK_LIMIT_LABEL = "A knock is already pending or the room request queue is full.";
const INVALID_REQUEST_LABEL = "This knock is no longer available.";
function sameMembers(first: ReadonlySet<string>, second: ReadonlySet<string>) { return first.size === second.size && [...first].every(id => second.has(id)); }
export class PrivateZoneAccess {
  private readonly zones = new Map<string, ZoneState>();
  private readonly knocks = new Map<string, StoredKnock>();
  private frame: PrivateAccessFrame = { zones: [], people: new Map(), zoneBySession: new Map() };
  constructor(readonly officeId: string, readonly roomIncarnationId: string) { }
  person(id: string) { return this.frame.people.get(id); }
  zone(id: string) { return this.zones.get(id)?.zone; }
  zoneForSession(id: string) { return this.frame.zoneBySession.get(id); }
  audienceSessions(nowMs:number){return new Set([...this.frame.zoneBySession].filter(([sessionId,zoneId])=>this.mayHear(sessionId,zoneId,nowMs)).map(([sessionId])=>sessionId));}
  zoneIds() { return [...this.zones.keys()]; }
  nextDeadlineAtMs(): number | null {
    let next = Infinity;
    for (const zone of this.zones.values()) {
      if (zone.retainEmptyUntilMs !== null) next = Math.min(next, zone.retainEmptyUntilMs);
      for (const admission of zone.admissions.values()) if (admission.expiresAtMs !== null) next = Math.min(next, admission.expiresAtMs);
    }
    for (const knock of this.knocks.values()) if (knock.state === "pending") next = Math.min(next, knock.expiresAtMs);
    return Number.isFinite(next) ? next : null;
  }
  lockedIds() { return new Set([...this.zones].filter(([, zone]) => zone.locked).map(([id]) => id)); }
  lockForMeeting(zoneId: string, sessionIds: readonly string[], nowMs: number) {
    const zone = this.requireZone(zoneId);
    if (zone.zone.kind !== "meeting" || zone.locked || sessionIds.length !== 2 || this.physical(zoneId).length)
      throw new PrivateAccessDeniedError(INVALID_ZONE_LABEL);
    const people = sessionIds.map(id => this.person(id));
    if (people.some(person => !person?.active || !person.online))
      throw new PrivateAccessDeniedError(INVALID_ZONE_LABEL);
    zone.locked = true;
    zone.retainEmptyUntilMs = nowMs + PRIVATE_ADMISSION_TTL_MS;
    for (const person of people) zone.admissions.set(person!.sessionId, {
      sessionId: person!.sessionId, username: person!.username, displayName: person!.displayName,
      expiresAtMs: null,
    });
    zone.revision += 1;
    return true;
  }
  revision(id: string) { return this.requireZone(id).revision; }
  touch(id: string) {
    const zone = this.zones.get(id);
    if (zone)
      zone.revision += 1;
  }
  reconcile(frame: PrivateAccessFrame, nowMs: number): Set<string> {
    this.frame = frame;
    const changed = new Set<string>();
    const present = new Set(frame.zones.filter(zone => zone.kind !== "restroom").map(zone => zone.id));
    for (const [id, zone] of this.zones) {
      if (!present.has(id)) {
        this.invalidateKnocks(id);
        this.zones.delete(id);
        changed.add(id);
      }
      else if (this.expireAdmissions(zone, nowMs))
        changed.add(id);
    }
    for (const incoming of frame.zones)
      if (incoming.kind !== "restroom" && this.reconcileZone(incoming, nowMs))
        changed.add(incoming.id);
    for (const request of this.knocks.values()) {
      if (request.state === "pending" && request.expiresAtMs <= nowMs) {
        request.state = "expired";
        this.touch(request.zoneId);
      }
    }
    this.prune();
    return changed;
  }
  private reconcileZone(incoming: RoomLayoutZone, nowMs: number): boolean {
    let zone = this.zones.get(incoming.id);
    if (!zone) {
      zone = { zone: { ...incoming }, locked: false, revision: 0, admissions: new Map(), lastMembers: new Set(), retainEmptyUntilMs: null };
      this.zones.set(incoming.id, zone);
      zone.lastMembers=this.admittedPhysical(zone,nowMs);
      return false;
    }
    const members = this.admittedPhysical(zone, nowMs);
    let changed = false;
    if (!sameMembers(zone.lastMembers, members)) {
      zone.lastMembers = members;
      zone.revision += 1;
      changed = true;
    }
    if (zone.retainEmptyUntilMs !== null && nowMs >= zone.retainEmptyUntilMs) zone.retainEmptyUntilMs = null;
    if (zone.locked && this.physical(incoming.id).length === 0 && zone.retainEmptyUntilMs === null) {
      this.unlock(zone);
      return true;
    }
    if (zone.locked && !this.hasModerator(incoming.id, nowMs) && this.pending(incoming.id).length) {
      this.invalidateKnocks(incoming.id);
      zone.revision += 1;
    }
    return changed;
  }
  updateZone(zone: RoomLayoutZone): boolean {
    const current = this.zones.get(zone.id);
    if (!current)
      return false;
    const changed = current.zone.ownerUsername !== zone.ownerUsername || current.zone.kind !== zone.kind;
    const geometryChanged=current.zone.x!==zone.x||current.zone.z!==zone.z||current.zone.width!==zone.width||current.zone.depth!==zone.depth;
    current.zone = { ...zone };
    if (changed || geometryChanged) {
      if(changed)current.admissions.clear();
      current.revision += 1;
      this.invalidateKnocks(zone.id);
    }
    return changed || geometryChanged;
  }
  updateOwner(zoneId: string, ownerUsername: string | null): boolean {
    const zone = this.requireZone(zoneId);
    return this.updateZone({ ...zone.zone, ownerUsername: ownerUsername ?? undefined });
  }
  private expireAdmissions(zone: ZoneState, nowMs: number) {
    let changed = false;
    for (const [id, entry] of zone.admissions) {
      if (entry.expiresAtMs !== null && entry.expiresAtMs <= nowMs) {
        zone.admissions.delete(id);
        this.finishOwnKnock(id, zone.zone.id, "expired");
        changed = true;
      }
    }
    if (changed)
      zone.revision += 1;
    return changed;
  }
  private physical(zoneId: string) { return [...this.frame.people.values()].filter(person => person.active && person.online && this.frame.zoneBySession.get(person.sessionId) === zoneId); }
  private admittedPhysical(zone: ZoneState, nowMs: number) { return new Set(this.physical(zone.zone.id).filter(person => this.canEnter(person.sessionId, zone.zone.id, nowMs)).map(person => person.sessionId)); }
  canEnter(sessionId: string, zoneId: string, nowMs: number): boolean {
    const zone = this.zones.get(zoneId);
    const person = this.person(sessionId);
    if (!zone || !person?.active || !person.online)
      return false;
    if (!zone.locked)
      return true;
    if (zone.zone.kind === "private" && zone.zone.ownerUsername === person.username)
      return true;
    const entry = zone.admissions.get(sessionId);
    return entry?.username === person.username && (entry.expiresAtMs === null || entry.expiresAtMs > nowMs);
  }
  mayHear(sessionId: string, zoneId: string, nowMs: number) { return this.frame.zoneBySession.get(sessionId) === zoneId && this.canEnter(sessionId, zoneId, nowMs); }
  moderator(sessionId: string, zoneId: string, nowMs: number): boolean {
    const zone = this.zones.get(zoneId);
    const person = this.person(sessionId);
    if (!zone || !person || !this.mayHear(sessionId, zoneId, nowMs))
      return false;
    return zone.zone.kind === "meeting" || zone.zone.ownerUsername === person.username;
  }
  private hasModerator(zoneId: string, nowMs: number) { return this.physical(zoneId).some(person => this.moderator(person.sessionId, zoneId, nowMs)); }
  ownKnock(sessionId: string, zoneId: string): PrivateKnock | null {
    const requests = [...this.knocks.values()].filter(knock => knock.sessionId === sessionId && knock.zoneId === zoneId);
    const value = requests.at(-1);
    if (!value)
      return null;
    const { zoneId: _zoneId, ...request } = value;
    return { ...request };
  }
  leaseId(sessionId: string, zoneId: string, nowMs: number) { const entry = this.zones.get(zoneId)?.admissions.get(sessionId); return entry?.expiresAtMs !== null && this.mayHear(sessionId, zoneId, nowMs) ? entry?.leaseId : undefined; }
  knock(id: string) { return this.knocks.get(id); }
  private pending(zoneId: string) { return [...this.knocks.values()].filter(knock => knock.zoneId === zoneId && knock.state === "pending"); }
  private canKnock(sessionId: string, zoneId: string, nowMs: number) {
    const person = this.person(sessionId);
    const zone = this.zones.get(zoneId);
    return !!person?.active && person.online && !!zone?.locked && !this.canEnter(sessionId, zoneId, nowMs) && this.hasModerator(zoneId, nowMs);
  }
  snapshot(sessionId: string, zoneId: string, state: PrivateTransportState, nowMs: number): PrivateZoneAccessSnapshot {
    const zone = this.requireZone(zoneId);
    const moderator = this.moderator(sessionId, zoneId, nowMs);
    const own = this.ownKnock(sessionId, zoneId);
    return {
      officeId: this.officeId, roomIncarnationId: this.roomIncarnationId, zoneId, revision: zone.revision, locked: zone.locked, transportState: state,
      access: !zone.locked ? "open" : this.canEnter(sessionId, zoneId, nowMs) ? "admitted" : "blocked", leaseExpiresAtMs: zone.admissions.get(sessionId)?.expiresAtMs ?? null,
      capabilities: { lock: moderator && !zone.locked, unlock: moderator && zone.locked, knock: this.canKnock(sessionId, zoneId, nowMs), cancelKnock: own?.state === "pending", admit: moderator && zone.locked, revoke: moderator && zone.locked, retryMedia: moderator && state === "unavailable" }, ownKnock: own,
      pendingKnocks: moderator ? this.pending(zoneId).map(({ zoneId: _id, ...request }) => ({ ...request })) : [],
      revocableGuests: moderator ? [...zone.admissions.values()].filter((entry): entry is Admission & {
        expiresAtMs: number;
      } => entry.expiresAtMs !== null).map(entry => ({ sessionId: entry.sessionId, username: entry.username, displayName: entry.displayName, expiresAtMs: entry.expiresAtMs })) : []
    };
  }
  apply(sessionId: string, command: PrivateZoneCommand, nowMs: number, requestId: string): boolean {
    const zone = this.requireZone(command.zoneId);
    if (zone.revision !== command.expectedRevision)
      throw new PrivateAccessDeniedError(STALE_ACCESS_LABEL);
    if (command.action === "knock") {
      this.createKnock(sessionId, zone, nowMs, requestId);
      return false;
    }
    if (command.action === "cancel-knock") {
      this.cancelKnock(sessionId, zone);
      return false;
    }
    if (!this.moderator(sessionId, command.zoneId, nowMs))
      throw new PrivateAccessDeniedError(ACCESS_DENIED_LABEL);
    if (command.action === "retry-media")
      return false;
    if (command.action === "lock") {
      if (zone.locked)
        return false;
      zone.locked = true;
      for (const person of this.physical(zone.zone.id))
        zone.admissions.set(person.sessionId, { sessionId: person.sessionId, username: person.username, displayName: person.displayName, expiresAtMs: null });
      zone.revision += 1;
      return true;
    }
    if (command.action === "unlock") {
      this.unlock(zone);
      return true;
    }
    if (command.action === "revoke") {
      this.revoke(zone, command.targetSessionId);
      return true;
    }
    if ("knockId" in command)
      this.resolveKnock(zone, command, nowMs);
    return command.action === "admit";
  }
  private createKnock(sessionId: string, zone: ZoneState, nowMs: number, id: string) {
    if (!this.canKnock(sessionId, zone.zone.id, nowMs))
      throw new PrivateAccessDeniedError(KNOCK_UNAVAILABLE_LABEL);
    if ([...this.knocks.values()].some(knock => knock.sessionId === sessionId && knock.state === "pending") || this.pending(zone.zone.id).length >= PRIVATE_PENDING_KNOCKS_MAX_COUNT)
      throw new PrivateAccessDeniedError(KNOCK_LIMIT_LABEL);
    const person = this.person(sessionId)!;
    this.knocks.set(id, { id, zoneId: zone.zone.id, sessionId, username: person.username, displayName: person.displayName, createdAtMs: nowMs, expiresAtMs: nowMs + PRIVATE_KNOCK_TTL_MS, state: "pending" });
    zone.revision += 1;
  }
  private cancelKnock(sessionId: string, zone: ZoneState) {
    const own = this.ownKnock(sessionId, zone.zone.id);
    const request = own ? this.knocks.get(own.id) : undefined;
    if (request?.state !== "pending")
      throw new PrivateAccessDeniedError(INVALID_REQUEST_LABEL);
    request.state = "cancelled";
    zone.revision += 1;
  }
  private resolveKnock(zone: ZoneState, command: Extract<PrivateZoneCommand, {
    action: "admit" | "decline";
  }>, nowMs: number) {
    const request = this.knocks.get(command.knockId);
    if (!request || request.zoneId !== zone.zone.id || request.state !== "pending" || request.expiresAtMs <= nowMs)
      throw new PrivateAccessDeniedError(INVALID_REQUEST_LABEL);
    const person = this.person(request.sessionId);
    if (!person?.active || !person.online || person.username !== request.username)
      throw new PrivateAccessDeniedError(INVALID_REQUEST_LABEL);
    request.state = command.action === "admit" ? "admitted" : "declined";
    if (command.action === "admit")
      zone.admissions.set(person.sessionId, { sessionId: person.sessionId, username: person.username, displayName: person.displayName, expiresAtMs: nowMs + PRIVATE_ADMISSION_TTL_MS, leaseId: request.id });
    zone.revision += 1;
  }
  private revoke(zone: ZoneState, sessionId: string) {
    const entry = zone.admissions.get(sessionId);
    if (!entry || entry.expiresAtMs === null || entry.username === zone.zone.ownerUsername)
      throw new PrivateAccessDeniedError(ACCESS_DENIED_LABEL);
    zone.admissions.delete(sessionId);
    this.finishOwnKnock(sessionId, zone.zone.id, "revoked");
    zone.revision += 1;
  }
  private finishOwnKnock(sessionId: string, zoneId: string, state: PrivateKnock["state"]) {
    for (const request of this.knocks.values())
      if (request.sessionId === sessionId && request.zoneId === zoneId && request.state === "admitted")
        request.state = state;
  }
  private unlock(zone: ZoneState) { zone.locked = false; zone.retainEmptyUntilMs = null; zone.admissions.clear(); zone.revision += 1; this.invalidateKnocks(zone.zone.id); }
  private invalidateKnocks(zoneId: string) {
    for (const request of this.knocks.values())
      if (request.zoneId === zoneId && request.state === "pending")
        request.state = "unavailable";
  }
  removeSession(sessionId: string, retainAdmission: boolean): Set<string> {
    const changed = new Set<string>();
    const person = this.person(sessionId);
    if (person) {
      person.active = false;
      person.online = false;
    }
    for (const [id, zone] of this.zones) {
      if (!retainAdmission && zone.admissions.delete(sessionId)) {
        zone.revision += 1;
        changed.add(id);
      }
      for (const request of this.pending(id))
        if (request.sessionId === sessionId) {
          request.state = "unavailable";
          zone.revision += 1;
        }
    }
    return changed;
  }
  private prune() {
    const terminal = [...this.knocks.values()].filter(knock => knock.state !== "pending");
    for (const entry of terminal.slice(0, Math.max(0, terminal.length - PRIVATE_TERMINAL_KNOCKS_MAX_COUNT)))
      this.knocks.delete(entry.id);
  }
  private requireZone(id: string) {
    const zone = this.zones.get(id);
    if (!zone)
      throw new PrivateAccessDeniedError(INVALID_ZONE_LABEL);
    return zone;
  }
}
