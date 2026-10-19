import { useEffect, useMemo, useState } from "react";
import type { Room } from "@colyseus/sdk";
import type { OfficeDesk } from "@gammyverse/shared";
import { DeskAssignmentNoticeState, observeDeskAssignmentChanges } from "./deskAssignmentNotice";

export interface DeskAssignmentNoticeProps {
  room: Room | null;
  officeId: string | null;
  sessionKey: string | null;
  username: string | null;
  desks: readonly OfficeDesk[];
  configVersion: number;
  onRefresh(): void;
}
export function useDeskAssignmentNotice({ room, officeId, sessionKey, username, desks, configVersion, onRefresh }: DeskAssignmentNoticeProps) {
  const owner = useMemo(() => room && officeId && sessionKey && username ? new DeskAssignmentNoticeState({ officeId, sessionKey, username }) : null, [room, officeId, sessionKey, username]);
  const [accepted, setAccepted] = useState<{ owner: DeskAssignmentNoticeState; notice: string | null } | null>(null);
  useEffect(() => {
    if (!owner) return;
    owner.observe(desks, configVersion);
    setAccepted({ owner, notice: owner.notice });
  }, [owner, desks, configVersion]);
  useEffect(() => {
    if (!owner || !room) return;
    return observeDeskAssignmentChanges(owner, room, { changed: () => setAccepted({ owner, notice: owner.notice }), refresh: onRefresh });
  }, [owner, room, onRefresh]);
  const dismiss = () => { if (owner) { owner.dismiss(); setAccepted({ owner, notice: null }); } };
  return { notice: accepted?.owner === owner ? accepted.notice : null, dismiss };
}
