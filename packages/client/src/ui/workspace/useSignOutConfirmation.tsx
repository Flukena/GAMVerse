import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { SignOutConfirmation } from "./signOutConfirmation";
import { SignOutDialog } from "./SignOutDialog";

export function useSignOutConfirmation(endpoint: string, sessionKey: string | null, onSignedOut: () => void) {
  const [confirmation] = useState(() => new SignOutConfirmation());
  const state = useSyncExternalStore(confirmation.subscribe, confirmation.read);
  useLayoutEffect(() => () => confirmation.reset(), [confirmation, sessionKey]);
  const confirm = async () => {
    if (await confirmation.confirm(endpoint)) onSignedOut();
  };
  return {
    request: confirmation.request,
    dialog: state.open && <SignOutDialog state={state} onCancel={confirmation.cancel} onConfirm={() => void confirm()} />,
  };
}
