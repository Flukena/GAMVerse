import { PrivateAccessDeniedError, privateAccessFailure } from "./privateAccessErrors.js";
import { PrivateDeadlines } from "./privateDeadlines.js";
import { randomUUID } from "node:crypto";
import { PRIVATE_ACTION_INTERVAL_MS, PRIVATE_MEDIA_RETRY_INTERVAL_MS, PRIVATE_TERMINAL_KNOCKS_MAX_COUNT, PRIVATE_ZONE_ACCESS_EVENT, PRIVATE_ZONE_RESULT_EVENT, isValidPrivateZoneAccessRequest, isValidPrivateZoneCommand, isValidLegacyZoneLock, type DeskAssignmentFence, type PrivateZoneCommand, type PrivateZoneResult } from "@gammyverse/shared";
import { PrivateMediaEpochs, type ZoneEpochKey, type ZoneMediaDescriptor, type ZoneMediaTransition } from "../media/privateMediaEpoch.js";
import { logServerError } from "../infra/logger.js";
import { PrivateZoneAccess, type PrivateAccessFrame } from "./privateZoneAccess.js";
import { privateAccessQueries, type PrivateAccessQueries } from "./privateAccessQueries.js";
export type PrivateAccessEvent = {
  sessionId: string;
  event: string;
  payload: unknown;
};
type Options = {
  epochs?: PrivateMediaEpochs;
  queries?: PrivateAccessQueries;
  nowMs?: () => number;
  id?: () => string;
  onDeadline?: () => void;
  onChange?: () => void;
};
const PRIVATE_ACCESS_PENDING_MAX_COUNT = 256;
const ACCESS_DENIED_LABEL = "Room access is unavailable. Refresh and try again.";
const ACTION_BUSY_LABEL = "Wait a moment before changing room access again.";
const REQUEST_UNAVAILABLE_LABEL = "This knock is no longer available.";
const MEDIA_ROTATION_FAILED_EVENT_LABEL = "private.media.rotation.failed";
export class PrivateConversations {
  readonly access: PrivateZoneAccess;
  private readonly epochs: PrivateMediaEpochs;
  private readonly queries: PrivateAccessQueries;
  private readonly nowMs: () => number;
  private readonly id: () => string;
  private readonly usedEpochs=new Map<string,ZoneEpochKey>();
  private readonly watches = new Map<string, string>();
  private readonly events = new Map<string, PrivateAccessEvent>();
  private readonly reads = new Map<string,{valid:boolean;zoneId:string}>();
  private readonly lastReadAt = new Map<string,number>();
  private readonly pending = new Map<string,{valid:boolean;zoneId:string}>();
  private readonly lastActionAt = new Map<string, number>();
  private readonly results = new Map<string, PrivateZoneResult>();
  private readonly mediaFailureAt = new Map<string,number>();
  private readonly revisions = new Map<string, number>();
  private disposed = false;
  private readonly assignmentZones = new Map<string, string>();
  private readonly assignmentPreparations = new Map<string, Promise<boolean>>();
  private readonly deadlines: PrivateDeadlines;
  private frame?: PrivateAccessFrame;
  private readonly onChange?: () => void;
  constructor(readonly officeId: string, readonly roomIncarnationId: string, options: Options = {}) {
    this.access = new PrivateZoneAccess(officeId, roomIncarnationId);
    this.epochs = options.epochs ?? new PrivateMediaEpochs();
    this.queries = options.queries ?? privateAccessQueries;
    this.nowMs = options.nowMs ?? Date.now;
    this.id = options.id ?? randomUUID;
    this.onChange = options.onChange;
    this.deadlines = new PrivateDeadlines(this.nowMs, () => {
      if (this.disposed || !this.frame) return;
      this.reconcile(this.frame);
      options.onDeadline?.();
    });
  }
  deadlineDue() { const deadline = this.access.nextDeadlineAtMs(); return deadline !== null && deadline <= this.nowMs(); }
  reconcile(frame: PrivateAccessFrame) {
    if (this.disposed)
      return;
    this.frame = frame;
    const previousKeys = new Map(this.access.zoneIds().map(id => [id, this.key(id)]));
    const changed = this.access.reconcile(frame, this.nowMs());
    for (const id of changed) {
      if (this.access.zone(id))
        this.rotate(id);
      else {
        const key = previousKeys.get(id);
        if (key && this.usedEpochs.has(JSON.stringify(key)))
          void this.epochs.invalidate(key).settled;
      }
    }
    this.publishChanges();
  }
  mapChanged(frame: PrivateAccessFrame) {
    this.deadlines.clear();
    this.reconcile(frame);
    for (const zone of frame.zones) {
      if(zone.kind==="restroom"||!this.access.zone(zone.id))continue;
      const previous=this.key(zone.id);
      if(!this.access.updateZone(zone))continue;
      if(previous.kind!==zone.kind&&this.usedEpochs.has(JSON.stringify(previous)))void this.epochs.invalidate(previous).settled;
      this.rotate(zone.id);
    }
    this.publishChanges();
  }
  canEnter(sessionId: string, zoneId: string) { return !this.assignmentZones.has(zoneId) && this.access.canEnter(sessionId, zoneId, this.nowMs()); }
  admissionLeaseId(sessionId: string, zoneId: string) { return this.access.leaseId(sessionId, zoneId, this.nowMs()); }
  mayHear(sessionId: string, zoneId: string) { return !this.assignmentZones.has(zoneId) && this.access.mayHear(sessionId, zoneId, this.nowMs()); }
  audienceSessions(){return new Set([...this.access.audienceSessions(this.nowMs())].filter(id => !this.assignmentZones.has(this.access.zoneForSession(id) ?? "")));}
  lockedIds() { return new Set([...this.access.lockedIds(), ...this.assignmentZones.keys()]); }
  descriptor(zoneId: string) {
    const key=this.key(zoneId);this.usedEpochs.set(JSON.stringify(key),key);
    const descriptor = this.epochs.current(key);
    return this.assignmentZones.has(zoneId) ? {...descriptor, available: false, state: "rotating" as const} : descriptor;
  }

