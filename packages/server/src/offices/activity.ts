import { database } from "../infra/db.js";

export type OfficeActivityType =
  | "office.join" | "office.leave"
  | "meeting.enter" | "meeting.leave"
  | "private.enter" | "private.leave"
  | "bubble.enter" | "bubble.leave"
  | "vehicle.enter" | "vehicle.leave";

export type OfficeActivityItem = {
  id: string;
  actorUsername: string;
  activityType: OfficeActivityType;
  locationName: string | null;
  occurredAt: Date;
};

let cleanupTimer: ReturnType<typeof setInterval> | undefined;
let lastCleanupAt = 0;

export async function recordOfficeActivity(
  officeId: string,
  actorUsername: string,
  activityType: OfficeActivityType,
  locationName: string | null = null,
) {
  if (!database) return;
  try {
    await database.query(
      `INSERT INTO app_office_activity(office_id, actor_username, activity_type, location_name)
       VALUES ($1, $2, $3, $4)`,
      [officeId, actorUsername, activityType, locationName],
    );
  } catch {
    console.warn("Could not record office activity.");
  }
}

export async function pruneOfficeActivity(now = Date.now()) {
  if (!database) return;
  await database.query("DELETE FROM app_office_activity WHERE occurred_at < $1", [new Date(now - 24 * 60 * 60 * 1000)]);
  lastCleanupAt = now;
}

export function startOfficeActivityCleanup() {
  if (!database || cleanupTimer) return;
  void pruneOfficeActivity().catch(() => console.warn("Office activity cleanup failed."));
  cleanupTimer = setInterval(() => {
    void pruneOfficeActivity().catch(() => console.warn("Office activity cleanup failed."));
  }, 60 * 60 * 1000);
  cleanupTimer.unref?.();
}

export async function listOfficeActivity(officeId: string, limit = 100): Promise<OfficeActivityItem[]> {
  if (!database) return [];
  if (Date.now() - lastCleanupAt >= 60 * 60 * 1000) {
    await pruneOfficeActivity().catch(() => undefined);
  }
  const result = await database.query<{
    id: string;
    actor_username: string;
    activity_type: OfficeActivityType;
    location_name: string | null;
    occurred_at: Date;
  }>(
    `SELECT id::text, actor_username, activity_type, location_name, occurred_at
     FROM app_office_activity
     WHERE office_id = $1 AND occurred_at >= now() - interval '24 hours'
     ORDER BY occurred_at DESC, id DESC
     LIMIT $2`,
    [officeId, Math.max(1, Math.min(200, Math.floor(limit)))],
  );
  return result.rows.map((row) => ({
    id: row.id,
    actorUsername: row.actor_username,
    activityType: row.activity_type,
    locationName: row.location_name,
    occurredAt: row.occurred_at,
  }));
}
