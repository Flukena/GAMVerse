import { OFFICE_DESKS_CHANGED_EVENT, type RoomLayout } from "@gammyverse/shared";

export function affectedDeskOwners(previous: RoomLayout, next: RoomLayout): Set<string> {
  const owners = new Map(previous.zones.filter(zone => zone.kind === "private").map(zone => [zone.id, zone.ownerUsername]));
  const nextOwners = new Map(next.zones.filter(zone => zone.kind === "private").map(zone => [zone.id, zone.ownerUsername]));
  const affected = new Set<string>();
  for (const zoneId of new Set([...owners.keys(), ...nextOwners.keys()])) {
    const before = owners.get(zoneId);
    const after = nextOwners.get(zoneId);
    if (before === after) continue;
    if (before) affected.add(before);
    if (after) affected.add(after);
  }
  return affected;
}

type NoticeClient = { sessionId: string; send(event: string, payload: unknown): void };
export function sendDeskAssignmentNotices(clients: readonly NoticeClient[], usernames: ReadonlyMap<string, string>, affected: ReadonlySet<string>, officeId: string, configVersion: number) {
  for (const client of clients) {
    const username = usernames.get(client.sessionId);
    if (username && affected.has(username)) client.send(OFFICE_DESKS_CHANGED_EVENT, { officeId, configVersion });
  }
}
