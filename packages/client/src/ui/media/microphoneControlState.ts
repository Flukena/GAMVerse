export type MicrophoneControlInput = {
  desiredMuted: boolean;
  actualMuted: boolean;
  connected: boolean;
  publishAllowed: boolean;
  unavailableReason: string | null;
  error: string | null;
};

const TURN_MICROPHONE_ON_LABEL = "Turn microphone on";
const TURN_MICROPHONE_OFF_LABEL = "Turn microphone off";
const MICROPHONE_ON_LABEL = "Microphone on";
const MICROPHONE_WAITING_LABEL = "Microphone on · waiting for a voice connection";
const MICROPHONE_CAPTURE_WAITING_LABEL = "Microphone on · waiting for microphone capture";
const MICROPHONE_CHOICE_SAVED_LABEL = "Your microphone choice is saved.";

export function microphoneControlState(input: MicrophoneControlInput) {
  const action = input.desiredMuted ? TURN_MICROPHONE_ON_LABEL : TURN_MICROPHONE_OFF_LABEL;
  if (input.desiredMuted) return { action, title: action, pending: false };
  if (!input.publishAllowed) {
    return { action, title: `${input.unavailableReason ?? MICROPHONE_WAITING_LABEL} ${MICROPHONE_CHOICE_SAVED_LABEL}`, pending: true };
  }
  if (!input.connected) return { action, title: MICROPHONE_WAITING_LABEL, pending: true };
  if (input.actualMuted) return { action, title: input.error ?? MICROPHONE_CAPTURE_WAITING_LABEL, pending: true };
  return { action, title: MICROPHONE_ON_LABEL, pending: false };
}
