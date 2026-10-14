import {
  CHAT_PAGE_SIZE,
  CHAT_RETENTION_PER_OFFICE,
  type ChatMessage,
} from "@gammyverse/shared";
import type { Pool } from "pg";
import { database } from "../infra/db.js";
import { getOfficeRole } from "./repository.js";
export type ChatRow = {
  id: string;
  office_id: string;
  scope: "office" | "dm";
  sender_username: string;
  recipient_username: string | null;
  body: string;
  created_at: Date;
};
export class ChatHistoryAuthorizationError extends Error {}
function messageFromRow(row: ChatRow): ChatMessage {
  return {
    id: String(row.id),
    officeId: row.office_id,
    scope: row.scope,
    senderUsername: row.sender_username,
    ...(row.recipient_username
      ? { recipientUsername: row.recipient_username }
      : {}),
    text: row.body,
    createdAt: row.created_at.toISOString(),
  };
}
export async function persistChatMessage(
  message: ChatMessage,
  pool: Pick<Pool, "connect"> | null = database,
) {
  if (!pool) throw new Error("Chat requires PostgreSQL.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM app_offices WHERE id=$1 FOR UPDATE", [
      message.officeId,
    ]);
    const result = await client.query<{
      id: string;
      created_at: Date;
    }>(
      "INSERT INTO app_office_chat_messages(office_id,scope,sender_username,recipient_username,body) VALUES($1,$2,$3,$4,$5) RETURNING id, created_at",
      [
        message.officeId,
        message.scope,
        message.senderUsername,
        message.recipientUsername ?? null,
        message.text,
      ],
    );
    const count = await client.query<{ count: string }>(
      "SELECT count(*) AS count FROM app_office_chat_messages WHERE office_id=$1",
      [message.officeId],
    );
    if (Number(count.rows[0]!.count) > CHAT_RETENTION_PER_OFFICE) {
      await client.query(
        "DELETE FROM app_office_chat_messages WHERE office_id=$1 AND id <= (SELECT id FROM app_office_chat_messages WHERE office_id=$1 ORDER BY id ASC LIMIT 1 OFFSET $2)",
        [
          message.officeId,
          Number(count.rows[0]!.count) - CHAT_RETENTION_PER_OFFICE - 1,
        ],
      );
    }
    await client.query("COMMIT");
    return {
      id: String(result.rows[0]!.id),
      createdAt: result.rows[0]!.created_at.toISOString(),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function chatHistory(
  username: string,
  officeId: string,
  scope: unknown,
  target: unknown,
  before: unknown,
  store: Pick<Pool, "query"> | null = database,
  role: (
    user: string,
    office: string,
  ) => Promise<string | null> = getOfficeRole,
) {
  if (!store) throw new Error("Chat history requires PostgreSQL.");
  const conversationScope = await authorizeHistory(
    username,
    officeId,
    scope,
    target,
    before,
    role,
  );
  if (
    !(await validConversationCursor(
      store,
      username,
      officeId,
      conversationScope,
      target,
      before,
    ))
  )
    return [];
  const result = await store.query<ChatRow>(
    `WITH conversation AS (SELECT * FROM app_office_chat_messages WHERE office_id=$1 AND scope=$2 AND ($2='office' OR (sender_username=$3 AND recipient_username=$4) OR (sender_username=$4 AND recipient_username=$3))) SELECT * FROM conversation WHERE ($5::bigint IS NULL OR (EXISTS(SELECT 1 FROM conversation WHERE id=$5::bigint) AND id<$5::bigint)) ORDER BY id DESC LIMIT $6`,
    [officeId, scope, username, target ?? null, before ?? null, CHAT_PAGE_SIZE],
  );
  return result.rows
    .filter((row) =>
      chatRowInConversation(row, username, officeId, conversationScope, target),
    )
    .slice(0, CHAT_PAGE_SIZE)
    .map(messageFromRow)
    .reverse();
}
function chatRowInConversation(
  row: ChatRow,
  username: string,
  officeId: string,
  scope: string,
  target: unknown,
) {
  if (row.office_id !== officeId || row.scope !== scope) return false;
  if (scope === "office") return true;
  return (
    (row.sender_username === username && row.recipient_username === target) ||
    (row.sender_username === target && row.recipient_username === username)
  );
}

async function authorizeHistory(
  username: string,
  officeId: string,
  scope: unknown,
  target: unknown,
  before: unknown,
  role: (user: string, office: string) => Promise<string | null>,
) {
  if (!(await role(username, officeId)))
    throw new ChatHistoryAuthorizationError("Office access denied.");
  if (scope !== "office" && scope !== "dm")
    throw new ChatHistoryAuthorizationError("Invalid chat scope.");
  if (
    scope === "dm" &&
    (typeof target !== "string" || !(await role(target, officeId)))
  )
    throw new ChatHistoryAuthorizationError(
      "Recipient is not an office member.",
    );
  if (
    before !== undefined &&
    (typeof before !== "string" || !/^\d+$/.test(before))
  )
    throw new ChatHistoryAuthorizationError("Invalid chat cursor.");
  return scope;
}

async function validConversationCursor(
  store: Pick<Pool, "query">,
  username: string,
  officeId: string,
  scope: string,
  target: unknown,
  before: unknown,
) {
  if (before === undefined) return true;
  const cursor = await store.query<ChatRow>(
    "SELECT * FROM app_office_chat_messages WHERE office_id=$1 AND id=$2::bigint",
    [officeId, before],
  );
  return cursor.rows.some(
    (row) =>
      chatRowInConversation(row, username, officeId, scope, target) &&
      String(row.id) === before,
  );
}
