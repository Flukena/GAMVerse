export type SignOutSnapshot = Readonly<{ open: boolean; pending: boolean; error: string | null }>;
type LogoutRequest = (url: string, init: RequestInit) => Promise<Response>;
const SIGN_OUT_ERROR_LABEL = "Could not sign out. Please try again.";
const CLOSED_SNAPSHOT: SignOutSnapshot = { open: false, pending: false, error: null };

/** Confirmation owns submission state; the coordinator clears its session only on success. */
export class SignOutConfirmation {
  private state = CLOSED_SNAPSHOT;
  private generation = 0;
  private readonly listeners = new Set<() => void>();
  get snapshot(): SignOutSnapshot { return this.state; }
  readonly read = (): SignOutSnapshot => this.state;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(snapshot: SignOutSnapshot): void {
    this.state = snapshot;
    for (const listener of this.listeners) listener();
  }
  readonly request = (): void => {
    if (!this.state.pending) this.update({ open: true, pending: false, error: null });
  };
  readonly cancel = (): void => {
    if (!this.state.pending) this.update(CLOSED_SNAPSHOT);
  };
  readonly reset = (): void => {
    this.generation += 1;
    this.update(CLOSED_SNAPSHOT);
  };
  async confirm(endpoint: string, logout: LogoutRequest = fetch): Promise<boolean> {
    if (!this.state.open || this.state.pending) return false;
    const generation = this.generation;
    this.update({ open: true, pending: true, error: null });
    const succeeded = await Promise.resolve()
      .then(() => logout(`${endpoint}/auth/logout`, { method: "POST", credentials: "include" }))
      .then(response => response.ok, () => false);
    if (generation !== this.generation) return false;
    this.update(succeeded ? CLOSED_SNAPSHOT : { open: true, pending: false, error: SIGN_OUT_ERROR_LABEL });
    return succeeded;
  }
}
