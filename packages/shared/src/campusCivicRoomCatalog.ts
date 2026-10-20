import type { RoomPropDefinition } from "./roomPropTypes.js";

/** Freestanding presentation screens sized for the civic audience. */
export const CIVIC_ROOM_PROP_CATALOG: readonly RoomPropDefinition[] = [
  { asset: "office-civic-screen", label: "Meeting · Presentation screen", width: 6, depth: 1, height: 3.5, collision: false, geometry: "civic-room-screen", group: "Town Hall" },
  { asset: "office-townhall-screen", label: "Town Hall · Presentation screen", width: 12, depth: 1, height: 4.5, collision: false, geometry: "civic-room-screen", group: "Town Hall" },
];
