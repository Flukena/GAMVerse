import { defaultAvailability, effectiveAvailability, type AvailabilityProfile, type UserStatus } from "@gammyverse/shared";
import type { Pool } from "pg";
import { database } from "../infra/db.js";
import { getOfficeRole } from "./repository.js";

const AVAILABILITY_ACCESS_DENIED_LABEL = "Office availability access denied.";
const AVAILABILITY_STORAGE_REQUIRED_LABEL = "Saving availability requires PostgreSQL.";
export class AvailabilityAccessError extends Error {}
type AvailabilityRow = { status: UserStatus; custom_status_text: string; custom_status_emoji: string; custom_status_expires_at: Date | null };
type RoleLookup = (username: string, officeId: string, maintainer?: boolean) => Promise<string | null>;
export class AvailabilityRepository {
  constructor(private readonly store: Pick<Pool, "query"> | null = database, private readonly role: RoleLookup = getOfficeRole) {}
  private async authorize(username: string, officeId: string, maintainer: boolean) {
    if (!await this.role(username, officeId, maintainer)) throw new AvailabilityAccessError(AVAILABILITY_ACCESS_DENIED_LABEL);
  }
  async load(username: string, officeId: string, maintainer = false): Promise<AvailabilityProfile> {
    await this.authorize(username, officeId, maintainer);
    if (!this.store) return defaultAvailability();
    const result = await this.store.query<AvailabilityRow>(
      "SELECT status, custom_status_text, custom_status_emoji, custom_status_expires_at FROM app_office_user_availability WHERE office_id=$1 AND username=$2", [officeId, username]);
    const row = result.rows[0];
    if (!row) return defaultAvailability();
    const customStatus = row.custom_status_text || row.custom_status_emoji ? {
      text: row.custom_status_text, emoji: row.custom_status_emoji, expiresAtMs: row.custom_status_expires_at?.getTime() ?? null,
    } : null;
    return effectiveAvailability({ status: row.status, customStatus });
  }
  async save(username: string, officeId: string, profile: AvailabilityProfile, maintainer = false): Promise<void> {
    await this.authorize(username, officeId, maintainer);
    if (!this.store) throw new Error(AVAILABILITY_STORAGE_REQUIRED_LABEL);
    await this.store.query(
      `INSERT INTO app_office_user_availability(office_id,username,status,custom_status_text,custom_status_emoji,custom_status_expires_at)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(office_id,username) DO UPDATE SET
       status=EXCLUDED.status,custom_status_text=EXCLUDED.custom_status_text,custom_status_emoji=EXCLUDED.custom_status_emoji,
       custom_status_expires_at=EXCLUDED.custom_status_expires_at,updated_at=now()
       WHERE (app_office_user_availability.status,app_office_user_availability.custom_status_text,
       app_office_user_availability.custom_status_emoji,app_office_user_availability.custom_status_expires_at)
       IS DISTINCT FROM (EXCLUDED.status,EXCLUDED.custom_status_text,EXCLUDED.custom_status_emoji,EXCLUDED.custom_status_expires_at)`,
      [officeId, username, profile.status, profile.customStatus?.text ?? "", profile.customStatus?.emoji ?? "",
        profile.customStatus?.expiresAtMs == null ? null : new Date(profile.customStatus.expiresAtMs)]);
  }
}