  prepareAssignment(fence: DeskAssignmentFence): Promise<boolean> {
    const existing = this.assignmentPreparations.get(fence.operationId);
    if (existing) return existing;
    for (const zoneId of fence.zoneIds) this.assignmentZones.set(zoneId, fence.operationId);
    for (const action of [...this.reads.values(), ...this.pending.values()]) if (fence.zoneIds.includes(action.zoneId)) action.valid = false;
    const rotations = fence.zoneIds.filter(zoneId => !!this.access.zone(zoneId)).map(zoneId => {
      this.descriptor(zoneId);
      const transition = this.epochs.invalidate(this.key(zoneId));
      this.track(zoneId, transition);
      return transition.settled.then(descriptor => descriptor.state === "ready");
    });
    const preparation = Promise.all(rotations).then(results => results.every(Boolean));
    this.assignmentPreparations.set(fence.operationId, preparation);
    return preparation;
  }

  releaseAssignment(operationId: string) {
    for (const [zoneId, operation] of this.assignmentZones) if (operation === operationId) this.assignmentZones.delete(zoneId);
    this.assignmentPreparations.delete(operationId);
  }
  private key(zoneId: string): ZoneEpochKey {
    const zone = this.access.zone(zoneId);
    if (!zone || zone.kind === "restroom")
      throw new PrivateAccessDeniedError(ACCESS_DENIED_LABEL);
    return { officeId: this.officeId, roomIncarnationId: this.roomIncarnationId, zoneId, kind: zone.kind };
  }
  private rotate(zoneId: string) {
    if (!this.access.zone(zoneId))
      return;
    this.descriptor(zoneId); this.track(zoneId, this.epochs.invalidate(this.key(zoneId)));
  }
  private track(zoneId: string, transition: ZoneMediaTransition) {
    this.access.touch(zoneId);
    const requestedGeneration=transition.descriptor.generation;
    void transition.settled.then(descriptor => {
      if (this.disposed || !this.access.zone(zoneId) || this.descriptor(zoneId).generation !== requestedGeneration || descriptor.generation !== requestedGeneration)
        return;
      if(descriptor.state==="unavailable"&&!this.mediaFailureAt.has(zoneId))this.mediaFailureAt.set(zoneId,this.nowMs());
      if(descriptor.state==="ready")this.mediaFailureAt.delete(zoneId);
      this.access.touch(zoneId);
      this.publishChanges();
      if (descriptor.state === "unavailable")
        logServerError("realtime", MEDIA_ROTATION_FAILED_EVENT_LABEL, new Error("Private room media revocation failed."), { officeId: this.officeId });
    });
  }
  private publishChanges() {
    if (!this.disposed) this.deadlines.schedule(this.access.nextDeadlineAtMs());
    let changed = false;
    for (const zoneId of this.access.zoneIds()) {
      const revision = this.access.revision(zoneId);
      if (this.revisions.get(zoneId) === revision)
        continue;
      this.revisions.set(zoneId, revision);
      changed = true;
      for (const [sessionId, watch] of this.watches)
        if (watch === zoneId)
          this.queueSnapshot(sessionId, zoneId);
    }
    if (changed && !this.disposed) this.onChange?.();
  }
  private snapshot(sessionId: string, zoneId: string) { return this.access.snapshot(sessionId, zoneId, this.descriptor(zoneId).state, this.nowMs()); }
  private queueSnapshot(sessionId: string, zoneId: string) {
    if (!this.access.person(sessionId)?.active)
      return;
    this.events.set(sessionId, { sessionId, event: PRIVATE_ZONE_ACCESS_EVENT, payload: this.snapshot(sessionId, zoneId) });
  }
  drainEvents() { const events = [...this.events.values()]; this.events.clear(); return events; }
  private result(sessionId: string, requestId: string, ok: boolean, error?: string): PrivateAccessEvent { return { sessionId, event: PRIVATE_ZONE_RESULT_EVENT, payload: { requestId, ok, ...(error ? { error } : {}) } }; }
  private async authorized(sessionId: string) {
    const person = this.access.person(sessionId);
    if (!person?.active || !person.online || !(await this.queries.authorize(person, this.officeId)))
      throw new PrivateAccessDeniedError(ACCESS_DENIED_LABEL);
    const current = this.access.person(sessionId);
    if (this.disposed || !current?.active || !current.online || current.username !== person.username)
      throw new PrivateAccessDeniedError(ACCESS_DENIED_LABEL);
    return current;
  }
  private async refreshOwner(zoneId: string) {
    if (this.assignmentZones.has(zoneId)) throw new PrivateAccessDeniedError(ACCESS_DENIED_LABEL);
    const zone = this.access.zone(zoneId);
    if (!zone)
      throw new PrivateAccessDeniedError(ACCESS_DENIED_LABEL);
    if (zone.kind !== "private")
      return;
    const owner = await this.queries.owner(this.officeId, zoneId);
    if (this.disposed || this.assignmentZones.has(zoneId) || !this.access.zone(zoneId))
      throw new PrivateAccessDeniedError(ACCESS_DENIED_LABEL);
    if (this.access.updateOwner(zoneId, owner))
      this.rotate(zoneId);
  }
  async authorizeMedia(sessionId:string):Promise<ZoneMediaDescriptor|null>{
    try {
      const zoneId=this.access.zoneForSession(sessionId);if(!zoneId)return null;
      await this.authorized(sessionId);await this.refreshOwner(zoneId);
      if(!this.mayHear(sessionId,zoneId))return null;
      return this.descriptor(zoneId);
    }catch(error){if(error instanceof PrivateAccessDeniedError)return null;throw new Error(privateAccessFailure(error,this.officeId));}
  }
  async legacyLock(sessionId: string, payload: unknown) {
    if (!isValidLegacyZoneLock(payload) || !this.access.zone(payload.zoneId))
      return [];
    return this.command(sessionId, { requestId: this.id(), zoneId: payload.zoneId, expectedRevision: this.access.revision(payload.zoneId), action: payload.locked ? "lock" : "unlock" });
  }
  async request(sessionId: string, payload: unknown): Promise<PrivateAccessEvent[]> {
    if (!isValidPrivateZoneAccessRequest(payload) || this.disposed) return [];
    if (this.assignmentZones.has(payload.zoneId)) return [this.result(sessionId,payload.requestId,false,ACCESS_DENIED_LABEL)];
    const nowMs=this.nowMs();
    const previous=this.lastReadAt.get(sessionId);
    if(this.reads.has(sessionId)||this.reads.size+this.pending.size>=PRIVATE_ACCESS_PENDING_MAX_COUNT||(previous!==undefined&&nowMs-previous<PRIVATE_ACTION_INTERVAL_MS))return [this.result(sessionId,payload.requestId,false,ACTION_BUSY_LABEL)];
    const read={valid:true,zoneId:payload.zoneId};this.reads.set(sessionId,read);this.lastReadAt.set(sessionId,nowMs);
    try {
      await this.authorized(sessionId);
      await this.refreshOwner(payload.zoneId);
      if(!read.valid||this.disposed||this.assignmentZones.has(payload.zoneId)||!this.access.person(sessionId)?.active)throw new PrivateAccessDeniedError(ACCESS_DENIED_LABEL);
      this.watches.set(sessionId,payload.zoneId);
      return [{sessionId,event:PRIVATE_ZONE_ACCESS_EVENT,payload:this.snapshot(sessionId,payload.zoneId)},this.result(sessionId,payload.requestId,true)];
    }catch(error){return this.disposed?[]:[this.result(sessionId,payload.requestId,false,privateAccessFailure(error,this.officeId))];}
    finally{if(this.reads.get(sessionId)===read)this.reads.delete(sessionId);}
  }
  async command(sessionId: string, payload: unknown): Promise<PrivateAccessEvent[]> {
    if (!isValidPrivateZoneCommand(payload) || this.disposed)
      return [];
    if (this.assignmentZones.has(payload.zoneId)) return [this.result(sessionId,payload.requestId,false,ACCESS_DENIED_LABEL)];
    const replayKey = `${sessionId}:${payload.requestId}`;
    const replay = this.results.get(replayKey);
    if (replay)
      return [{ sessionId, event: PRIVATE_ZONE_RESULT_EVENT, payload: replay }];
    const nowMs = this.nowMs();
    const previous = this.lastActionAt.get(sessionId);
    if (this.pending.has(sessionId) || this.reads.size+this.pending.size>=PRIVATE_ACCESS_PENDING_MAX_COUNT || (previous !== undefined && nowMs - previous < PRIVATE_ACTION_INTERVAL_MS))
      return [this.result(sessionId, payload.requestId, false, ACTION_BUSY_LABEL)];
    const action={valid:true,zoneId:payload.zoneId};
    this.pending.set(sessionId,action);
    this.lastActionAt.set(sessionId, nowMs);
    let result: PrivateAccessEvent;
    try {
      await this.authorized(sessionId);
      await this.refreshOwner(payload.zoneId);
      await this.authorizeKnockTarget(payload);
      await this.authorized(sessionId);
      await this.refreshOwner(payload.zoneId);
      if(!action.valid||this.disposed||this.assignmentZones.has(payload.zoneId))throw new PrivateAccessDeniedError(ACCESS_DENIED_LABEL);
      this.apply(sessionId, payload);
      result = this.result(sessionId, payload.requestId, true);
    }
    catch (error) {
      result = this.result(sessionId, payload.requestId, false, privateAccessFailure(error,this.officeId));
    }
    finally {
      this.pending.delete(sessionId);
    }
    this.results.set(replayKey, result.payload as PrivateZoneResult);
    this.pruneResults();
    this.publishChanges();
    const events: PrivateAccessEvent[] = [];
    if (this.access.zone(payload.zoneId) && this.access.person(sessionId)?.active) {
      this.watches.set(sessionId, payload.zoneId);
      events.push({ sessionId, event: PRIVATE_ZONE_ACCESS_EVENT, payload: this.snapshot(sessionId, payload.zoneId) });
    }
    events.push(result);
    return events;
  }
  private async authorizeKnockTarget(command: PrivateZoneCommand) {
    if (command.action !== "admit")
      return;
    const request = this.access.knock(command.knockId);
    if (!request || request.state !== "pending")
      throw new PrivateAccessDeniedError(REQUEST_UNAVAILABLE_LABEL);
    await this.authorized(request.sessionId);
  }
  private apply(sessionId: string, command: PrivateZoneCommand) {
    const securityChanged = this.access.apply(sessionId, command, this.nowMs(), this.id());
    if (command.action === "retry-media") {
      const failedAt=this.mediaFailureAt.get(command.zoneId);
      if(failedAt===undefined||this.nowMs()-failedAt<PRIVATE_MEDIA_RETRY_INTERVAL_MS)throw new PrivateAccessDeniedError("Room audio retry is not ready. Try again shortly.");
      this.mediaFailureAt.delete(command.zoneId);
      this.track(command.zoneId, this.epochs.retry(this.key(command.zoneId), this.descriptor(command.zoneId).generation));
      return;
    }
    if (securityChanged)
      this.rotate(command.zoneId);
  }
  removeSession(sessionId: string, retainAdmission: boolean) {
    const read=this.reads.get(sessionId);if(read)read.valid=false;
    const action=this.pending.get(sessionId);if(action)action.valid=false;
    this.lastReadAt.delete(sessionId);
    const changed = this.access.removeSession(sessionId, retainAdmission);
    for (const zoneId of changed)
      this.rotate(zoneId);
    this.watches.delete(sessionId);
    this.events.delete(sessionId);
    this.lastActionAt.delete(sessionId);
    this.publishChanges();
  }
  private pruneResults() {
    while (this.results.size > PRIVATE_TERMINAL_KNOCKS_MAX_COUNT) {
      const key = this.results.keys().next().value;
      if (key !== undefined)
        this.results.delete(key);
    }
  }
  async dispose() {
    this.disposed=true;
    this.deadlines.clear();
    this.frame = undefined;
    for(const read of this.reads.values())read.valid=false;
    for(const action of this.pending.values())action.valid=false;
    this.lastReadAt.clear();this.lastActionAt.clear();this.results.clear();
    const keys=[...this.usedEpochs.values()];
    this.events.clear();this.watches.clear();
    this.assignmentZones.clear();this.assignmentPreparations.clear();
    await Promise.allSettled(keys.map(key=>this.epochs.close(key)));
  }

}
