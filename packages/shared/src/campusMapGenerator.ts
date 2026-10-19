import { MAX_OFFICE_PROPS } from "./officePropLimits.js";
import { placeCampusFinishedBuildings } from "./campusFinishedBuildings.js";
import { campusRestroomFixtures } from "./campusFurnishingTemplates.js";
import { planRoadConnectors, roadsideVergePoints } from "./campusRoadNetwork.js";
import { ROOM_PROP_CATALOG, type RoomLayout, type RoomLayoutDoor, type RoomLayoutProp, type RoomLayoutWall, type RoomLayoutZone } from "./roomLayout.js";

export interface CampusMapGeneratorInputs {
  totalPeople: number;
  peoplePerTeam: number;
  teamCount: number;
  /** Optional seed for repeatable map previews and tests. */
  seed?: number;
}

export interface GeneratedCampusMap {
  layout: RoomLayout;
  dimensions: { width: number; depth: number };
  privateRoomCount: number;
  teamCount: number;
}

const ROOM_SIZE = 8;
const TEAM_WIDTH = ROOM_SIZE * 4;
const TEAM_GAP = 4;
const CENTRAL_ROAD = 8;
const MAP_DEPTH = 260;
const TOP_TEAM_START_Z = -104;
const BOTTOM_TEAM_START_Z = 60;
const MEETING_EDGE_ROAD_Z = 108;
// Meeting rooms fit a team around two table groups; anything larger wastes
// outdoor space that the street network and finished buildings now use.
const MEETING_ROOM_WIDTH_M = 24;
const MEETING_ROOM_DEPTH_M = 14;
const SMALL_MEETING_WIDTH_M = 20;
const SMALL_MEETING_DEPTH_M = 16;
const OUTDOOR_FLOOR_COVERAGE = 0.09;
// Street furniture rhythm along the kerb, in metres.
const STREET_LIGHT_SPACING_M = 18;
const STREET_BIN_SPACING_M = 24;
const STREET_FURNITURE_OFFSET_M = 1.2;
const STREET_LIGHT_LIMIT = 120;
// Landscaping keeps this much distance from a finished building's walls.
const FINISHED_BUILDING_PLANTING_CLEARANCE_M = 0.9;
const COLORS = ["#ffb703", "#fb8500", "#219ebc", "#8ecae6", "#70c1b3", "#b8a1d9", "#e5989b", "#84a59d", "#f6bd60", "#90be6d"];
// Lightened tints of brand palette colors 2–5 for generated room walls.
const TEMPLATE_WALL_COLORS = ["#63bbd0", "#acd8ec", "#ffcf5c", "#fcaa4d"];
// Simple structural assets are suitable for private offices. The more
// distinctive themed walls remain exclusive to meeting rooms.
export const TEMPLATE_PRIVATE_WALL_ASSETS = [
  "kit-building-kit-wall-half",
  "poly-kitchen-wall-plain",
  "poly-kitchen-wall-plain-detail",
  "external-pixel-modern-office-pixel-modern-office-wall-bay-plain-0439b504",
  "external-pixel-modern-office-pixel-modern-office-wall-bay-window-84074f90",
  "external-pixel-modern-office-pixel-modern-office-glass-partition-bay-9eb53e0c",
  "external-cozy-home-interiors-cozy-home-interiors-wall-straight-1m-36e278fd",
  "external-cozy-home-interiors-cozy-home-interiors-wall-straight-2m-c96dba78",
  "external-cozy-home-interiors-cozy-home-interiors-wall-straight-3m-761deb7a",
  "external-cozy-home-interiors-cozy-home-interiors-wall-window-2m-c5997f2f",
  "external-cozy-home-interiors-cozy-home-interiors-wall-window-1m-8154ce2d",
] as const satisfies readonly NonNullable<RoomLayoutWall["asset"]>[];

/** Stable wall asset assignment for a generated private room, if it gets one. */
export function templatePrivateWallAsset(privateRoomIndex: number) {
  return privateRoomIndex % 2 === 0
    ? TEMPLATE_PRIVATE_WALL_ASSETS[Math.floor(privateRoomIndex / 2) % TEMPLATE_PRIVATE_WALL_ASSETS.length]
    : undefined;
}

