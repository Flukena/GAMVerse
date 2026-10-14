export function voiceParticipantUsername(participant: {
  name?: string;
  identity: string;
}): string {
  return (
    participant.name?.trim() ||
    participant.identity.replace(/-[a-f0-9]{16}$/i, "")
  ).toLocaleLowerCase();
}
