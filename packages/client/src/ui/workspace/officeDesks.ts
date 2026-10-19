import { isOfficeDeskChangeResult, isOfficeDeskSnapshot, type OfficeDeskChangeResult, type OfficeDeskSnapshot } from "@gammyverse/shared";

export type DeskFetch = (url: string, init: RequestInit) => Promise<Response>;
export type OfficeDesksContext = { endpoint: string; officeId: string | null; username: string | null; sessionKey: string | null; configVersion: number };
export type OfficeDesksState = OfficeDeskSnapshot & { pendingDeskId: string | null; loading: boolean; error: string | null };
const INITIAL_CONFIG_VERSION = 0;
const INVALID_RESPONSE_LABEL = "The desk service returned an invalid response.";
const UNAVAILABLE_LABEL = "Desk management is temporarily unavailable. Please try again.";
const STALE_DESKS_LABEL = "Desk information is updating. Refresh and try again.";
const MISSING_DESK_LABEL = "This desk no longer exists. Refresh the office and try again.";
const emptyState = (): OfficeDesksState => ({ desks: [], configVersion: INITIAL_CONFIG_VERSION, pendingDeskId: null, loading: false, error: null });
type ActiveOfficeDesksContext = OfficeDesksContext & { officeId: string; username: string; sessionKey: string };
type RequestContext = { epoch: number; sequence: number; context: ActiveOfficeDesksContext };

export class OfficeDesksController {
  private context: OfficeDesksContext | null = null;
  private epoch = 0;
  private sequence = 0;
  private acceptedSequence = 0;
  private refreshSequence = 0;
  private mutationSequence = 0;
  private state = emptyState();
  private readonly listeners = new Set<() => void>();
  constructor(private readonly fetcher: DeskFetch = (url, init) => fetch(url, init)) {}
  get snapshot() { return this.state; }
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  matchesContext(context: OfficeDesksContext) {
    return this.context?.endpoint === context.endpoint && this.context.officeId === context.officeId
      && this.context.username === context.username && this.context.sessionKey === context.sessionKey;
  }
  configure(context: OfficeDesksContext) {
    const previous = this.context;
    this.context = context;
    if (!previous || previous.endpoint !== context.endpoint || previous.officeId !== context.officeId || previous.username !== context.username || previous.sessionKey !== context.sessionKey) {
      this.epoch += 1;
      this.acceptedSequence = 0;
      this.publish(emptyState());
    } else if (context.configVersion > this.state.configVersion) {
      this.publish({ ...this.state, desks: [] });
    }
  }
  readonly refresh = async (): Promise<void> => {
    const request = this.requestContext();
    if (!request) return;
    this.refreshSequence = request.sequence;
    this.publish({ ...this.state, loading: true, error: null });
    try {
      const payload = await this.fetchPayload(request, "", "GET");
      if (!this.current(request)) return;
      if (!isOfficeDeskSnapshot(payload) || !this.belongsToOffice(payload, request)) throw new Error(INVALID_RESPONSE_LABEL);
      this.accept(payload, request);
    } catch (error) {
      this.fail(request, error, this.refreshSequence);
    } finally {
      if (this.current(request) && request.sequence === this.refreshSequence) this.publish({ ...this.state, loading: false });
    }
  };
  readonly claim = (deskId: string) => this.change(deskId, "claim");
  readonly unclaim = (deskId: string) => this.change(deskId, "unclaim");
  private publish(state: OfficeDesksState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  private requestContext(): RequestContext | null {
    if (!this.context?.officeId || !this.context.username || !this.context.sessionKey) return null;
    this.sequence += 1;
    const { officeId, username, sessionKey } = this.context;
    return { epoch: this.epoch, sequence: this.sequence, context: { ...this.context, officeId, username, sessionKey } };
  }
  private current(request: RequestContext) { return request.epoch === this.epoch; }
  private belongsToOffice(payload: OfficeDeskSnapshot, request: RequestContext) {
    return payload.desks.every(desk => desk.officeId === request.context.officeId);
  }
  private accept(payload: OfficeDeskSnapshot, request: RequestContext) {
    const minimumVersion = Math.max(this.context?.configVersion ?? INITIAL_CONFIG_VERSION, this.state.configVersion);
    if (payload.configVersion < minimumVersion) {
      if (this.state.configVersion < minimumVersion) this.publish({ ...this.state, error: STALE_DESKS_LABEL });
      return false;
    }
    if (payload.configVersion === this.state.configVersion && request.sequence < this.acceptedSequence) return false;
    this.acceptedSequence = request.sequence;
    this.publish({ ...this.state, desks: payload.desks, configVersion: payload.configVersion, error: null });
    return true;
  }
  private async fetchPayload(request: RequestContext, suffix: string, method: string): Promise<unknown> {
    const { endpoint, officeId } = request.context;
    const response = await this.fetcher(`${endpoint}/offices/${encodeURIComponent(officeId)}/desks${suffix}`, { method, credentials: "include" });
    const payload: unknown = await response.json().catch((error: unknown) => {
      if (error instanceof SyntaxError) throw new Error(INVALID_RESPONSE_LABEL);
      throw error;
    });
    if (!response.ok) {
      const message = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : UNAVAILABLE_LABEL;
      throw new Error(message);
    }
    return payload;
  }
  private fail(request: RequestContext, error: unknown, latestSequence: number) {
    if (!this.current(request) || request.sequence !== latestSequence || request.sequence < this.acceptedSequence) return;
    this.publish({ ...this.state, error: error instanceof Error ? error.message : UNAVAILABLE_LABEL });
  }
  private async change(deskId: string, action: "claim" | "unclaim"): Promise<OfficeDeskChangeResult | null> {
    if (this.state.pendingDeskId) return null;
    const request = this.requestContext();
    if (!request) return null;
    if (!this.state.desks.some(desk => desk.id === deskId)) {
      this.publish({ ...this.state, error: MISSING_DESK_LABEL });
      return null;
    }
    this.mutationSequence = request.sequence;
    this.publish({ ...this.state, pendingDeskId: deskId, error: null });
    try {
      const payload = await this.fetchPayload(request, `/${encodeURIComponent(deskId)}/${action}`, "POST");
      if (!this.current(request)) return null;
      if (!isOfficeDeskChangeResult(payload) || !this.belongsToOffice(payload, request)) throw new Error(INVALID_RESPONSE_LABEL);
      return this.accept(payload, request) ? payload : null;
    } catch (error) {
      this.fail(request, error, this.mutationSequence);
      return null;
    } finally {
      if (this.current(request) && request.sequence === this.mutationSequence) this.publish({ ...this.state, pendingDeskId: null });
    }
  }
}