// Themed walls can be visually busy when repeated across private offices;
// use them only in meeting rooms where a stronger identity helps.
const TEMPLATE_MEETING_WALL_ASSETS = [
  "kit-building-kit-wall-half",
  "poly-kitchen-wall-plain",
  "poly-kitchen-wall-plain-detail",
  "poly-kitchen-wall-tiles",
  "poly-kitchen-wall-tiles-w",
  "quaternius-sushi-wall-normal",
  "quaternius-sushi-wall-redwood",
  "quaternius-sushi-wall-shelves",
  "quaternius-sushi-wall-shoji",
  "quaternius-sushi-wall-shoji-interior",
  "external-pixel-modern-office-pixel-modern-office-wall-bay-plain-0439b504",
  "external-pixel-modern-office-pixel-modern-office-wall-bay-window-84074f90",
  "external-pixel-modern-office-pixel-modern-office-glass-partition-bay-9eb53e0c",
  "external-cozy-home-interiors-cozy-home-interiors-wall-straight-1m-36e278fd",
  "external-cozy-home-interiors-cozy-home-interiors-wall-straight-2m-c96dba78",
  "external-cozy-home-interiors-cozy-home-interiors-wall-straight-3m-761deb7a",
  "external-cozy-home-interiors-cozy-home-interiors-wall-window-2m-c5997f2f",
  "external-cozy-home-interiors-cozy-home-interiors-wall-window-1m-8154ce2d",
] as const satisfies readonly NonNullable<RoomLayoutWall["asset"]>[];

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function addZone(layout: RoomLayout, zone: RoomLayoutZone, doorSide: "north" | "east" | "south" | "west" = "south") {
  const wallColor = TEMPLATE_WALL_COLORS[layout.zones.length % TEMPLATE_WALL_COLORS.length]!;
  const privateRoomIndex = layout.zones.filter((item) => item.kind === "private").length;
  const meetingWallAsset = zone.kind === "meeting"
    ? TEMPLATE_MEETING_WALL_ASSETS[layout.zones.length % TEMPLATE_MEETING_WALL_ASSETS.length]!
    : undefined;
  // Alternate private offices between a single fitted asset accent wall and
  // the soft color palette. The other three walls stay simple and light.
  const privateWallAsset = zone.kind === "private" ? templatePrivateWallAsset(privateRoomIndex) : undefined;
  const oppositeDoorSide = { north: "south", east: "west", south: "north", west: "east" } as const;
  const accentSide = oppositeDoorSide[doorSide];
  layout.zones.push(zone);
  const halfW = zone.width / 2;
  const halfD = zone.depth / 2;
  const inset = 0.09;
  const wallBase = zone.id;
  const entranceWallId = `${wallBase}-wall-${doorSide[0]}`;
  const makeWall = (side: "n" | "e" | "w" | "s", axis: RoomLayoutWall["axis"], x: number, z: number, length: number): RoomLayoutWall => {
    const asset = zone.kind === "private"
      ? (side === accentSide[0] ? privateWallAsset : undefined)
      : meetingWallAsset;
    return { id: `${wallBase}-wall-${side}`, axis, x, z, length, thickness: 0.18, height: 2.5, color: wallColor, ...(asset ? { asset } : {}) };
  };
  const walls: RoomLayoutWall[] = [
    makeWall("n", "horizontal", zone.x, zone.z - halfD + inset, zone.width),
    makeWall("e", "vertical", zone.x + halfW - inset, zone.z, zone.depth),
    makeWall("w", "vertical", zone.x - halfW + inset, zone.z, zone.depth),
    makeWall("s", "horizontal", zone.x, zone.z + halfD - inset, zone.width),
  ];
  if (doorSide === "east") walls[1]!.id = entranceWallId;
  else if (doorSide === "north") walls[0]!.id = entranceWallId;
  else if (doorSide === "west") walls[2]!.id = entranceWallId;
  layout.walls.push(...walls);
  // Generated zones are rooms, so give each one a real animated door. Keep
  // private offices and restrooms to a human-sized single leaf; shared rooms
  // get a wider double-leaf entrance. Use the same entrance id shape as the
  // map editor so renderers can resolve the owning zone for swing direction.
  const wallLength = doorSide === "east" || doorSide === "west" ? zone.depth : zone.width;
  const isPrivateEntry = zone.kind === "private" || zone.kind === "restroom";
  const width = Math.min(isPrivateEntry ? 1.2 : 2.4, wallLength / 3);
  layout.doors.push({
    id: `${wallBase}-entrance-1`,
    wallId: entranceWallId,
    offset: 0,
    width,
    kind: "door",
    leaves: isPrivateEntry ? 1 : 2,
  });
}

const RESTROOM_ZONE_SCALE = 0.8;

function addProp(layout: RoomLayout, id: string, asset: string, x: number, z: number, rotation = 0, collisionOverride?: boolean, elevation?: number) {
  const definition = ROOM_PROP_CATALOG.find((item) => item.asset === asset);
  if (!definition) return;
  layout.props.push({
    id, asset, x, z, rotation,
    collision: collisionOverride ?? definition.collision,
    width: definition.width,
    depth: definition.depth,
    ...(elevation !== undefined ? { elevation } : {}),
  });
}

