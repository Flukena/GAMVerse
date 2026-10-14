export type VoiceTarget = { kind: "meeting" | "private" | "proximity"; id: string; officeId: string; sessionKey: string };
export interface VoiceTargetInputs {
  officeId: string | null;
  sessionKey: string | null;
  paused: boolean;
  meetingZoneId: string | null;
  privateZoneId: string | null;
  proximityGroupId: string | null;
}

export function resolveVoiceTarget(inputs: VoiceTargetInputs): VoiceTarget | null {
  const { officeId, sessionKey, paused, meetingZoneId, privateZoneId, proximityGroupId } = inputs;
  if (paused || !officeId || !sessionKey) return null;
  const identity = { officeId, sessionKey };
  if (meetingZoneId) return { ...identity, kind: "meeting", id: meetingZoneId };
  if (privateZoneId) return { ...identity, kind: "private", id: privateZoneId };
  if (proximityGroupId) return { ...identity, kind: "proximity", id: proximityGroupId };
  return null;
}

export function voiceTargetKey(target: VoiceTarget | null): string {
  return JSON.stringify(target && [target.officeId, target.sessionKey, target.kind, target.id]);
}
