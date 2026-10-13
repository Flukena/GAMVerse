import { database } from "./db.js";

export type PlatformOperationsCounts = {
  accounts: number;
  suspendedAccounts: number;
  offices: number;
  activeOffices: number;
  officeActivityLast24Hours: number;
};

/** Aggregate platform counts only; never returns account, office, or activity records. */
export async function getPlatformOperationsCounts(): Promise<PlatformOperationsCounts> {
  if (!database) throw new Error("Database is not configured.");
  const result = await database.query<{
    accounts: string;
    suspended_accounts: string;
    offices: string;
    active_offices: string;
    office_activity_last_24_hours: string;
  }>(
    `SELECT
       (SELECT count(*) FROM app_users) AS accounts,
       (SELECT count(*) FROM app_users WHERE suspended_at IS NOT NULL) AS suspended_accounts,
       (SELECT count(*) FROM app_offices WHERE archived_at IS NULL) AS offices,
       (SELECT count(*) FROM app_offices WHERE archived_at IS NULL AND last_activity_at >= now() - interval '24 hours') AS active_offices,
       (SELECT count(*) FROM app_office_activity WHERE occurred_at >= now() - interval '24 hours') AS office_activity_last_24_hours`,
  );
  const row = result.rows[0];
  if (!row) throw new Error("Could not read platform operations counts.");
  return {
    accounts: Number(row.accounts),
    suspendedAccounts: Number(row.suspended_accounts),
    offices: Number(row.offices),
    activeOffices: Number(row.active_offices),
    officeActivityLast24Hours: Number(row.office_activity_last_24_hours),
  };
}
