import { isOfficeShareAcceptance } from "@gammyverse/shared";

export const SHARE_OFFICE_LABEL = "Share office";
export type ShareOffice = { id: string; name: string; role: string };
export type OfficeShareLink = { id: string; createdAt: string; expiresAt: string };
export type OfficeShareSnapshot = Readonly<{
  office: ShareOffice | null; links: readonly OfficeShareLink[]; url: string | null; oneTimeUrl: string | null; freshId: string | null;
  busy: "loading" | "creating" | "creating-one-time" | "revoking" | null; error: string | null; copyMessage: string | null;
}>;
export type OfficeShareRequest = (url: string, init: RequestInit) => Promise<Response>;
type ApiResult = { value: unknown; error: null } | { value: null; error: string };
const CLOSED_SNAPSHOT: OfficeShareSnapshot = { office: null, links: [], url: null, oneTimeUrl: null, freshId: null, busy: null, error: null, copyMessage: null };
const LOAD_ERROR_LABEL = "Could not load share links. Please try again.";
const CREATE_ERROR_LABEL = "Could not create a share link. Please try again.";
const CREATE_ONE_TIME_ERROR_LABEL = "Could not create a one-time invite. Please try again.";
const REVOKE_ERROR_LABEL = "Could not revoke the share link. Please try again.";
const COPY_MANUALLY_LABEL = "Clipboard unavailable. Select the link and copy it manually.";
const COPIED_LABEL = "Link copied.";

export function canManageOfficeShareLinks(role: string): boolean {
  return role === "owner" || role === "admin" || role === "maintainer";
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isShareLink(value: unknown): value is OfficeShareLink {
  return record(value) && typeof value.id === "string" && value.id.length > 0 &&
    typeof value.createdAt === "string" && Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt));
}
async function requestApi(request: OfficeShareRequest, url: string, method: string, error: string): Promise<ApiResult> {
  return Promise.resolve().then(() => request(url, { method, credentials: "include" })).then(async response => {
    if (!response.ok) return { value: null, error };
    if (response.status === 204) return { value: null, error: null };
    return response.json().then(value => ({ value, error: null }), () => ({ value: null, error }));
  }, () => ({ value: null, error }));
}

