import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { OfficeShareLinks, type ShareOffice } from "./officeShareLinks";
import { ShareOfficeDialog } from "./ShareOfficeDialog";

export function useOfficeShareLinks(endpoint: string, origin: string, sessionKey: string | null) {
  const [shares] = useState(() => new OfficeShareLinks(endpoint, origin));
  const state = useSyncExternalStore(shares.subscribe, shares.read);
  useLayoutEffect(() => () => shares.close(), [shares, sessionKey]);
  return {
    open: (office: ShareOffice) => { void shares.open(office); },
    dialog: state.office && <ShareOfficeDialog state={state} onClose={shares.close} onCreate={() => void shares.create()}
      onCopy={() => void shares.copy(url => navigator.clipboard.writeText(url))} onRevoke={id => void shares.revoke(id)} onRefresh={() => void shares.refresh()} />,
  };
}
