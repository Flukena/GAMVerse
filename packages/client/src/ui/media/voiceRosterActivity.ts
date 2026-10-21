import type { VoiceRosterActivity } from "./VoiceParticipantRoster";

export function readVoiceRosterActivity(participant: { name?: string; identity: string; trackPublications: Map<string, { source: unknown; track?: { source: unknown } | null; isMuted: boolean }> }): VoiceRosterActivity {
  const activity: VoiceRosterActivity = { microphone: false, camera: false, screenShare: false };
  for (const publication of participant.trackPublications.values()) {
    if (publication.isMuted) continue;
    const source = String(publication.source ?? publication.track?.source ?? "").toLocaleLowerCase();
    if (source.includes("microphone")) activity.microphone = true;
    else if (source.includes("screen")) activity.screenShare = true;
    else if (source.includes("camera")) activity.camera = true;
  }
  return activity;
}