/** Build a compact, symmetric campus plan with road vehicles and landscaping. */
export function generateCampusMap(input: CampusMapGeneratorInputs): GeneratedCampusMap {
  const { totalPeople, peoplePerTeam, teamCount } = input;
  if (![totalPeople, peoplePerTeam, teamCount].every((value) => Number.isInteger(value) && value > 0)) throw new Error("Enter positive whole numbers for people and teams.");
  if (totalPeople !== peoplePerTeam * teamCount) throw new Error("Total people must equal people per team × team count.");
  if (peoplePerTeam > 16) throw new Error("This layout supports up to 16 private rooms per team.");
  if (peoplePerTeam * teamCount + 15 > 250) throw new Error("These inputs create more zones or walls than one office map can save. Reduce the team count or team size.");

  const topTeams = Math.ceil(teamCount / 2);
  const bottomTeams = teamCount - topTeams;
  // Split odd rows in opposite directions so the top and bottom halves mirror.
  const leftTop = Math.floor(topTeams / 2);
  const rightTop = topTeams - leftTop;
  const leftBottom = Math.ceil(bottomTeams / 2);
  const rightBottom = bottomTeams - leftBottom;
  const leftCount = Math.max(leftTop, leftBottom);
  const rightCount = Math.max(rightTop, rightBottom);
  const leftSpan = leftCount * TEAM_WIDTH + Math.max(0, leftCount - 1) * TEAM_GAP;
  const rightSpan = rightCount * TEAM_WIDTH + Math.max(0, rightCount - 1) * TEAM_GAP;
  // Ten-team campuses use five teams in each band. Keep each team block
  // compact at 3 columns × 5 rows (15 private rooms), and align the two bands.
  const compactFivePerHalf = topTeams === 5 && bottomTeams === 5;
  const compactTeamStarts = [-95, -67, -12, 43, 71] as const;
  const width = compactFivePerHalf ? 260 : Math.max(224, leftSpan + CENTRAL_ROAD + rightSpan + 8);
  const depth = compactFivePerHalf ? 280 : MAP_DEPTH;
  const leftStart = -CENTRAL_ROAD / 2 - leftSpan;
  const rightStart = CENTRAL_ROAD / 2;
  const layout: RoomLayout = { version: 1, props: [], zones: [], walls: [], doors: [], roadways: [], dimensions: { width, depth }, spawnPoint: { x: -79, z: 20 } };

  const createTeam = (teamNumber: number, side: "left" | "right", column: number, half: "top" | "bottom") => {
    const compactIndex = half === "top" ? teamNumber - 1 : teamNumber - topTeams - 1;
    const startX = compactFivePerHalf
      ? compactTeamStarts[compactIndex]!
      : side === "left" ? leftStart + column * (TEAM_WIDTH + TEAM_GAP) : rightStart + column * (TEAM_WIDTH + TEAM_GAP);
    const startZ = half === "top" ? TOP_TEAM_START_Z : compactFivePerHalf ? 48 : BOTTOM_TEAM_START_Z;
    for (let index = 0; index < peoplePerTeam; index += 1) {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const rowZ = startZ + 4 + row * (ROOM_SIZE + TEAM_GAP);
      const roomLabel = String(index + 1).padStart(2, "0");
      addZone(layout, {
        id: `team-${teamNumber}-office-${roomLabel}`,
        name: `T${teamNumber} Office ${roomLabel}`,
        kind: "private",
        x: startX + col * 8 + 4,
        z: rowZ,
        width: ROOM_SIZE,
        depth: ROOM_SIZE,
        color: COLORS[(teamNumber - 1) % COLORS.length]!,
      }, row % 2 === 0 ? "south" : "north");
    }
  };

  for (let index = 0; index < topTeams; index += 1) createTeam(index + 1, index < leftTop ? "left" : "right", index < leftTop ? index : index - leftTop, "top");
  for (let index = 0; index < bottomTeams; index += 1) {
    const teamNumber = topTeams + index + 1;
    createTeam(teamNumber, index < leftBottom ? "left" : "right", index < leftBottom ? index : index - leftBottom, "bottom");
  }

  // Five meeting rooms along both edges, mirrored around the main road.
  const meetingXs = compactFivePerHalf
    // Five equal 48 m bays with 4 m gaps span 256 m of the 260 m map width.
    // Their 18 m depth remains between the map edge and the 8 m edge road.
    ? { north: [-104, -52, 0, 52, 104], south: [-104, -52, 0, 52, 104] } as const
    : { north: [-82, -46, 22, 58, 94], south: [-94, -58, -22, 46, 82] } as const;
  for (let index = 0; index < Math.min(5, Math.max(topTeams, bottomTeams, 5)); index += 1) {
    for (const [edge, z] of [["north", compactFivePerHalf ? -130 : -121], ["south", compactFivePerHalf ? 130 : 121]] as const) {
      const slotX = meetingXs[edge][index]!;
      // Meeting rooms are sized for a team, not a hall. The space this frees
      // along both map edges becomes street frontage and finished buildings.
      addZone(layout, { id: `meeting-${edge}-${index + 1}`, name: `Meeting ${edge === "north" ? index + 1 : index + 6}`, kind: "meeting", x: slotX, z, width: compactFivePerHalf ? MEETING_ROOM_WIDTH_M : 20, depth: MEETING_ROOM_DEPTH_M, color: "#8ecae6" }, edge === "north" ? "south" : "north");
    }
  }
  if (compactFivePerHalf) {
    // Civic strip: a left-side Lobby spawn, a small meeting room and cafeteria
    // around the Town Hall, L meeting rooms on opposite sides, and corner WC.
    addZone(layout, { id: "shared-lobby", name: "Lobby", kind: "meeting", x: -112, z: 0, width: 28, depth: 36, color: "#8ecae6" }, "east");
    layout.spawnPoint = { x: -120, z: 14 };
    addZone(layout, { id: "meeting-small-west", name: "Small meeting", kind: "meeting", x: -50, z: 0, width: SMALL_MEETING_WIDTH_M, depth: SMALL_MEETING_DEPTH_M, color: "#8ecae6" }, "west");
    addZone(layout, { id: "shared-townhall", name: "Town Hall", kind: "meeting", x: 0, z: 0, width: 42, depth: 44, color: "#b8a1d9" });
    addZone(layout, { id: "shared-cafeteria", name: "Cafeteria", kind: "meeting", x: 50, z: 0, width: 40, depth: 40, color: "#f6bd60" }, "west");
    addZone(layout, { id: "meeting-large-north-east", name: "Meeting L 1", kind: "meeting", x: 114, z: -64, width: SMALL_MEETING_WIDTH_M, depth: SMALL_MEETING_DEPTH_M, color: "#8ecae6" }, "west");
    addZone(layout, { id: "meeting-large-south-west", name: "Meeting L 2", kind: "meeting", x: -114, z: 64, width: SMALL_MEETING_WIDTH_M, depth: SMALL_MEETING_DEPTH_M, color: "#8ecae6" }, "east");
    for (const [id, x, z, doorSide] of [
      ["shared-restroom-north-west", -112, -90, "east"], ["shared-restroom-north-east", 112, -90, "west"],
      ["shared-restroom-south-west", -112, 90, "east"], ["shared-restroom-south-east", 112, 90, "west"],
    ] as const) {
      addZone(layout, { id, name: "Restroom", kind: "restroom", x, z, width: 20 * RESTROOM_ZONE_SCALE, depth: 26 * RESTROOM_ZONE_SCALE, color: "#70c1b3" }, doorSide);
    }
  } else {
    addZone(layout, { id: "shared-townhall", name: "Town Hall", kind: "meeting", x: -79, z: 0, width: 42, depth: 46, color: "#b8a1d9" });
    addZone(layout, { id: "shared-cafeteria", name: "Cafeteria", kind: "meeting", x: -29, z: 0, width: 38, depth: 46, color: "#f6bd60" });
    addZone(layout, { id: "shared-restroom-west", name: "Restroom", kind: "restroom", x: 26, z: 0, width: 28 * RESTROOM_ZONE_SCALE, depth: 34 * RESTROOM_ZONE_SCALE, color: "#70c1b3" });
    addZone(layout, { id: "shared-lounge", name: "Lounge", kind: "meeting", x: 63, z: 0, width: 28, depth: 34, color: "#90be6d" });
    addZone(layout, { id: "shared-restroom-east", name: "Restroom", kind: "restroom", x: 98, z: 0, width: 28 * RESTROOM_ZONE_SCALE, depth: 34 * RESTROOM_ZONE_SCALE, color: "#70c1b3" });  }

  // Add the furnished restroom plan here; the empty-interior draft removes
  // these starter fixtures when composing the new office.
  for (const zone of layout.zones.filter((item) => item.kind === "restroom")) {
    const entrance = layout.doors.find((door) => door.id === `${zone.id}-entrance-1`);
    const entranceWall = layout.walls.find((wall) => wall.id === entrance?.wallId);
    if (!entranceWall) throw new Error(`Restroom ${zone.id} is missing its entrance wall.`);
    const entranceSide = entranceWall.axis === "horizontal"
      ? entranceWall.z < zone.z ? "north" : "south"
      : entranceWall.x < zone.x ? "west" : "east";
    for (const fixture of campusRestroomFixtures(zone, compactFivePerHalf, entranceSide)) {
      addProp(layout, `${zone.id}-starter-${fixture.key}`, fixture.asset, zone.x + fixture.xM, zone.z + fixture.zM, fixture.rotationRad ?? 0, fixture.collision, fixture.elevationM);
    }
  }

  // Keep generated office interiors empty so teams can furnish their rooms
  // themselves. Landscaping and street props are added below, outside zones.

  const roads = layout.roadways!;
  if (compactFivePerHalf) {
    // Main avenues separate the 2–1–2 team groups, with north/south branches
    // and a continuous left-side lobby access street.
    for (const x of [-24, 24]) {
      roads.push({ id: `road-major-arterial-${x}-north`, x, z: -78, width: CENTRAL_ROAD, depth: 84, kind: "major" });
      roads.push({ id: `road-major-arterial-${x}-south`, x, z: 78, width: CENTRAL_ROAD, depth: 84, kind: "major" });
    }
    roads.push({ id: "road-major-lobby-link", x: -84, z: 0, width: 28, depth: CENTRAL_ROAD, kind: "major" });
    // The townhall/cafeteria block separates north and south avenues. Join
    // those halves around both sides of the block so every road is reachable
    // from the lobby street and the edge/team roads.
    for (const x of [-84, 84]) {
      roads.push({ id: `road-major-civic-bypass-${x}`, x, z: 0, width: CENTRAL_ROAD, depth: 72.2, kind: "major" });
    }
  } else {
    roads.push({ id: "road-major-center", x: 0, z: 0, width: CENTRAL_ROAD, depth, kind: "major" });
  }
  const majorRoadRows = compactFivePerHalf
    ? [["north-meeting", -114], ["north-team", -40], ["south-team", 40], ["south-meeting", 114]] as const
    : [["north-meeting", -MEETING_EDGE_ROAD_Z], ["north-team", -50], ["south-team", 50], ["south-meeting", MEETING_EDGE_ROAD_Z]] as const;
  for (const [id, z] of majorRoadRows) {
    roads.push({ id: `road-major-${id}`, x: 0, z, width, depth: CENTRAL_ROAD, kind: "major" });
  }
  const smallRoadXs = compactFivePerHalf ? [-69, 69] : [
    ...Array.from({ length: Math.max(0, leftCount - 1) }, (_, index) => leftStart + TEAM_WIDTH + TEAM_GAP / 2 + index * (TEAM_WIDTH + TEAM_GAP)),
    ...Array.from({ length: Math.max(0, rightCount - 1) }, (_, index) => rightStart + TEAM_WIDTH + TEAM_GAP / 2 + index * (TEAM_WIDTH + TEAM_GAP)),
  ];
  const compactRows = Math.ceil(peoplePerTeam / 3);
  const upperRows = Math.ceil(Math.ceil(peoplePerTeam / 2) / 4);
  const lowerRows = Math.ceil(Math.floor(peoplePerTeam / 2) / 4);
  const teamBandDepth = compactFivePerHalf
    ? compactRows * ROOM_SIZE + Math.max(0, compactRows - 1) * TEAM_GAP
    : Math.max(0, (upperRows + lowerRows) * (ROOM_SIZE + TEAM_GAP) - TEAM_GAP);
  const topTeamEndZ = TOP_TEAM_START_Z + teamBandDepth;
  const bottomTeamStart = compactFivePerHalf ? 48 : BOTTOM_TEAM_START_Z;
  const bottomTeamEndZ = bottomTeamStart + teamBandDepth;
  for (let index = 0; index < smallRoadXs.length; index += 1) {
    for (const [half, startZ] of [["north", TOP_TEAM_START_Z], ["south", bottomTeamStart]] as const) {
      roads.push({ id: `road-small-${half}-${index + 1}`, x: smallRoadXs[index]!, z: startZ + teamBandDepth / 2, width: TEAM_GAP, depth: teamBandDepth + 0.2, kind: "small" });
    }
    // Join each team separator to the adjacent major team road. Compute only the
    // actual gap so connectors don't spill into neighboring rooms or facilities.
    const teamRoadOffset = compactFivePerHalf ? 40 : 50;
    const northTeamRoadEdge = -teamRoadOffset + CENTRAL_ROAD / 2;
    const northConnectorDepth = Math.max(0, northTeamRoadEdge - topTeamEndZ);
    if (northConnectorDepth > 0) roads.push({ id: `road-connector-north-${index + 1}`, x: smallRoadXs[index]!, z: (topTeamEndZ + northTeamRoadEdge) / 2, width: TEAM_GAP, depth: northConnectorDepth + 0.2, kind: "small" });
    const southTeamRoadEdge = teamRoadOffset - CENTRAL_ROAD / 2;
    const southConnectorDepth = Math.max(0, bottomTeamStart - southTeamRoadEdge);
    if (southConnectorDepth > 0) roads.push({ id: `road-connector-south-${index + 1}`, x: smallRoadXs[index]!, z: (southTeamRoadEdge + bottomTeamStart) / 2, width: TEAM_GAP, depth: southConnectorDepth + 0.2, kind: "small" });
  }
  for (let team = 0; team < teamCount; team += 1) {
    const inTopHalf = team < topTeams;
    const leftSide = inTopHalf ? team < leftTop : team - topTeams < leftBottom;
    const column = inTopHalf ? (leftSide ? team : team - leftTop) : (leftSide ? team - topTeams : team - topTeams - leftBottom);
    const compactIndex = inTopHalf ? team : team - topTeams;
    const teamStartX = compactFivePerHalf
      ? compactTeamStarts[compactIndex]!
      : leftSide ? leftStart + column * (TEAM_WIDTH + TEAM_GAP) : rightStart + column * (TEAM_WIDTH + TEAM_GAP);
    const startZ = inTopHalf ? TOP_TEAM_START_Z : bottomTeamStart;
    const rows = compactFivePerHalf ? compactRows : upperRows + lowerRows;
    for (let row = 0; row < rows - 1; row += 1) {
      if (compactFivePerHalf) {
        const isCenterTeamBlock = compactIndex === 2;
        // The center team block borders the central avenue directly on its
        // east side. Extend its row alleys through the empty verge so every
        // one joins that avenue instead of leaving isolated road strips.
        const rowRoadWidth = ROOM_SIZE * 3 + (isCenterTeamBlock ? CENTRAL_ROAD : 0);
        const rowRoadX = teamStartX + ROOM_SIZE * 1.5 + (isCenterTeamBlock ? CENTRAL_ROAD / 2 : 0);
        roads.push({ id: `team-${team + 1}-row-road-${row + 1}`, x: rowRoadX, z: startZ + ROOM_SIZE + TEAM_GAP / 2 + row * (ROOM_SIZE + TEAM_GAP), width: rowRoadWidth, depth: TEAM_GAP, kind: "small" });
        continue;
      }
      const roadZ = row < upperRows - 1
        ? startZ + ROOM_SIZE + TEAM_GAP / 2 + row * (ROOM_SIZE + TEAM_GAP)
        : startZ + upperRows * (ROOM_SIZE + TEAM_GAP) - TEAM_GAP / 2 + (row - (upperRows - 1)) * (ROOM_SIZE + TEAM_GAP);
      roads.push({ id: `team-${team + 1}-row-road-${row + 1}`, x: teamStartX + TEAM_WIDTH / 2, z: roadZ, width: TEAM_WIDTH, depth: TEAM_GAP, kind: "small" });
    }
  }

  // Team alleys and edge streets are laid out per block, so some of them stop
  // short of the avenue they should feed. Add the missing link streets here so
  // the whole campus is one network a vehicle can drive without turning back.
  roads.push(...planRoadConnectors(roads, {
    blockers: layout.zones.map((zone) => ({ x: zone.x, z: zone.z, width: zone.width, depth: zone.depth })),
    bounds: { width, depth },
  }));

  // Cars are parked on the wide roads with enough room between them to drive through.
  // A seeded shuffle gives variety while keeping the saved layout reproducible.
  const random = seededRandom(input.seed ?? (totalPeople * 31 + peoplePerTeam * 17 + teamCount));
  const vehicleAssets = ["vehicle-speedster", "vehicle-racer", "vehicle-suv", "vehicle-monster-truck", "vehicle-truck", "car-sedan", "car-hatchback-sports", "car-taxi", "car-kart-oopi"];
  const vehicleSpots = compactFivePerHalf ? [
    { x: -24, z: -78, rotation: 0 }, { x: 24, z: -78, rotation: 0 },
    { x: -24, z: 78, rotation: 0 }, { x: 24, z: 78, rotation: 0 },
    { x: -70, z: -40, rotation: Math.PI / 2 }, { x: 70, z: -40, rotation: Math.PI / 2 },
    { x: -70, z: 40, rotation: Math.PI / 2 }, { x: 70, z: 40, rotation: Math.PI / 2 },
  ] : [
    { x: -1.3, z: -84, rotation: 0 }, { x: 1.3, z: -22, rotation: 0 },
    { x: -1.3, z: 22, rotation: 0 }, { x: 1.3, z: 84, rotation: 0 },
    { x: -68, z: -50, rotation: Math.PI / 2 }, { x: 68, z: -50, rotation: Math.PI / 2 },
    { x: -68, z: 50, rotation: Math.PI / 2 }, { x: 68, z: 50, rotation: Math.PI / 2 },
  ];
  for (let index = 0; index < vehicleSpots.length; index += 1) {
    const spot = vehicleSpots[index]!;
    const asset = vehicleAssets[Math.floor(random() * vehicleAssets.length)]!;
    const definition = ROOM_PROP_CATALOG.find((item) => item.asset === asset);
    if (!definition) continue;
    layout.props.push({ id: `campus-vehicle-${index + 1}`, asset, ...spot, collision: definition.collision, width: definition.width, depth: definition.depth });
  }

  // Street furniture stays beside the road surface, outside room footprints,
  // and clear of parked cars. Keeping these as ordinary catalog props means
  // their assets remain editable while road slabs/markings stay lightweight.
  const streetLight = ROOM_PROP_CATALOG.find((item) => item.asset === "kenney-city-kit-roads-light-curved");
  const streetBin = ROOM_PROP_CATALOG.find((item) => item.asset === "external-city-park-and-playground-33675")
    ?? ROOM_PROP_CATALOG.find((item) => item.asset === "kit:trashcan");
  const inFootprint = (x: number, z: number, centerX: number, centerZ: number, footprintWidth: number, footprintDepth: number) => Math.abs(x - centerX) < footprintWidth / 2 && Math.abs(z - centerZ) < footprintDepth / 2;
  const canPlaceStreetProp = (x: number, z: number, definition: NonNullable<typeof streetLight>) => {
    const halfW = definition.width / 2 + 0.7;
    const halfD = definition.depth / 2 + 0.7;
    // Cars are the only props allowed on a road. Keep all street furniture on
    // the sidewalk, including at road intersections.
    if (roads.some((road) => inFootprint(x, z, road.x, road.z, road.width + definition.width + 0.2, road.depth + definition.depth + 0.2))) return false;
    if (layout.zones.some((zone) => Math.abs(x - zone.x) < zone.width / 2 + halfW && Math.abs(z - zone.z) < zone.depth / 2 + halfD)) return false;
    if (layout.props.some((prop) => Math.abs(x - prop.x) < (prop.width + definition.width) / 2 + 0.7 && Math.abs(z - prop.z) < (prop.depth + definition.depth) / 2 + 0.7)) return false;
    return Math.abs(x) + definition.width / 2 <= width / 2 && Math.abs(z) + definition.depth / 2 <= depth / 2;
  };
  if (streetLight) {
    let placedLights = 0;
    // Light every road edge on a regular rhythm rather than only the main
    // avenues, so each roadside slot reads as a finished street.
    for (const road of roads) {
      if (placedLights >= STREET_LIGHT_LIMIT) break;
      for (const point of roadsideVergePoints(road, { spacingM: STREET_LIGHT_SPACING_M, offsetM: STREET_FURNITURE_OFFSET_M })) {
        if (placedLights >= STREET_LIGHT_LIMIT) break;
        if (!canPlaceStreetProp(point.x, point.z, streetLight)) continue;
        addProp(layout, `campus-street-light-${placedLights + 1}`, streetLight.asset, point.x, point.z, point.rotation);
        placedLights += 1;
      }
    }
  }
  if (streetBin) {
    let placedBins = 0;
    const roadsideBinSpots = roads
      .filter((item) => item.kind === "major")
      .flatMap((road) => roadsideVergePoints(road, { spacingM: STREET_BIN_SPACING_M, offsetM: STREET_FURNITURE_OFFSET_M, marginM: 8 }));
    for (let index = roadsideBinSpots.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [roadsideBinSpots[index], roadsideBinSpots[swap]] = [roadsideBinSpots[swap]!, roadsideBinSpots[index]!];
    }
    const desiredBins = Math.max(12, teamCount * 2);
    for (const point of roadsideBinSpots) {
      if (placedBins >= desiredBins) break;
      if (!canPlaceStreetProp(point.x, point.z, streetBin)) continue;
      placedBins += 1;
      addProp(layout, `campus-street-bin-${placedBins}`, streetBin.asset, point.x, point.z);
    }
  }

  // Put traffic signals beside the main avenue intersections, beyond both road
  // edges. They are actual props, while the road surfaces remain lightweight.
  const trafficLight = ROOM_PROP_CATALOG.find((item) => item.asset === "kenney-city-kit-roads-traffic-light");
  if (trafficLight) {
    let signalIndex = 0;
    const avenues = compactFivePerHalf ? [-24, 24] : [0];
    const crossStreets = compactFivePerHalf ? [-40, 40, 114] : [-MEETING_EDGE_ROAD_Z, -50, 50, MEETING_EDGE_ROAD_Z];
    for (const avenueX of avenues) for (const crossZ of crossStreets) for (const sideX of [-1, 1]) for (const sideZ of [-1, 1]) {
      const x = avenueX + sideX * (CENTRAL_ROAD / 2 + trafficLight.width / 2 + 0.7);
      const z = crossZ + sideZ * (CENTRAL_ROAD / 2 + trafficLight.depth / 2 + 0.7);
      if (!canPlaceStreetProp(x, z, trafficLight)) continue;
      signalIndex += 1;
      addProp(layout, `campus-traffic-signal-${signalIndex}`, trafficLight.asset, x, z, sideX > 0 ? Math.PI : 0);
    }
  }

  // Add a few finished buildings only where there is enough clear outdoor
  // space. The placement helper reserves their full rotated footprints before
  // landscaping candidates are generated.
  layout.props.push(...placeCampusFinishedBuildings(layout, random));

  // Keep the middle of open spaces walkable: fill to 8% coverage with
  // landscaping candidates beside road edges only. Rooms and roadways are
  // excluded from the denominator, and model footprints cannot overlap them.
  const landscapingAssets = [
    "external-city-park-and-playground-33682", // Flower bed
    "external-city-park-and-playground-33684", // Broadleaf tree
    "external-city-park-and-playground-33683", // Conifer tree
    "external-city-park-and-playground-33685", // Shrub
    "kenney-city-kit-suburban-tree-small",
    "kit-mini-forest-rocks-low",
    // New nature packs: vary the street canopy, flowering shrubs and rock beds.
    "nature-kaykit-forest-nature-tree-1-a-color1",
    "nature-kaykit-forest-nature-tree-2-a-color1",
    "nature-kaykit-forest-nature-tree-3-a-color1",
    "nature-kaykit-forest-nature-tree-4-a-color1",
    "nature-kaykit-forest-nature-bush-2-c-color1",
    "nature-kaykit-forest-nature-rock-1-d-color1",
    "nature-quaternius-stylized-nature-megakit-commontree-1",
    "nature-quaternius-stylized-nature-megakit-commontree-3",
    "nature-quaternius-stylized-nature-megakit-bush-common-flowers",
    "nature-quaternius-stylized-nature-megakit-flower-3-group",
    "nature-quaternius-stylized-nature-megakit-flower-4-group",
    "nature-quaternius-stylized-nature-megakit-plant-1",
    "nature-quaternius-stylized-nature-megakit-rock-medium-1",
  ].map((asset) => ROOM_PROP_CATALOG.find((item) => item.asset === asset)).filter((item): item is (typeof ROOM_PROP_CATALOG)[number] => Boolean(item));
  const flowerBedAsset = "external-city-park-and-playground-33682";
  const landscapeFamilies = [
    landscapingAssets.filter((item) => /tree|conifer/i.test(item.asset)),
    landscapingAssets.filter((item) => /shrub|bush|flower|plant/i.test(item.asset) && item.asset !== flowerBedAsset),
    landscapingAssets.filter((item) => /rock/i.test(item.asset)),
  ].filter((family) => family.length > 0);
  if (landscapingAssets.length) {
    const cellSize = 1;
    const columns = Math.ceil(width / cellSize);
    const rows = Math.ceil(depth / cellSize);
    const cellKey = (column: number, row: number) => row * columns + column;
    const outdoorCells = new Set<number>();
    const occupiedOutdoorCells = new Set<number>();
    const cellPosition = (column: number, row: number) => ({ x: -width / 2 + (column + 0.5) * cellSize, z: -depth / 2 + (row + 0.5) * cellSize });
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      const point = cellPosition(column, row);
      if (layout.zones.some((zone) => inFootprint(point.x, point.z, zone.x, zone.z, zone.width, zone.depth))) continue;
      if (roads.some((road) => inFootprint(point.x, point.z, road.x, road.z, road.width, road.depth))) continue;
      outdoorCells.add(cellKey(column, row));
    }
    const occupyPropFootprint = (x: number, z: number, propWidth: number, propDepth: number) => {
      for (const key of outdoorCells) {
        const row = Math.floor(key / columns);
        const column = key - row * columns;
        const point = cellPosition(column, row);
        if (inFootprint(point.x, point.z, x, z, propWidth, propDepth)) occupiedOutdoorCells.add(key);
      }
    };
    for (const prop of layout.props) {
      const rotated = Math.abs(Math.sin(prop.rotation)) > 0.5;
      occupyPropFootprint(prop.x, prop.z, rotated ? prop.depth : prop.width, rotated ? prop.width : prop.depth);
    }
    const targetArea = Math.ceil(outdoorCells.size * OUTDOOR_FLOOR_COVERAGE);
    const landscapingCandidates: Array<{ column: number; row: number }> = [];
    const ROAD_EDGE_LANDSCAPING_BAND_M = 7;
    for (const key of outdoorCells) {
      const row = Math.floor(key / columns);
      const column = key - row * columns;
      const point = cellPosition(column, row);
      const besideRoad = roads.some((road) => {
        const edgeX = Math.max(0, Math.abs(point.x - road.x) - road.width / 2);
        const edgeZ = Math.max(0, Math.abs(point.z - road.z) - road.depth / 2);
        return Math.hypot(edgeX, edgeZ) <= ROAD_EDGE_LANDSCAPING_BAND_M;
      });
      if (besideRoad) landscapingCandidates.push({ column, row });
    }
    for (let index = landscapingCandidates.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [landscapingCandidates[index], landscapingCandidates[swap]] = [landscapingCandidates[swap]!, landscapingCandidates[index]!];
    }
    let landscapingIndex = 0;
    let previousLandscapeAsset = "";
    const fitsLandscaping = (definition: (typeof landscapingAssets)[number], anchor: { x: number; z: number }, rotated: boolean) => {
      const footprintWidth = rotated ? definition.depth : definition.width;
      const footprintDepth = rotated ? definition.width : definition.depth;
      // Candidates sit at cell centers. An even-sided footprint centered on a
      // cell center straddles cell boundaries and covers no full row of cell
      // centers, so it is nudged half a cell to stay grid aligned.
      const point = {
        x: anchor.x + (footprintWidth % 2 === 0 ? cellSize / 2 : 0),
        z: anchor.z + (footprintDepth % 2 === 0 ? cellSize / 2 : 0),
      };
      if (point.x - footprintWidth / 2 < -width / 2 || point.x + footprintWidth / 2 > width / 2 || point.z - footprintDepth / 2 < -depth / 2 || point.z + footprintDepth / 2 > depth / 2) return undefined;
      const candidateCells: number[] = [];
      let valid = true;
      const minColumn = Math.max(0, Math.floor((point.x - footprintWidth / 2 + width / 2) / cellSize));
      const maxColumn = Math.min(columns, Math.ceil((point.x + footprintWidth / 2 + width / 2) / cellSize));
      const minRow = Math.max(0, Math.floor((point.z - footprintDepth / 2 + depth / 2) / cellSize));
      const maxRow = Math.min(rows, Math.ceil((point.z + footprintDepth / 2 + depth / 2) / cellSize));
      for (let row = minRow; row < maxRow && valid; row += 1) for (let column = minColumn; column < maxColumn; column += 1) {
        const cell = cellPosition(column, row);
        if (!inFootprint(cell.x, cell.z, point.x, point.z, footprintWidth, footprintDepth)) continue;
        const key = cellKey(column, row);
        if (!outdoorCells.has(key) || occupiedOutdoorCells.has(key)) { valid = false; break; }
        candidateCells.push(key);
      }
      if (!valid || candidateCells.length < Math.floor(definition.width * definition.depth)) return undefined;
      const overlapsRoadOrZone = [...roads, ...layout.zones.map((zone) => ({ x: zone.x, z: zone.z, width: zone.width, depth: zone.depth }))]
        .some((area) => inFootprint(point.x, point.z, area.x, area.z, area.width + footprintWidth + 0.1, area.depth + footprintDepth + 0.1));
      if (overlapsRoadOrZone) return undefined;
      const overlapsProp = layout.props.some((prop) => {
        const propRotated = Math.abs(Math.sin(prop.rotation)) > 0.5;
        const propWidth = propRotated ? prop.depth : prop.width;
        const propDepth = propRotated ? prop.width : prop.depth;
        // Finished buildings need a planted verge, not greenery pressed
        // against their walls, so they reserve a clearance band.
        const clearance = prop.id.startsWith("campus-finished-building-") ? FINISHED_BUILDING_PLANTING_CLEARANCE_M : 0;
        return Math.abs(point.x - prop.x) < (footprintWidth + propWidth) / 2 + clearance && Math.abs(point.z - prop.z) < (footprintDepth + propDepth) / 2 + clearance;
      });
      return overlapsProp ? undefined : { cells: candidateCells, point };
    };
    for (const candidate of landscapingCandidates) {
      if (occupiedOutdoorCells.size >= targetArea) break;
      const point = cellPosition(candidate.column, candidate.row);
      // Keep compatible families together in 12 m patches: tree canopy,
      // understory, and rock accents each form their own small landscape
      // group. Walk the family from a rotating start so every pack appears,
      // and fall back to its smaller members when a spot is tight.
      const patchIndex = Math.floor(candidate.row / 12) + Math.floor(candidate.column / 12);
      const family = landscapeFamilies[patchIndex % landscapeFamilies.length]!;
      const flowerBed = landscapingIndex > 0 && landscapingIndex % 12 === 0
        ? landscapingAssets.find((item) => item.asset === flowerBedAsset)
        : undefined;
      const choices = flowerBed ? [flowerBed] : family;
      const start = (patchIndex + landscapingIndex) % choices.length;
      const ordered = choices.map((_, offset) => choices[(start + offset) % choices.length]!);
      const preferred = ordered.filter((item) => item.asset !== previousLandscapeAsset);
      const rotated = random() > 0.5;
      let planted = false;
      for (const definition of preferred.length ? preferred : ordered) {
        const fit = fitsLandscaping(definition, point, rotated);
        if (!fit) continue;
        landscapingIndex += 1;
        previousLandscapeAsset = definition.asset;
        addProp(layout, `campus-landscape-${landscapingIndex}`, definition.asset, fit.point.x, fit.point.z, rotated ? Math.PI / 2 : 0);
        for (const key of fit.cells) occupiedOutdoorCells.add(key);
        planted = true;
        break;
      }
      if (!planted) continue;
    }
  }

  if (layout.props.length > MAX_OFFICE_PROPS) throw new Error(`This layout needs ${layout.props.length.toLocaleString()} environment props. The current limit is ${MAX_OFFICE_PROPS.toLocaleString()}.`);
  return { layout, dimensions: { width, depth }, privateRoomCount: peoplePerTeam * teamCount, teamCount };
}
