import type { ConversationListeningMode, ConversationSnapshot } from "@gammyverse/shared";
import type { VoiceTarget } from "./voiceTarget";

interface ConversationMediaSession {
  setTarget(target: VoiceTarget | null): void;
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

/** Admission gates actual media; only the microphone button changes user intent. */
export function applyConversationMediaIntent(
  session: ConversationMediaSession | null,
  target: VoiceTarget | null,
  mode: ConversationListeningMode,
  admission: AdmissionIntent = { known: true, admitted: true, newLease: false },
): void {
  if (!session) return;
  if (!admission.known || !admission.admitted || mode === "off") {
    session.setTarget(null);
    return;
  }
  session.setTarget(target);
}
