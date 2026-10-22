import { useId, useRef, useState } from "react";
import { CUSTOM_STATUS_EMOJI_MAX_CODE_POINTS, CUSTOM_STATUS_TEXT_MAX_CODE_POINTS, type CustomStatus, type UserStatus } from "@gammyverse/shared";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { AvailabilityStatusPicker } from "./AvailabilityStatusPicker";
import { availabilityDraftCommand, STATUS_EXPIRY_OPTIONS, STATUS_PRESETS, type StatusExpiryChoice } from "./AvailabilityEditor";
import "./Availability.css";

const EDIT_STATUS_LABEL = "Set your status";
const STATUS_TEXT_LABEL = "Custom status";
const EMOJI_LABEL = "Emoji";
const EXPIRY_LABEL = "Clear custom status after";
const SAVE_LABEL = "Save status";
const SAVING_LABEL = "Saving…";
const CANCEL_LABEL = "Cancel";
const CLEAR_LABEL = "Clear custom status";
const INVALID_LABEL = "Check the text, emoji and expiry. Choose a new expiry if the previous status has expired.";
const POLICY_LABEL = "Your status lets others know your availability. Use the microphone button to turn your microphone on or off. Changing status keeps your microphone choice.";
export type AvailabilityDialogProps = {
  status: UserStatus;
  customStatus: CustomStatus | null;
  pending: boolean;
  error: string | null;
  onSave(status: UserStatus, customStatus: CustomStatus | null): void;
  onClose(): void;
};

export function AvailabilityDialog(props: AvailabilityDialogProps) {
  const id = useId();
  const textRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState(props.status);
  const [text, setText] = useState(props.customStatus?.text ?? "");
  const [emoji, setEmoji] = useState(props.customStatus?.emoji ?? "");
  const [expiry, setExpiry] = useState<StatusExpiryChoice>(props.customStatus ? "keep" : "never");
  const [validationError, setValidationError] = useState(false);
  const close = () => { if (!props.pending) props.onClose(); };
  const save = () => {
    const command = availabilityDraftCommand(status, text, emoji, expiry, props.customStatus, Date.now());
    setValidationError(command === null);
    if (command) props.onSave(command.status, command.customStatus ?? null);
  };
  return <WorkspaceDialog labelledBy={`${id}-title`} onClose={close} initialFocusRef={textRef} className="availability-dialog">
    <form onSubmit={(event) => { event.preventDefault(); save(); }} aria-busy={props.pending}>
      <h2 id={`${id}-title`}>{EDIT_STATUS_LABEL}</h2>
      <fieldset disabled={props.pending}>
        <AvailabilityStatusPicker status={status} onChange={setStatus} />
        <p className="availability-policy">{POLICY_LABEL}</p>
        <label htmlFor={`${id}-text`}>{STATUS_TEXT_LABEL}</label>
        <input ref={textRef} id={`${id}-text`} value={text} onChange={(event) => setText(event.target.value)} aria-describedby={`${id}-text-limit`} />
        <small id={`${id}-text-limit`}>{Array.from(text).length}/{CUSTOM_STATUS_TEXT_MAX_CODE_POINTS}</small>
        <label htmlFor={`${id}-emoji`}>{EMOJI_LABEL}</label>
        <input id={`${id}-emoji`} value={emoji} onChange={(event) => setEmoji(event.target.value)} aria-describedby={`${id}-emoji-limit`} />
        <small id={`${id}-emoji-limit`}>{Array.from(emoji).length}/{CUSTOM_STATUS_EMOJI_MAX_CODE_POINTS}</small>
        <div className="availability-presets">{STATUS_PRESETS.map((preset) => <button type="button" key={preset.text} onClick={() => { setText(preset.text); setEmoji(preset.emoji); }}>{preset.emoji} {preset.text}</button>)}</div>
        <label htmlFor={`${id}-expiry`}>{EXPIRY_LABEL}</label>
        <select id={`${id}-expiry`} value={expiry} onChange={(event) => {
          const option = STATUS_EXPIRY_OPTIONS.find((item) => item.value === event.target.value);
          if (option) setExpiry(option.value);
        }}>{STATUS_EXPIRY_OPTIONS.filter((option) => props.customStatus || option.value !== "keep").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        <button type="button" onClick={() => { setText(""); setEmoji(""); }}>{CLEAR_LABEL}</button>
      </fieldset>
      {(props.error || validationError) && <p className="availability-error" role="alert">{props.error ?? INVALID_LABEL}</p>}
      <footer><button type="button" disabled={props.pending} onClick={close}>{CANCEL_LABEL}</button><button type="submit" disabled={props.pending}>{props.pending ? SAVING_LABEL : SAVE_LABEL}</button></footer>
    </form>
  </WorkspaceDialog>;
}
