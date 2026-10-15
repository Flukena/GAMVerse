import { isOfficeDeskAdministrationSnapshot, isOfficeDeskAssignmentResult, isOfficeDesksChanged, type OfficeDeskAdministrationSnapshot, type OfficeDeskAssignmentResult } from "@gammyverse/shared";
import { deskAssignmentCommand, EMPTY_DESK_MANAGER_STATE, type DeskManagerIntent, type DeskManagerState } from "./deskManagerState";
import { DeskManagerError, deskManagerPayload } from "./deskManagerHttp";
import { deskNoticeText } from "./officeNoticeText";
import type { DeskFetch, OfficeDesksContext } from "./officeDesks";

const INVALID_RESPONSE_LABEL = "Desk management returned an invalid response. Reload and try again.";
const STALE_SNAPSHOT_LABEL = "Desk information changed. Reload before trying again.";
const INVALID_ACTION_LABEL = "This assignment is no longer available. Reload the desk list.";
const UNAVAILABLE_LABEL = "Desk management is unavailable. Reload and try again.";
export type DeskManagerContext = OfficeDesksContext;
type ManagerRequest = { epoch: number; operation: AbortController; officeId: string; endpoint: string };
export class DeskManagerController {
  private context: DeskManagerContext | null = null;
  private epoch = 0;
  private appliedVersion = 0;
  private operation: AbortController | null = null;
  private state: DeskManagerState = { ...EMPTY_DESK_MANAGER_STATE };
  private readonly listeners = new Set<() => void>();
  constructor(private readonly fetcher: DeskFetch = (url, init) => fetch(url, init)) {}
  get snapshot() { return this.state; }
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  matchesContext(context: DeskManagerContext): boolean {
    return this.context?.endpoint === context.endpoint && this.context.officeId === context.officeId
      && this.context.username === context.username && this.context.sessionKey === context.sessionKey;
  }
  configure(context: DeskManagerContext): void {
    const changed = !this.matchesContext(context);
    this.context = context;
    if (changed) { this.appliedVersion = 0; this.epoch++; this.operation?.abort(); this.operation = null; this.patch({ ...EMPTY_DESK_MANAGER_STATE }); }
    else if (this.state.snapshot && this.state.snapshot.configVersion < context.configVersion) this.patch({ needsReload: true });
  }
  dispose(): void { this.epoch++; this.operation?.abort(); this.operation = null; }
  private patch(update: Partial<DeskManagerState>): void {
    this.state = { ...this.state, ...update };
    for (const listener of this.listeners) listener();
  }
  private begin(): ManagerRequest | null {
    const context = this.context;
    if (!context?.officeId || !context.username || !context.sessionKey) return null;
    this.operation?.abort();
    const operation = new AbortController();
    this.operation = operation;
    return { epoch: this.epoch, operation, officeId: context.officeId, endpoint: context.endpoint };
  }
  private current(request: ManagerRequest): boolean { return request.epoch === this.epoch && request.operation === this.operation && !request.operation.signal.aborted; }
  private minimumVersion(): number { return Math.max(this.context?.configVersion ?? 0, this.state.snapshot?.configVersion ?? 0); }
  readonly refresh = async (): Promise<void> => {
    if (this.state.pendingDeskId) return;
    const request = this.begin();
    if (!request) return;
    this.patch({ loading: true, error: null });
    try {
      const payload = await deskManagerPayload(this.fetcher, request.endpoint, request.officeId, { method: "GET", signal: request.operation.signal });
      if (!this.current(request)) return;
      if (!isOfficeDeskAdministrationSnapshot(payload) || payload.officeId !== request.officeId) throw new DeskManagerError(INVALID_RESPONSE_LABEL, "invalid");
      if (payload.configVersion < this.minimumVersion()) throw new DeskManagerError(STALE_SNAPSHOT_LABEL, "conflict");
      this.acceptAdministration(payload);
    } catch (cause) { this.fail(request, cause); }
    finally { if (this.current(request)) { this.operation = null; this.patch({ loading: false }); } }
  };
  readonly submit = async (intent: DeskManagerIntent): Promise<OfficeDeskAssignmentResult | null> => {
    const snapshot = this.state.snapshot;
    if (!snapshot || this.state.loading || this.state.pendingDeskId || this.state.needsReload) return null;
    const command = deskAssignmentCommand(snapshot, intent, crypto.randomUUID());
    if (!command) { this.patch({ error: INVALID_ACTION_LABEL, needsReload: true }); return null; }
    const request = this.begin();
    if (!request) return null;
    const pendingDeskId = intent.action === "move" ? intent.targetDeskId : intent.deskId;
    this.patch({ pendingDeskId, error: null, saved: null });
    try {
      const payload = await deskManagerPayload(this.fetcher, request.endpoint, request.officeId, {
        method: "POST", signal: request.operation.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
      });
      if (!this.current(request)) return null;
      if (!isOfficeDeskAssignmentResult(payload) || payload.requestId !== command.requestId || !payload.desks.every(desk => desk.officeId === request.officeId)) throw new DeskManagerError(INVALID_RESPONSE_LABEL, "invalid");
      this.acceptAssignment(snapshot, payload);
      return payload;
    } catch (cause) { this.fail(request, cause); return null; }
    finally { if (this.current(request)) { this.operation = null; this.patch({ pendingDeskId: null }); } }
  };
  confirmRealtime(payload: unknown, context: DeskManagerContext): void {
    if (!this.matchesContext(context) || !isOfficeDesksChanged(payload) || payload.officeId !== context.officeId) return;
    this.appliedVersion = Math.max(this.appliedVersion, payload.configVersion);
    const saved = this.state.saved;
    if (saved?.realtimeSync !== "pending" || this.appliedVersion < saved.configVersion) return;
    const snapshot = this.state.snapshot;
    const current = snapshot !== null && this.appliedVersion >= snapshot.configVersion;
    this.patch({ snapshot: current ? { ...snapshot, realtimeSync: "applied" } : snapshot,
      saved: { ...saved, realtimeSync: "applied" }, needsReload: !current || snapshot.configVersion < this.minimumVersion() });
  }
  private acceptAdministration(snapshot: OfficeDeskAdministrationSnapshot): void {
    if (snapshot.realtimeSync === "applied") this.appliedVersion = Math.max(this.appliedVersion, snapshot.configVersion);
    const previous = this.state.saved;
    const saved = previous && snapshot.realtimeSync === "applied" && snapshot.configVersion >= previous.configVersion
      ? { ...previous, realtimeSync: "applied" as const } : previous;
    this.patch({ snapshot, saved, needsReload: snapshot.realtimeSync === "pending" || saved?.realtimeSync === "pending", error: null });
  }
  private acceptAssignment(snapshot: OfficeDeskAdministrationSnapshot, result: OfficeDeskAssignmentResult): void {
    const current = result.configVersion >= this.minimumVersion();
    const realtimeSync = this.appliedVersion >= result.configVersion ? "applied" : result.realtimeSync;
    const desks = result.desks.map(desk => ({ ...desk, name: snapshot.desks.find(previous => previous.id === desk.id)?.name ?? "Desk" }));
    this.patch({ snapshot: current ? { ...snapshot, desks, configVersion: result.configVersion, realtimeSync } : this.state.snapshot,
      saved: { requestId: result.requestId, realtimeSync, configVersion: result.configVersion }, error: current ? null : STALE_SNAPSHOT_LABEL, needsReload: !current || realtimeSync === "pending" });
  }
  private fail(request: ManagerRequest, cause: unknown): void {
    if (!this.current(request)) return;
    if (!(cause instanceof Error)) throw cause;
    const forbidden = cause instanceof DeskManagerError && cause.code === "forbidden";
    this.patch({ snapshot: forbidden ? null : this.state.snapshot, error: deskNoticeText(cause.message || UNAVAILABLE_LABEL), needsReload: true });
  }
}
