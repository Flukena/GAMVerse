import { randomBytes } from "node:crypto";

const PROXIMITY_GROUP_ID_BYTES = 12;
const MIN_PROXIMITY_GROUP_MEMBER_COUNT = 2;
type Membership = ReadonlyMap<string, ReadonlySet<string>>;

function connectedComponent(neighbors: Membership, sessionId: string, visited: Set<string>): Set<string> {
  const component = new Set<string>();
  const pending = [sessionId];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    component.add(current);
    for (const adjacent of neighbors.get(current) ?? []) {
      if (!visited.has(adjacent)) pending.push(adjacent);
    }
  }
  return component;
}

function retainedIncarnation(component: ReadonlySet<string>, previousBySessionId: ReadonlyMap<string, string>, previousMembers: Membership): string | undefined {
  const candidates = new Set<string>();
  for (const sessionId of component) {
    const groupId = previousBySessionId.get(sessionId);
    if (groupId) candidates.add(groupId);
  }
  let retainedId: string | undefined;
  let retainedMemberCount = 0;
  for (const groupId of candidates) {
    const members = previousMembers.get(groupId);
    if (!members || members.size <= retainedMemberCount) continue;
    // An old token stays safe only while every member of its incarnation
    // remains authorized here. Shrinks/splits must retire that incarnation.
    if (![...members].every(sessionId => component.has(sessionId))) continue;
    retainedId = groupId;
    retainedMemberCount = members.size;
  }
  return retainedId;
}

export function projectProximityGroups(neighbors: Membership, previousBySessionId: ReadonlyMap<string, string>, previousMembers: Membership) {
  const bySessionId = new Map<string, string>();
  const membersById = new Map<string, Set<string>>();
  const visited = new Set<string>();
  for (const [sessionId, nearby] of neighbors) {
    if (visited.has(sessionId) || nearby.size === 0) continue;
    const component = connectedComponent(neighbors, sessionId, visited);
    if (component.size < MIN_PROXIMITY_GROUP_MEMBER_COUNT) continue;
    const groupId = retainedIncarnation(component, previousBySessionId, previousMembers)
      ?? randomBytes(PROXIMITY_GROUP_ID_BYTES).toString("hex");
    membersById.set(groupId, component);
    for (const member of component) bySessionId.set(member, groupId);
  }
  return { bySessionId, membersById };
}
