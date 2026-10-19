export const OFFICE_ID_VISIBLE_LENGTH = 8;
export const OFFICE_ID_COPIED_LABEL = "Office ID copied.";
export const OFFICE_ID_COPY_MANUALLY_LABEL = "Clipboard unavailable. Select the office ID and copy it manually.";

export type OfficeIdCopyStatus = "idle" | "copied" | "failed";

/** Copy outcome is always announced; silence would hide a failed clipboard write. */
export function officeIdCopyMessage(status: OfficeIdCopyStatus): string {
  if (status === "copied") return OFFICE_ID_COPIED_LABEL;
  if (status === "failed") return OFFICE_ID_COPY_MANUALLY_LABEL;
  return "";
}

export type OfficeIdDisplay = {
  /** Short, always-visible form of the stable office id. */
  text: string;
  /** Full id, used for the tooltip, the accessible name and the clipboard. */
  fullId: string;
  truncated: boolean;
  label: string;
  title: string;
};

export function officeIdDisplay(id: string): OfficeIdDisplay {
  const fullId = id.trim();
  const truncated = fullId.length > OFFICE_ID_VISIBLE_LENGTH;
  return {
    text: truncated ? `${fullId.slice(0, OFFICE_ID_VISIBLE_LENGTH)}…` : fullId,
    fullId,
    truncated,
    label: `Copy office ID ${fullId}`,
    title: `Office ID ${fullId}`,
  };
}

/** Names repeated across the visible offices need their id to stay identifiable. */
export function duplicateOfficeNames(offices: readonly { name: string }[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const office of offices) {
    const name = office.name.trim().toLowerCase();
    if (seen.has(name)) duplicates.add(name);
    else seen.add(name);
  }
  return duplicates;
}

export function hasDuplicateOfficeName(offices: readonly { name: string }[], name: string): boolean {
  return duplicateOfficeNames(offices).has(name.trim().toLowerCase());
}
