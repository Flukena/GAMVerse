import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { OfficeDesksController, type OfficeDesksContext, type OfficeDesksState } from "./officeDesks";

const EMPTY_DESKS_STATE: OfficeDesksState = { desks: [], configVersion: 0, pendingDeskId: null, loading: false, error: null };

export function useOfficeDesks(context: OfficeDesksContext) {
  const [controller] = useState(() => new OfficeDesksController());
  const snapshot = useSyncExternalStore(controller.subscribe, () => controller.snapshot);
  const { endpoint, officeId, username, sessionKey, configVersion } = context;
  useLayoutEffect(() => {
    controller.configure({ endpoint, officeId, username, sessionKey, configVersion });
    void controller.refresh();
  }, [controller, endpoint, officeId, username, sessionKey, configVersion]);
  useLayoutEffect(() => () => controller.configure({ endpoint: "", officeId: null, username: null, sessionKey: null, configVersion: 0 }), [controller]);
  const identitySnapshot = controller.matchesContext(context) ? snapshot : EMPTY_DESKS_STATE;
  const currentSnapshot = identitySnapshot.configVersion < configVersion ? { ...identitySnapshot, desks: [] } : identitySnapshot;
  return {
    ...currentSnapshot,
    ownDesk: currentSnapshot.desks.find(desk => desk.ownerUsername === username) ?? null,
    deskForZone: (zoneId: string) => currentSnapshot.desks.find(desk => desk.zoneId === zoneId) ?? null,
    refresh: controller.refresh,
    claim: controller.claim,
    unclaim: controller.unclaim,
  };
}
