import { parentPort } from "node:worker_threads";
import { executeRouteSearch } from "./routeSearchExecution.js";
import { type RouteSearchSnapshot, type RouteWorkerMessage, type RouteWorkerResponse } from "./routeSearchProtocol.js";

if (!parentPort) throw new Error("Route search worker requires a parent port.");
const snapshots = new Map<string, RouteSearchSnapshot>();
const MAX_CACHED_SNAPSHOTS = 8;
parentPort.on("message", (message: RouteWorkerMessage) => {
  if (message.type === "shutdown") { parentPort?.close(); return; }
  if (message.type === "snapshot") {
    snapshots.delete(message.snapshot.roomId);
    snapshots.set(message.snapshot.roomId, message.snapshot);
    while (snapshots.size > MAX_CACHED_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value!);
    parentPort?.postMessage({ type: "snapshot-ready", roomId: message.snapshot.roomId, revision: message.snapshot.revision } satisfies RouteWorkerResponse);
    return;
  }
  const { request } = message;
  const snapshot = snapshots.get(request.roomId);
  if (!snapshot || snapshot.revision !== request.revision) {
    parentPort?.postMessage({ type: "error", requestId: request.requestId, message: "Route geometry snapshot is unavailable." } satisfies RouteWorkerResponse);
    return;
  }
  try {
    const result = executeRouteSearch(snapshot, request);
    parentPort?.postMessage({ type: "result", requestId: request.requestId, result } satisfies RouteWorkerResponse);
  } catch (error) {
    parentPort?.postMessage({ type: "error", requestId: request.requestId, message: error instanceof Error ? error.message : "Route search failed." } satisfies RouteWorkerResponse);
  }
});