/** Raw link tokens live only in this dialog's memory, cleared on close/account change. */
export class OfficeShareLinks {
  private state = CLOSED_SNAPSHOT;
  private generation = 0;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly endpoint: string, private readonly origin: string, private readonly request: OfficeShareRequest = fetch) {}
  get snapshot(): OfficeShareSnapshot { return this.state; }
  readonly read = (): OfficeShareSnapshot => this.state;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  };
  private update(snapshot: OfficeShareSnapshot): void {
    this.state = snapshot; for (const listener of this.listeners) listener();
  }
  readonly close = (): void => { this.generation += 1; this.update(CLOSED_SNAPSHOT); };
  private baseUrl(office: ShareOffice): string { return `${this.endpoint}/offices/${encodeURIComponent(office.id)}/share-links`; }
  private begin(busy: OfficeShareSnapshot["busy"]): number | null {
    if (!this.state.office || this.state.busy) return null;
    this.update({ ...this.state, busy, error: null, copyMessage: null });
    return this.generation;
  }
  async open(office: ShareOffice): Promise<void> {
    if (!canManageOfficeShareLinks(office.role)) return;
    this.close(); this.update({ ...CLOSED_SNAPSHOT, office }); await this.refresh();
  }
  async refresh(): Promise<void> {
    const generation = this.begin("loading");
    const office = this.state.office;
    if (generation === null || !office) return;
    const result = await requestApi(this.request, this.baseUrl(office), "GET", LOAD_ERROR_LABEL);
    if (generation !== this.generation) return;
    const links = record(result.value) ? result.value.links : undefined;
    if (result.error || !Array.isArray(links) || !links.every(isShareLink)) {
      this.update({ ...this.state, busy: null, error: result.error ?? LOAD_ERROR_LABEL }); return;
    }
    const freshActive = this.state.freshId === null || links.some(link => link.id === this.state.freshId);
    this.update({ ...this.state, links, busy: null, url: freshActive ? this.state.url : null, freshId: freshActive ? this.state.freshId : null });
  }
  async create(): Promise<void> {
    const generation = this.begin("creating");
    const office = this.state.office;
    if (generation === null || !office) return;
    const result = await requestApi(this.request, this.baseUrl(office), "POST", CREATE_ERROR_LABEL);
    if (generation !== this.generation) return;
    const link = record(result.value) ? result.value.link : undefined;
    if (result.error || !isShareLink(link) || !isOfficeShareAcceptance(link)) {
      this.update({ ...this.state, busy: null, error: result.error ?? CREATE_ERROR_LABEL }); return;
    }
    const url = new URL(`/share/${link.token}`, this.origin).href;
    const metadata: OfficeShareLink = { id: link.id, createdAt: link.createdAt, expiresAt: link.expiresAt };
    this.update({ ...this.state, links: [metadata, ...this.state.links], url, freshId: link.id, busy: null });
  }
  async createOneTime(): Promise<void> {
    const generation = this.begin("creating-one-time");
    const office = this.state.office;
    if (generation === null || !office) return;
    const result = await Promise.resolve().then(() => this.request(`${this.endpoint}/offices/${encodeURIComponent(office.id)}/invites`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "user" }),
    })).then(async response => {
      if (!response.ok) return { value: null, error: CREATE_ONE_TIME_ERROR_LABEL };
      return response.json().then(value => ({ value, error: null }), () => ({ value: null, error: CREATE_ONE_TIME_ERROR_LABEL }));
    }, () => ({ value: null, error: CREATE_ONE_TIME_ERROR_LABEL }));
    if (generation !== this.generation) return;
    const invite = record(result.value) && record(result.value.invite) ? result.value.invite : null;
    const token = invite?.token;
    if (result.error || typeof token !== "string" || token.length < 30 || token.length > 100 || !/^[A-Za-z0-9_-]+$/.test(token)) {
      this.update({ ...this.state, busy: null, error: result.error ?? CREATE_ONE_TIME_ERROR_LABEL }); return;
    }
    this.update({ ...this.state, oneTimeUrl: new URL(`/join/${token}`, this.origin).href, busy: null, error: null, copyMessage: null });
  }
  async revoke(linkId: string): Promise<void> {
    if (!this.state.links.some(link => link.id === linkId)) return;
    const generation = this.begin("revoking");
    const office = this.state.office;
    if (generation === null || !office) return;
    const result = await requestApi(this.request, `${this.baseUrl(office)}/${encodeURIComponent(linkId)}`, "DELETE", REVOKE_ERROR_LABEL);
    if (generation !== this.generation) return;
    if (result.error) { this.update({ ...this.state, busy: null, error: result.error }); return; }
    const fresh = this.state.freshId === linkId;
    this.update({ ...this.state, links: this.state.links.filter(link => link.id !== linkId), busy: null,
      url: fresh ? null : this.state.url, freshId: fresh ? null : this.state.freshId });
  }
  async copy(write: (url: string) => Promise<void>): Promise<void> {
    const { url } = this.state;
    if (!url) return;
    const generation = this.generation;
    const copyMessage = await Promise.resolve().then(() => write(url)).then(() => COPIED_LABEL, () => COPY_MANUALLY_LABEL);
    if (generation === this.generation && url === this.state.url) this.update({ ...this.state, copyMessage });
  }
  async copyOneTime(write: (url: string) => Promise<void>): Promise<void> {
    const { oneTimeUrl } = this.state;
    if (!oneTimeUrl) return;
    const generation = this.generation;
    const copyMessage = await Promise.resolve().then(() => write(oneTimeUrl)).then(() => COPIED_LABEL, () => COPY_MANUALLY_LABEL);
    if (generation === this.generation && oneTimeUrl === this.state.oneTimeUrl) this.update({ ...this.state, copyMessage });
  }
}
