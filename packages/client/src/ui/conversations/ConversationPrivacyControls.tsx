import { privateActionEnabled } from "./conversationAccessState";
import type { ConversationAccessModel } from "./useConversationAccess";
import "./ConversationAccess.css";

const LOCK_LABEL = "Lock room";
const UNLOCK_LABEL = "Unlock room";
const RETRY_LABEL = "Retry private media";
const PRIVACY_LABEL = "Room privacy";
const LOCKED_LABEL = "Locked. Guests need admission.";
const OPEN_LABEL = "Open. Normal room entry applies.";
const ROTATING_LABEL = "Updating private audio. Audio is paused until the new session is ready.";
const UNAVAILABLE_LABEL = "Private audio is unavailable. An authorized occupant can retry when the retry control becomes available.";
export function ConversationPrivacyControls({ access, connected }: { access: ConversationAccessModel; connected: boolean }) {
  const snapshot = access.snapshot;
  if (!snapshot) return null;
  const action = snapshot.locked ? { action: "unlock" as const } : { action: "lock" as const };
  const canLock = snapshot.capabilities.lock || snapshot.capabilities.unlock;
  return <section className="conversation-privacy-controls" aria-label={PRIVACY_LABEL}>
    <p>{snapshot.locked ? LOCKED_LABEL : OPEN_LABEL}</p>
    {snapshot.transportState !== "ready" && <p role="status">{snapshot.transportState === "rotating" ? ROTATING_LABEL : UNAVAILABLE_LABEL}</p>}
    <div className="conversation-access-actions">
      {canLock && <button type="button" aria-pressed={snapshot.locked} disabled={!connected || !privateActionEnabled(snapshot, action, access.pending, access.nowMs)} onClick={() => access.command(action)}>{snapshot.locked ? UNLOCK_LABEL : LOCK_LABEL}</button>}
      {snapshot.capabilities.retryMedia && <button type="button" disabled={!connected || access.pending} onClick={() => access.command({ action: "retry-media" })}>{RETRY_LABEL}</button>}
    </div>
  </section>;
}
