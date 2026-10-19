import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { Room } from "@colyseus/sdk";
import { OFFICE_DESKS_CHANGED_EVENT } from "@gammyverse/shared";
import { DeskManagerController, type DeskManagerContext } from "./deskManager";
import { EMPTY_DESK_MANAGER_STATE } from "./deskManagerState";

export function useDeskManager(context: DeskManagerContext, room?: Room | null) {
  const [controller] = useState(() => new DeskManagerController());
  const state = useSyncExternalStore(controller.subscribe, () => controller.snapshot);
  const { endpoint, officeId, username, sessionKey, configVersion } = context;
  useLayoutEffect(() => {
    controller.configure({ endpoint, officeId, username, sessionKey, configVersion });
    void controller.refresh();
  }, [controller, endpoint, officeId, username, sessionKey, configVersion]);
  useLayoutEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => {
    if (!room) return;
    let active = true;
    const identity = { endpoint, officeId, username, sessionKey, configVersion };
    const dispose = room.onMessage(OFFICE_DESKS_CHANGED_EVENT, (payload: unknown) => { if (active) controller.confirmRealtime(payload, identity); });
    return () => { active = false; dispose(); };
  }, [controller, room, endpoint, officeId, username, sessionKey, configVersion]);
  return { ...(controller.matchesContext(context) ? state : EMPTY_DESK_MANAGER_STATE), refresh: controller.refresh, submit: controller.submit };
}
