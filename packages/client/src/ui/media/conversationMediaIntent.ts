import type { ConversationListeningMode, ConversationSnapshot } from "@gammyverse/shared";
import type { VoiceTarget } from "./voiceTarget";

interface ConversationMediaSession {
  suppressMedia(): void;
  setTarget(target: VoiceTarget | null): void;
  isProximityTarget?(): boolean;
}

type AdmissionIntent = { known: boolean; admitted: boolean; newLease: boolean };

export class ConversationAdmissionIntent {
  private leaseKey: string | null = null;

  receive(snapshot: ConversationSnapshot | null, sessionKey: string | null): AdmissionIntent {
    if (!snapshot) return { known: false, admitted: true, newLease: false };
    const admitted = Boolean(snapshot.conversation);
    const nextKey = admitted && snapshot.admissionLeaseId && sessionKey
      ? JSON.stringify([snapshot.officeId, snapshot.roomIncarnationId, sessionKey, snapshot.admissionLeaseId]) : null;
    const newLease = nextKey !== null && nextKey !== this.leaseKey;
    this.leaseKey = nextKey;
    return { known: true, admitted, newLease };
  }
}

/** Listen and lost/new guest admission clear publishing intent before authorization. */
export function applyConversationMediaIntent(
  session: ConversationMediaSession | null,
  target: VoiceTarget | null,
  mode: ConversationListeningMode,
  admission: AdmissionIntent = { known: true, admitted: true, newLease: false },
  suppressForAvailability = false,
): void {
  if (!session) return;
  if (suppressForAvailability) { session.suppressMedia(); return; }
  if (!admission.known) { session.setTarget(null); return; }
  const rotatingProximityRoom = admission.newLease && target?.kind === "proximity" && session.isProximityTarget?.();
  if (mode !== "join" || !admission.admitted || (admission.newLease && !rotatingProximityRoom)) session.suppressMedia();
  if (mode !== "off") session.setTarget(target);
}
