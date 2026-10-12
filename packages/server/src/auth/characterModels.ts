import { randomUUID } from "node:crypto";
import { database } from "../infra/db.js";

const maxModelBytes = 10 * 1024 * 1024;
const maxModelsPerUser = 3;
const maxTotalBytesPerUser = 20 * 1024 * 1024;
const customIdPattern = /^custom-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CharacterModelSummary = { id: string; label: string; modelUrl: string };

export function isCustomCharacterId(value: unknown): value is string {
  return typeof value === "string" && customIdPattern.test(value);
}

export function validateGlb(model: Buffer): string | null {
  if (model.length < 20 || model.length > maxModelBytes) return "Model must be a GLB file no larger than 10 MiB.";
  if (model.readUInt32LE(0) !== 0x46546c67 || model.readUInt32LE(4) !== 2 || model.readUInt32LE(8) !== model.length) {
    return "This file is not a valid binary glTF 2.0 (GLB) model.";
  }
  let offset = 12;
  let json: Record<string, unknown> | null = null;
  let binaryLength = 0;
  let chunks = 0;
  while (offset < model.length) {
    if (offset + 8 > model.length) return "The GLB file has an incomplete chunk header.";
    const length = model.readUInt32LE(offset);
    const type = model.readUInt32LE(offset + 4);
    offset += 8;
    if (length % 4 !== 0 || length > model.length - offset) return "The GLB file has an invalid chunk length.";
    chunks++;
    if (chunks > 16) return "The GLB file contains too many chunks.";
    if (chunks === 1) {
      if (type !== 0x4e4f534a || length > 2 * 1024 * 1024) return "The GLB file must start with a small JSON chunk.";
      try {
        const parsed: unknown = JSON.parse(model.subarray(offset, offset + length).toString("utf8").replace(/\u0000+\s*$/, "").trim());
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "The GLB model metadata is invalid.";
        json = parsed as Record<string, unknown>;
      } catch {
        return "The GLB model metadata is invalid.";
      }
    } else if (type === 0x004e4942) {
      if (binaryLength) return "The GLB file contains multiple binary chunks.";
      binaryLength = length;
    } else if (type !== 0x4e4f534a) return "The GLB file contains an unsupported chunk.";
    offset += length;
  }
  if (!json || offset !== model.length) return "The GLB file is incomplete.";
  const asset = json.asset as { version?: unknown } | undefined;
  const nodes = json.nodes;
  const meshes = json.meshes;
  const buffers = json.buffers;
  if (asset?.version !== "2.0" || !Array.isArray(nodes) || nodes.length < 1 || nodes.length > 3000 || !Array.isArray(meshes) || meshes.length < 1 || meshes.length > 1000) {
    return "Choose a GLB model with a glTF 2.0 scene and meshes.";
  }
  if (Array.isArray(buffers)) {
    if (buffers.length > 1) return "The GLB model can contain only its embedded binary buffer.";
    for (const buffer of buffers) {
      if (!buffer || typeof buffer !== "object" || ("uri" in buffer && (typeof buffer.uri !== "string" || !buffer.uri.startsWith("data:")))) {
        return "The GLB model cannot reference external files.";
      }
      const byteLength = (buffer as { byteLength?: unknown }).byteLength;
      if (typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength > binaryLength) return "The GLB binary buffer is invalid.";
    }
  }
  const images = json.images;
  if (Array.isArray(images) && images.some((image) => !image || typeof image !== "object" || ("uri" in image && (typeof image.uri !== "string" || !image.uri.startsWith("data:"))))) {
    return "The GLB model cannot reference external image files.";
  }
  return null;
}

function databaseRequired() {
  if (!database) throw new Error("Custom character uploads require the database.");
  return database;
}

function modelSummary(id: string, label: string): CharacterModelSummary {
  return { id: `custom-${id}`, label, modelUrl: `/auth/models/custom-${id}/model` };
}

export async function listUserCharacterModels(username: string): Promise<CharacterModelSummary[]> {
  const db = databaseRequired();
  const result = await db.query<{ id: string; label: string }>(
    "SELECT id, label FROM app_user_character_models WHERE username = $1 ORDER BY created_at ASC, id ASC",
    [username],
  );
  return result.rows.map(({ id, label }) => modelSummary(id, label));
}

export async function uploadUserCharacterModel(username: string, labelValue: unknown, model: Buffer) {
  const db = databaseRequired();
  const error = validateGlb(model);
  if (error) return { error };
  const label = typeof labelValue === "string" ? labelValue.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 40) : "";
  if (!label) return { error: "Enter a model name up to 40 characters." };

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const owner = await client.query("SELECT username FROM app_users WHERE username = $1 FOR UPDATE", [username]);
    if (!owner.rowCount) { await client.query("ROLLBACK"); return { error: "Account not found." }; }
    const usage = await client.query<{ count: string; bytes: string }>(
      "SELECT count(*)::text AS count, COALESCE(sum(octet_length(model)), 0)::text AS bytes FROM app_user_character_models WHERE username = $1",
      [username],
    );
    const count = Number(usage.rows[0]?.count ?? 0);
    const bytes = Number(usage.rows[0]?.bytes ?? 0);
    if (count >= maxModelsPerUser || bytes + model.length > maxTotalBytesPerUser) {
      await client.query("ROLLBACK");
      return { error: "You can store up to 3 models and 20 MiB in total." };
    }
    const id = randomUUID();
    await client.query("INSERT INTO app_user_character_models(id, username, label, model) VALUES ($1, $2, $3, $4)", [id, username, label, model]);
    await client.query("COMMIT");
    return { model: modelSummary(id, label) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteUserCharacterModel(username: string, customId: string) {
  const db = databaseRequired();
  if (!isCustomCharacterId(customId)) return { error: "Model not found." };
  const id = customId.slice("custom-".length);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE app_users SET character_id = 'character-female-a' WHERE username = $1 AND custom_character_model_id = $2", [username, id]);
    const deleted = await client.query("DELETE FROM app_user_character_models WHERE id = $1 AND username = $2", [id, username]);
    await client.query("COMMIT");
    return deleted.rowCount ? { ok: true } : { error: "Model not found." };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getCharacterModel(customId: string): Promise<{ bytes: Buffer; label: string } | null> {
  const db = databaseRequired();
  if (!isCustomCharacterId(customId)) return null;
  const result = await db.query<{ model: Buffer; label: string }>("SELECT model, label FROM app_user_character_models WHERE id = $1", [customId.slice("custom-".length)]);
  const row = result.rows[0];
  return row ? { bytes: row.model, label: row.label } : null;
}

export async function userOwnsCharacterModel(username: string, customId: string): Promise<boolean> {
  const db = databaseRequired();
  if (!isCustomCharacterId(customId)) return false;
  const result = await db.query("SELECT 1 FROM app_user_character_models WHERE id = $1 AND username = $2", [customId.slice("custom-".length), username]);
  return Boolean(result.rowCount);
}
