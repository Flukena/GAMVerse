import { ROOM_PROP_CATALOG, type RoomLayout, type RoomLayoutDoor, type RoomLayoutProp, type RoomLayoutWall, type RoomLayoutZone } from "./roomLayout.js";

export interface CampusMapGeneratorInputs {
  totalPeople: number;
  peoplePerTeam: number;
  teamCount: number;
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
const COLORS = ["#ffb703", "#fb8500", "#219ebc", "#8ecae6", "#70c1b3", "#b8a1d9", "#e5989b", "#84a59d", "#f6bd60", "#90be6d"];

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function addZone(layout: RoomLayout, zone: RoomLayoutZone, doorSide: "north" | "east" | "south" | "west" = "south") {
  layout.zones.push(zone);
  const halfW = zone.width / 2;
  const halfD = zone.depth / 2;
  const inset = 0.09;
  const wallBase = zone.id;
  const entranceWallId = `${wallBase}-wall-${doorSide[0]}`;
  const walls: RoomLayoutWall[] = [
    { id: `${wallBase}-wall-n`, axis: "horizontal", x: zone.x, z: zone.z - halfD + inset, length: zone.width, thickness: 0.18, height: 2.5, color: "#023047" },
    { id: `${wallBase}-wall-e`, axis: "vertical", x: zone.x + halfW - inset, z: zone.z, length: zone.depth, thickness: 0.18, height: 2.5, color: "#023047" },
    { id: `${wallBase}-wall-w`, axis: "vertical", x: zone.x - halfW + inset, z: zone.z, length: zone.depth, thickness: 0.18, height: 2.5, color: "#023047" },
    { id: `${wallBase}-wall-s`, axis: "horizontal", x: zone.x, z: zone.z + halfD - inset, length: zone.width, thickness: 0.18, height: 2.5, color: "#023047" },
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

function addProp(layout: RoomLayout, id: string, asset: string, x: number, z: number, rotation = 0, elevation?: number) {
  const definition = ROOM_PROP_CATALOG.find((item) => item.asset === asset);
  if (!definition) return;
  layout.props.push({
    id, asset, x, z, rotation,
    collision: definition.collision,
    width: definition.width,
    depth: definition.depth,
    ...(elevation && elevation > 0 ? { elevation } : {}),
  });
}

const OFFICE_PLANTS = ["kit:plantsmall1", "kit:plantsmall2", "kit:plantsmall3", "kit:pottedplant", "pottedPlant"] as const;
const OFFICE_CORNER_DECOR = ["kit:trashcan", "kit:coatrack", "kit:coatrackstanding", "kit:radio", "kit:speaker", "kit:speakersmall"] as const;
const WALL_DECOR = ["office-wall-picture", "office-wall-shelf"] as const;

function variantIndex(id: string, count: number) {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) % count;
}

function addWallDecor(layout: RoomLayout, id: string, asset: typeof WALL_DECOR[number], zone: RoomLayoutZone, wall: "north" | "east" | "south" | "west", offset = 0) {
  const wallMountDepth = ROOM_PROP_CATALOG.find((item) => item.asset === asset)?.depth ?? 0.14;
  // Seat the back of the prop against the inside face of the wall instead
  // of centering the whole model on the wall plane.
  const inset = 0.09 + wallMountDepth / 2;
  const halfWidth = zone.width / 2;
  const halfDepth = zone.depth / 2;
  const placement = wall === "north" ? { x: zone.x + offset, z: zone.z - halfDepth + inset, rotation: 0 }
    : wall === "south" ? { x: zone.x + offset, z: zone.z + halfDepth - inset, rotation: Math.PI }
      : wall === "east" ? { x: zone.x + halfWidth - inset, z: zone.z + offset, rotation: -Math.PI / 2 }
        : { x: zone.x - halfWidth + inset, z: zone.z + offset, rotation: Math.PI / 2 };
  addProp(layout, id, asset, placement.x, placement.z, placement.rotation, 1.15);
}

function furnishZone(layout: RoomLayout, zone: RoomLayoutZone) {
  const { x, z, id } = zone;
  if (zone.kind === "private") {
    // Keep the work area consistent, then decorate the four corners while
    // leaving the center and the doorway clear.
    addProp(layout, `${id}-desk`, "kit:desk", x, z - 0.8);
    addProp(layout, `${id}-chair`, "kit:chairdesk", x, z + 1.15, Math.PI);
    // The monitor has a 1 × 1 m minimum footprint; align its center with the
    // desk so the full footprint is supported on the tabletop.
    addProp(layout, `${id}-monitor`, "kit:computerscreen", x, z - 0.8, 0, 0.82);
    const plant = variantIndex(id, OFFICE_PLANTS.length);
    addProp(layout, `${id}-decor-plant`, OFFICE_PLANTS[plant]!, x - 2.65, z - 2.65);
    // Alternate framed art and a floating book shelf along the uncluttered
    // east wall so compact offices keep their floor area open.
    addWallDecor(layout, `${id}-wall-decor`, WALL_DECOR[variantIndex(id, WALL_DECOR.length)]!, zone, "east", -1.8);
    return;
  }
  if (zone.id.startsWith("meeting-")) {
    addProp(layout, `${id}-table`, "kit:table", x, z - 1.2);
    for (let index = 0; index < 6; index += 1) {
      const column = index % 3;
      const row = Math.floor(index / 3);
      addProp(layout, `${id}-seat-${index + 1}`, "kit:chair", x - 2.4 + column * 2.4, z + (row === 0 ? -3.4 : 1.2), row === 0 ? 0 : Math.PI);
    }
    const decorAsset = WALL_DECOR[variantIndex(id, WALL_DECOR.length)]!;
    addWallDecor(layout, `${id}-wall-decor`, decorAsset, zone, "east", -zone.depth * 0.22);
    return;
  }
  if (id === "shared-townhall") {
    addProp(layout, `${id}-stage`, "office-townhall-stage", x, z - 16);
    addProp(layout, `${id}-podium`, "office-townhall-podium", x, z - 12);
    for (let row = 0; row < 3; row += 1) for (let column = 0; column < 8; column += 1) {
      addProp(layout, `${id}-seat-${row * 8 + column + 1}`, "kit:chair", x - 13.3 + column * 3.8, z + row * 5 + 1);
    }
    const plantOffset = zone.width < 40 ? 14 : 18;
    addProp(layout, `${id}-plant-west`, "kit:plantsmall1", x - plantOffset, z + 17);
    addProp(layout, `${id}-plant-east`, "kit:plantsmall2", x + plantOffset, z + 17);
    addProp(layout, `${id}-speaker`, "kit:speaker", x - 17, z - 17);
    addWallDecor(layout, `${id}-wall-art`, "office-wall-picture", zone, "west", -5);
    return;
  }
  if (id === "shared-cafeteria") {
    addProp(layout, `${id}-counter`, "quaternius-sushi-counter", x, z - 17, Math.PI / 2);
    addProp(layout, `${id}-counter-corner`, "quaternius-sushi-counter-corner", x + 2.5, z - 18);
    addProp(layout, `${id}-oven`, "quaternius-sushi-oven", x - 7, z - 17);
    addProp(layout, `${id}-fridge`, "quaternius-sushi-fridge", x + 7, z - 17);
    addProp(layout, `${id}-stool`, "quaternius-sushi-stool", x - 3.5, z - 12);
    for (let row = 0; row < 2; row += 1) for (let column = 0; column < 2; column += 1) {
      const tableX = x - 9 + column * 18;
      const tableZ = z - 4 + row * 13;
      const suffix = `${row * 2 + column + 1}`;
      addProp(layout, `${id}-table-${suffix}`, "quaternius-sushi-table", tableX, tableZ);
      addProp(layout, `${id}-chair-${suffix}-a`, "quaternius-sushi-chair-1", tableX - 1.3, tableZ + 0.8, Math.PI / 2);
      addProp(layout, `${id}-chair-${suffix}-b`, "quaternius-sushi-chair-1", tableX + 1.3, tableZ + 0.8, -Math.PI / 2);
      if (row === 0 && column === 0) addProp(layout, `${id}-chair-extra`, "quaternius-sushi-chair-2", tableX, tableZ - 2.2);
      // Serve one small dish per tabletop. These assets use a 1 × 1 m
      // placement footprint, so centering them keeps them fully supported.
      if (row === 0 && column === 0) addProp(layout, `${id}-onigiri`, "quaternius-sushi-onigiri", tableX, tableZ, 0, 0.76);
      else if (row === 1 && column === 1) addProp(layout, `${id}-nigiri`, "quaternius-sushi-nigiri", tableX, tableZ, 0, 0.76);
      else addProp(layout, `${id}-food-${suffix}`, "quaternius-sushi-ramen", tableX, tableZ, 0, 0.76);
    }
    const plantOffset = zone.width < 36 ? 13 : 16;
    addProp(layout, `${id}-plant-west`, "quaternius-sushi-plant-1", x - plantOffset, z + 18);
    addProp(layout, `${id}-plant-east`, "quaternius-sushi-plant-2", x + plantOffset, z + 18);
    addProp(layout, `${id}-bench`, "quaternius-sushi-bench", x - 13, z + 12, Math.PI / 2);
    addProp(layout, `${id}-sofa`, "quaternius-sushi-sofa", x + 13, z + 12, -Math.PI / 2);
    addWallDecor(layout, `${id}-wall-shelf`, "office-wall-shelf", zone, "north");
    return;
  }
  if (zone.kind === "restroom") {
    for (let index = 0; index < 4; index += 1) {
      const fixtureX = x - 9 + index * 6;
      addProp(layout, `${id}-toilet-${index + 1}`, "kit:toilet", fixtureX, z - 8);
      if (index < 3) addProp(layout, `${id}-partition-${index + 1}`, "office-restroom-partition", fixtureX + 3, z - 8, Math.PI / 2);
    }
    addProp(layout, `${id}-sink-west`, "kit:bathroomsink", x - 5, z - 14, Math.PI);
    addProp(layout, `${id}-sink-east`, "kit:bathroomsink", x + 5, z - 14, Math.PI);
    addProp(layout, `${id}-plant`, "kit:plantsmall3", x + (zone.width < 24 ? 8 : 10), z + 12);
    const doorWall = layout.doors.find((door) => door.id.startsWith(`${id}-entrance-`))?.wallId ?? "";
    const oppositeWall = doorWall.endsWith("-wall-e") ? "west" : doorWall.endsWith("-wall-w") ? "east" : doorWall.endsWith("-wall-n") ? "south" : "north";
    addWallDecor(layout, `${id}-wall-decor`, WALL_DECOR[variantIndex(id, WALL_DECOR.length)]!, zone, oppositeWall, -6);
    return;
  }
  if (id === "shared-lobby") {
    addProp(layout, `${id}-reception-desk`, "kit:desk", x - 5, z - 7);
    addProp(layout, `${id}-reception-chair`, "kit:chairdesk", x - 5, z - 5.2, Math.PI);
    addProp(layout, `${id}-reception-monitor`, "kit:computerscreen", x - 5, z - 7, 0, 0.82);
    addProp(layout, `${id}-waiting-sofa`, "kit:loungesofa", x + 4, z + 8, Math.PI / 2);
    addProp(layout, `${id}-plant-west`, "kit:plantsmall1", x - 10, z + 13);
    addWallDecor(layout, `${id}-wall-art`, "office-wall-picture", zone, "north", 4);
    return;
  }
  // Shared lounge: a small seating cluster and greenery.
  addProp(layout, `${id}-sofa-west`, "kit:loungesofa", x - 6, z - 4, Math.PI / 2);
  addProp(layout, `${id}-sofa-east`, "kit:loungesofa", x + 6, z - 4, -Math.PI / 2);
  addProp(layout, `${id}-coffee-table`, "kit:tablecoffeesquare", x, z + 1);
  const plantZ = zone.depth < 30 ? 7 : 11;
  addProp(layout, `${id}-plant-west`, "kit:plantsmall1", x - 10, z + plantZ);
  addProp(layout, `${id}-plant-east`, "kit:plantsmall2", x + 10, z + plantZ);
  addWallDecor(layout, `${id}-wall-art`, "office-wall-picture", zone, "north", -5);
}

/** Build a compact, symmetric campus plan with road vehicles and landscaping. */
export function generateCampusMap(input: CampusMapGeneratorInputs): GeneratedCampusMap {
  const { totalPeople, peoplePerTeam, teamCount } = input;
  if (![totalPeople, peoplePerTeam, teamCount].every((value) => Number.isInteger(value) && value > 0)) throw new Error("Enter positive whole numbers for people and teams.");
  if (totalPeople !== peoplePerTeam * teamCount) throw new Error("Total people must equal people per team × team count.");
  if (peoplePerTeam > 16) throw new Error("This layout supports up to 16 private rooms per team.");
  if (peoplePerTeam * teamCount + 15 > 250 || peoplePerTeam * teamCount * 4 + 60 > 1000) throw new Error("These inputs create more zones or walls than one office map can save. Reduce the team count or team size.");

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
      addZone(layout, { id: `meeting-${edge}-${index + 1}`, name: `Meeting ${edge === "north" ? index + 1 : index + 6}`, kind: "meeting", x: slotX, z, width: compactFivePerHalf ? 48 : 28, depth: 18, color: "#8ecae6" }, edge === "north" ? "south" : "north");
    }
  }
  if (compactFivePerHalf) {
    // Civic strip: a left-side Lobby spawn, a small meeting room and cafeteria
    // around the Town Hall, L meeting rooms on opposite sides, and corner WC.
    addZone(layout, { id: "shared-lobby", name: "Lobby", kind: "meeting", x: -112, z: 0, width: 28, depth: 36, color: "#8ecae6" }, "east");
    layout.spawnPoint = { x: -120, z: 14 };
    addZone(layout, { id: "meeting-small-west", name: "Small meeting", kind: "meeting", x: -50, z: 0, width: 40, depth: 40, color: "#8ecae6" }, "west");
    addZone(layout, { id: "shared-townhall", name: "Town Hall", kind: "meeting", x: 0, z: 0, width: 42, depth: 44, color: "#b8a1d9" });
    addZone(layout, { id: "shared-cafeteria", name: "Cafeteria", kind: "meeting", x: 50, z: 0, width: 40, depth: 40, color: "#f6bd60" }, "west");
    addZone(layout, { id: "meeting-large-north-east", name: "Meeting L 1", kind: "meeting", x: 114, z: -64, width: 28, depth: 20, color: "#8ecae6" }, "west");
    addZone(layout, { id: "meeting-large-south-west", name: "Meeting L 2", kind: "meeting", x: -114, z: 64, width: 28, depth: 20, color: "#8ecae6" }, "east");
    for (const [id, x, z, doorSide] of [
      ["shared-restroom-north-west", -112, -90, "east"], ["shared-restroom-north-east", 112, -90, "west"],
      ["shared-restroom-south-west", -112, 90, "east"], ["shared-restroom-south-east", 112, 90, "west"],
    ] as const) {
      addZone(layout, { id, name: "Restroom", kind: "restroom", x, z, width: 20, depth: 26, color: "#70c1b3" }, doorSide);
    }
  } else {
    addZone(layout, { id: "shared-townhall", name: "Town Hall", kind: "meeting", x: -79, z: 0, width: 42, depth: 46, color: "#b8a1d9" });
    addZone(layout, { id: "shared-cafeteria", name: "Cafeteria", kind: "meeting", x: -29, z: 0, width: 38, depth: 46, color: "#f6bd60" });
    addZone(layout, { id: "shared-restroom-west", name: "Restroom", kind: "restroom", x: 26, z: 0, width: 28, depth: 34, color: "#70c1b3" });
    addZone(layout, { id: "shared-lounge", name: "Lounge", kind: "meeting", x: 63, z: 0, width: 28, depth: 34, color: "#90be6d" });
    addZone(layout, { id: "shared-restroom-east", name: "Restroom", kind: "restroom", x: 98, z: 0, width: 28, depth: 34, color: "#70c1b3" });
  }

