import type { PrivateKnock } from "@gammyverse/shared";
import { privateActionEnabled } from "./conversationAccessState";
import { remainingAccessTime } from "./conversationAccessPresentation";
import type { ConversationAccessModel } from "./useConversationAccess";

const REQUESTS_LABEL = "Admission requests";
const GUESTS_LABEL = "Admitted guests";
const ADMIT_LABEL = "Admit";
const DECLINE_LABEL = "Decline";
const REVOKE_LABEL = "Revoke guest access";
const NO_REQUESTS_LABEL = "No pending knocks.";
function PendingKnock({ knock, access, connected }: { knock: PrivateKnock; access: ConversationAccessModel; connected: boolean }) {
  return <li className="private-knock-request"><strong>{knock.displayName}</strong><small>{remainingAccessTime(knock.expiresAtMs, access.nowMs, "knock")}</small>
    <div className="conversation-access-actions">{(["admit", "decline"] as const).map(action => <button key={action} type="button"
      disabled={!connected || !privateActionEnabled(access.snapshot, { action, knockId: knock.id }, access.pending, access.nowMs)}
      onClick={() => access.command({ action, knockId: knock.id })}>{action === "admit" ? ADMIT_LABEL : DECLINE_LABEL}</button>)}</div>
  </li>;
}
export function KnockRequestPanel({ access, connected }: { access: ConversationAccessModel; connected: boolean }) {
  const snapshot = access.snapshot;
  if (!snapshot) return null;
  return <>
    {snapshot.capabilities.admit && <section className="private-knock-queue" aria-label={REQUESTS_LABEL}><h3>{REQUESTS_LABEL}</h3>
      {snapshot.pendingKnocks.length === 0 && <p>{NO_REQUESTS_LABEL}</p>}
      <ul>{snapshot.pendingKnocks.map(knock => <PendingKnock key={knock.id} knock={knock} access={access} connected={connected} />)}</ul>
    </section>}
    {snapshot.capabilities.revoke && snapshot.revocableGuests.length > 0 && <section className="private-guest-list" aria-label={GUESTS_LABEL}><h3>{GUESTS_LABEL}</h3>
      <ul>{snapshot.revocableGuests.map(guest => <li key={guest.sessionId}><strong>{guest.displayName}</strong><small>{remainingAccessTime(guest.expiresAtMs, access.nowMs, "guest")}</small>
        <button type="button" disabled={!connected || !privateActionEnabled(snapshot, { action: "revoke", targetSessionId: guest.sessionId }, access.pending, access.nowMs)}
          onClick={() => access.command({ action: "revoke", targetSessionId: guest.sessionId })}>{REVOKE_LABEL}</button>
      </li>)}</ul>
    </section>}
  </>;
}
