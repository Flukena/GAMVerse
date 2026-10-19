import { USER_STATUSES, type CustomStatus } from "@gammyverse/shared";
import { USER_STATUS_PRESENTATIONS } from "../../presencePresentation";

export const AVAILABILITY_OPTIONS = USER_STATUSES.map(value => ({ value, ...USER_STATUS_PRESENTATIONS[value] }));

export type CustomStatusFields = {
  customStatusText?: string;
  customStatusEmoji?: string;
  customStatusExpiresAtMs?: number;
};

export function customStatusFromFields(person: CustomStatusFields): CustomStatus | null {
  const text = person.customStatusText ?? "";
  const emoji = person.customStatusEmoji ?? "";
  if (!text && !emoji) return null;
  return { text, emoji, expiresAtMs: person.customStatusExpiresAtMs || null };
}

export function customStatusLabel(person: CustomStatusFields, nowMs = Date.now()): string | null {
  const status = customStatusFromFields(person);
  if (!status || (status.expiresAtMs !== null && status.expiresAtMs <= nowMs)) return null;
  return [status.emoji, status.text].filter(Boolean).join(" ");
}
