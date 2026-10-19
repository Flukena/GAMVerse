import type { RoomLayout } from "@gammyverse/shared";

const CREATE_FAILED = "Could not create office.";
const MAP_FAILED = "Office created, but its generated map could not be saved";
const PROPS_FAILED = "Office created and map saved, but its furniture could not be saved";
const MAP_HINT = "Please open Edit map and save the layout again.";
const PROPS_HINT = "Please open Edit map and save the props again.";
const FIRST_CONFIG_VERSION = 1;

export type CreatedOffice = { id: string; name: string; ownerUsername: string; role: "owner" | "admin" | "user" | "maintainer" };
export type CreateOfficeRequest = { endpoint: string; name: string; layout: RoomLayout; fetcher?: typeof fetch };
/** `office` is set as soon as the office row exists, even when a later step fails. */
export type CreateOfficeOutcome =
  | { ok: true; office: CreatedOffice }
  | { ok: false; office: CreatedOffice | null; error: string };

async function readJson(response: Response) {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

function failureText(body: Record<string, unknown>, fallback: string) {
  return typeof body.error === "string" && body.error.length > 0 ? body.error : fallback;
}

/**
 * Creation is three server steps: the office row, its map, then its props.
 * Map and prop persistence stay on separate versioned endpoints, so the props
 * request always carries the furniture from the same generated draft.
 */
export async function createOfficeWithLayout(request: CreateOfficeRequest): Promise<CreateOfficeOutcome> {
  const call = request.fetcher ?? fetch;
  const json = { "Content-Type": "application/json" };
  let office: CreatedOffice | null = null;
  try {
    const created = await call(`${request.endpoint}/offices`, {
      method: "POST", credentials: "include", headers: json, body: JSON.stringify({ name: request.name }),
    });
    const createdBody = await readJson(created);
    const createdOffice = createdBody.office as CreatedOffice | undefined;
    if (!created.ok || !createdOffice) return { ok: false, office: null, error: failureText(createdBody, CREATE_FAILED) };
    office = createdOffice;

    const mapResponse = await call(`${request.endpoint}/offices/${office.id}/map`, {
      method: "PUT", credentials: "include", headers: json,
      body: JSON.stringify({ version: 1, configVersion: FIRST_CONFIG_VERSION, layout: request.layout }),
    });
    const mapBody = await readJson(mapResponse);
    if (!mapResponse.ok || !mapBody.config) return { ok: false, office, error: `${MAP_FAILED}: ${failureText(mapBody, MAP_HINT)}` };

    const propsResponse = await call(`${request.endpoint}/offices/${office.id}/props`, {
      method: "PUT", credentials: "include", headers: json,
      body: JSON.stringify({ configVersion: FIRST_CONFIG_VERSION, props: request.layout.props }),
    });
    const propsBody = await readJson(propsResponse);
    if (!propsResponse.ok) return { ok: false, office, error: `${PROPS_FAILED}: ${failureText(propsBody, PROPS_HINT)}` };
    const savedProps = Array.isArray(propsBody.props) ? propsBody.props.length : 0;
    // A furnished draft that comes back without its furniture is a failure, not
    // a silent empty office.
    if (request.layout.props.length > 0 && savedProps !== request.layout.props.length) {
      return { ok: false, office, error: `${PROPS_FAILED}: the server stored ${savedProps} of ${request.layout.props.length} items. ${PROPS_HINT}` };
    }
    return { ok: true, office };
  } catch (cause) {
    return { ok: false, office, error: cause instanceof Error ? cause.message : CREATE_FAILED };
  }
}
