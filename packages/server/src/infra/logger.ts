type LogFields = Record<string, string | number | boolean | null | undefined>;

function errorDetails(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { message: String(error) };
}

/** Write machine-readable server events without credentials or request bodies. */
export function logServerEvent(service: "api" | "realtime", event: string, fields: LogFields = {}) {
  console.info(JSON.stringify({ timestamp: new Date().toISOString(), level: "info", service, event, ...fields }));
}

export function logServerError(service: "api" | "realtime", event: string, error: unknown, fields: LogFields = {}) {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: "error", service, event, ...fields, error: errorDetails(error) }));
}
