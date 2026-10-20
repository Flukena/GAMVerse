import type { RoomPropDefinition } from "./roomPropTypes.js";

export const CIVIC_PARK_ASSETS = {
  water: "civic-park-water",
  path: "civic-park-path",
  bridge: "civic-park-bridge",
} as const;

/** Code-authored park surfaces; no additional third-party assets. */
export const CIVIC_PARK_PROP_CATALOG: readonly RoomPropDefinition[] = [
  { asset: CIVIC_PARK_ASSETS.water, label: "Park · Pond section", width: 6, depth: 8, height: 0.08, collision: true, geometry: "civic-park-water", editorRole: "map-component", group: "Park" },
  { asset: CIVIC_PARK_ASSETS.path, label: "Park · Paved path", width: 2, depth: 2, height: 0.035, collision: false, geometry: "civic-park-path", editorRole: "map-component", group: "Park" },
  { asset: CIVIC_PARK_ASSETS.bridge, label: "Park · Timber crossing", width: 2, depth: 2, height: 0.32, collision: false, geometry: "civic-park-bridge", editorRole: "map-component", group: "Park" },
];
