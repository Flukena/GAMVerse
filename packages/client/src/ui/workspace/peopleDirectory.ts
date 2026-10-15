import type { UserStatus } from "@gammyverse/shared";
import type { CustomStatusFields } from "./AvailabilityPresentation";

export type DirectoryPerson = CustomStatusFields & {
  username: string;
  displayName: string;
  characterId?: string;
  presence: "online" | "away" | "offline";
  status: UserStatus;
  nearby: boolean;
  handRaised: boolean;
};

export type DirectoryEntry = readonly [string, DirectoryPerson];
type DirectoryGroupId = "you" | "nearby" | "office" | "reconnecting" | "offline";
export type DirectoryGroup = { id: DirectoryGroupId; label: string; people: DirectoryEntry[] };

const DIRECTORY_GROUPS: ReadonlyArray<readonly [DirectoryGroupId, string]> = [
  ["you", "You"], ["nearby", "Nearby"], ["office", "In the office"], ["reconnecting", "Reconnecting"], ["offline", "Offline"],
];
const PRESENCE_LABELS: Record<DirectoryPerson["status"], string> = {
  available: "In the office", "do-not-disturb": "Do not disturb", "in-meeting": "In meeting",
  away: "Away", toilet: "Toilet", lunch: "Lunch", "coffee-break": "Coffee break",
};
const OFFLINE_LABEL = "Offline";
const RECONNECTING_LABEL = "Reconnecting";
const NEARBY_LABEL = "Nearby";

function directoryGroupId([sessionId, person]: DirectoryEntry, localSessionId: string | null): DirectoryGroupId {
  if (person.presence === "offline") return "offline";
  if (person.presence === "away") return "reconnecting";
  if (sessionId === localSessionId) return "you";
  return person.nearby ? "nearby" : "office";
}

export function personPresenceLabel(person: DirectoryPerson): string {
  if (person.presence === "offline") return OFFLINE_LABEL;
  if (person.presence === "away") return RECONNECTING_LABEL;
  if (person.status !== "available") return PRESENCE_LABELS[person.status];
  return person.nearby ? NEARBY_LABEL : PRESENCE_LABELS.available;
}

export function buildPeopleDirectory(people: readonly DirectoryEntry[], localSessionId: string | null, query: string): DirectoryGroup[] {
  const search = query.trim().toLocaleLowerCase();
  const groups = DIRECTORY_GROUPS.map(([id, label]): DirectoryGroup => ({ id, label, people: [] }));
  const byId = new Map(groups.map((group) => [group.id, group]));
  for (const entry of people) {
    const [sessionId, person] = entry;
    const searchText = `${person.displayName} ${person.username} ${sessionId === localSessionId ? "You" : ""}`;
    if (!searchText.toLocaleLowerCase().includes(search)) continue;
    byId.get(directoryGroupId(entry, localSessionId))?.people.push(entry);
  }
  return groups.filter((group) => group.people.length > 0);
}

export type OfficeDirectoryMember = { username: string };

export function mergeOfficeDirectory(people: readonly DirectoryEntry[], members: readonly OfficeDirectoryMember[]): DirectoryEntry[] {
  const liveByUsername = new Map<string, DirectoryEntry>();
  for (const entry of people) {
    const previous = liveByUsername.get(entry[1].username);
    if (!previous || entry[1].presence === "online") liveByUsername.set(entry[1].username, entry);
  }
  return members.map(({ username }) => liveByUsername.get(username) ?? [
    `offline:${username}`, { username, displayName: username, presence: "offline", status: "available", nearby: false, handRaised: false },
  ]);
}
