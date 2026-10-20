import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve the separately emitted worker in production and its TS source in dev. */
export function resolveRouteSearchWorkerPath(moduleUrl: string, exists: (path: string) => boolean = existsSync) {
  const moduleDir = dirname(fileURLToPath(moduleUrl));
  const candidates = [
    join(moduleDir, "routeSearchWorker.js"),
    join(moduleDir, "offices", "routeSearchWorker.js"),
    join(moduleDir, "..", "..", "dist", "routeSearchWorker.js"),
    join(moduleDir, "routeSearchWorker.ts"),
    join(moduleDir, "offices", "routeSearchWorker.ts"),
  ];
  return candidates.find(exists) ?? candidates[0]!;
}
