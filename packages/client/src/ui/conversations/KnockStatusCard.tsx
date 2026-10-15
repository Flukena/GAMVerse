import { privateActionEnabled } from "./conversationAccessState";
import { admittedTransportNotice, PRIVATE_KNOCK_STATE_LABELS, remainingAccessTime } from "./conversationAccessPresentation";
import type { ConversationAccessModel } from "./useConversationAccess";

const KNOCK_LABEL = "Knock to request admission";
const CANCEL_LABEL = "Cancel knock";
const OWN_STATUS_LABEL = "Your room access";
const EXPIRED_PENDING_LABEL = "Your knock has expired. Waiting for server confirmation.";
const LEASE_EXPIRED_LABEL = "Your guest access has expired. Waiting for server confirmation.";
const BLOCKED_LABEL = "Admission is required to enter this room and use its audio or chat. You can continue elsewhere.";
export function KnockStatusCard({ access, connected }: { access: ConversationAccessModel; connected: boolean }) {
  const snapshot = access.snapshot;
  if (!snapshot) return null;
  const own = snapshot.ownKnock;
  const transportNotice = admittedTransportNotice(snapshot.access, snapshot.transportState);
  const expiredPending = own?.state === "pending" && own.expiresAtMs <= access.nowMs;
  const expiredLease = snapshot.leaseExpiresAtMs !== null && snapshot.leaseExpiresAtMs <= access.nowMs;
  const stateLabel = expiredPending ? EXPIRED_PENDING_LABEL : own ? PRIVATE_KNOCK_STATE_LABELS[own.state] : null;
  return <section className="knock-status-card" aria-label={OWN_STATUS_LABEL}>
    {snapshot.access === "blocked" && <p>{BLOCKED_LABEL}</p>}
    {stateLabel && <p role="status">{stateLabel}</p>}
    {own?.state === "pending" && !expiredPending && <small>{remainingAccessTime(own.expiresAtMs, access.nowMs, "knock")}</small>}
    {snapshot.leaseExpiresAtMs !== null && <p role={expiredLease ? "status" : undefined}>{expiredLease ? LEASE_EXPIRED_LABEL : remainingAccessTime(snapshot.leaseExpiresAtMs, access.nowMs, "guest")}</p>}
    {transportNotice && <p role="status">{transportNotice}</p>}
    <div className="conversation-access-actions">
      {snapshot.capabilities.knock && <button type="button" disabled={!connected || access.pending} onClick={() => access.command({ action: "knock" })}>{KNOCK_LABEL}</button>}
      {snapshot.capabilities.cancelKnock && <button type="button" disabled={!connected || !privateActionEnabled(snapshot, { action: "cancel-knock" }, access.pending, access.nowMs)} onClick={() => access.command({ action: "cancel-knock" })}>{CANCEL_LABEL}</button>}
    </div>
  </section>;
}