  for (const zone of layout.zones) furnishZone(layout, zone);

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

  // Cars are parked on the wide roads with enough room between them to drive through.
  // A seeded shuffle gives variety while keeping the saved layout reproducible.
  const random = seededRandom(totalPeople * 31 + peoplePerTeam * 17 + teamCount);
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

  // Fill leftover open pockets with mirrored trees. Keep every planting clear of
  // rooms and roads so landscaping never blocks doors or the driving lanes.
  const treeDefinition = ROOM_PROP_CATALOG.find((item) => item.asset === "kenney-city-kit-suburban-tree-small");
  if (treeDefinition) {
    const candidates: Array<{ x: number; z: number }> = [];
    for (let x = 12; x <= 100; x += 10) for (let z = 12; z <= 112; z += 10) candidates.push({ x, z });
    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [candidates[index], candidates[swap]] = [candidates[swap]!, candidates[index]!];
    }
    let planted = 0;
    for (const point of candidates) {
      if (planted >= 16) break;
      const mirrored = [{ x: point.x, z: point.z }, { x: -point.x, z: point.z }, { x: point.x, z: -point.z }, { x: -point.x, z: -point.z }];
      const clear = mirrored.every((candidate) => {
        const overlapsZone = layout.zones.some((zone) => Math.abs(candidate.x - zone.x) < zone.width / 2 + 2 && Math.abs(candidate.z - zone.z) < zone.depth / 2 + 2);
        const overlapsRoad = roads.some((road) => Math.abs(candidate.x - road.x) < road.width / 2 + 3 && Math.abs(candidate.z - road.z) < road.depth / 2 + 3);
        const overlapsTree = layout.props.some((prop) => Math.abs(candidate.x - prop.x) < (prop.width + treeDefinition.width) / 2 + 2 && Math.abs(candidate.z - prop.z) < (prop.depth + treeDefinition.depth) / 2 + 2);
        return !overlapsZone && !overlapsRoad && !overlapsTree && Math.abs(candidate.x) + treeDefinition.width / 2 <= width / 2 && Math.abs(candidate.z) + treeDefinition.depth / 2 <= depth / 2;
      });
      if (!clear) continue;
      for (const [index, candidate] of mirrored.entries()) layout.props.push({ id: `campus-tree-${planted + index + 1}`, asset: treeDefinition.asset, ...candidate, rotation: 0, collision: treeDefinition.collision, width: treeDefinition.width, depth: treeDefinition.depth });
      planted += mirrored.length;
    }
  }

  return { layout, dimensions: { width, depth }, privateRoomCount: peoplePerTeam * teamCount, teamCount };
}
