import { useId, useRef } from "react";
import type { SignOutSnapshot } from "./signOutConfirmation";
import { WorkspaceDialog } from "./WorkspaceDialog";
import "./SignOutDialog.css";

const TITLE_LABEL = "Sign out?";
const DESCRIPTION_LABEL = "You’ll leave your current session and return to the sign-in screen.";
const CANCEL_LABEL = "Cancel";
const CONFIRM_LABEL = "Sign out";
const PENDING_LABEL = "Signing out…";
export type SignOutDialogProps = {
  state: SignOutSnapshot;
  onCancel(): void;
  onConfirm(): void;
};
export function SignOutDialog({ state, onCancel, onConfirm }: SignOutDialogProps) {
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  return <WorkspaceDialog labelledBy={`${id}-title`} onClose={onCancel} initialFocusRef={cancelRef} className="signout-dialog">
    <section aria-busy={state.pending} aria-describedby={`${id}-description`}>
      <h2 id={`${id}-title`}>{TITLE_LABEL}</h2>
      <p id={`${id}-description`}>{DESCRIPTION_LABEL}</p>
      {state.error && <p role="alert">{state.error}</p>}
      <footer>
        <button ref={cancelRef} type="button" disabled={state.pending} onClick={onCancel}>{CANCEL_LABEL}</button>
        <button type="button" className="signout-confirm" disabled={state.pending} onClick={onConfirm}>{state.pending ? PENDING_LABEL : CONFIRM_LABEL}</button>
      </footer>
    </section>
  </WorkspaceDialog>;
}
