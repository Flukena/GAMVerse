import {
  nearestInteractiveProp,
  type RoomLayoutProp,
} from "@gammyverse/shared";
import {
  MAP2D_AVATAR_RADIUS_PX,
  MAP2D_COLORS,
  MAP2D_FONT_PX,
  MAP2D_NAME_OFFSET_PX,
} from "./constants";
import {
  worldToScreen,
  type Map2dPoint,
  type Map2dProjection,
} from "./map2dProjection";
import type { AvatarPose } from "./avatarPoseSmoother";
export type Map2dDecoration = {
  sessionId: string;
  text: string;
  expiresAtMs: number;
};
export type Map2dPlayer = AvatarPose & {
  displayName: string;
  username: string;
  status?: string;
  handRaised?: boolean;
  characterId?: string;
};
const FULL_CIRCLE_RAD = Math.PI * 2;
const AVATAR_NOTCH_LENGTH_PX = 14;
const AVATAR_RING_GAP_PX = 4;
const STATUS_DOT_RADIUS_PX = 3;
const DECORATION_HEIGHT_PX = 38;
const DECORATION_RISE_PX = 12;
const DECORATION_ANIMATION_PERIOD_MS = 600;
const NAME_PILL_PADDING_PX = 5;
const NAME_PILL_HEIGHT_PX = 15;
const NAME_PILL_RADIUS_PX = 4;
const CHARACTER_COLORS = [
  "#159bb4",
  "#b56e59",
  "#877caf",
  "#639975",
  "#ad944f",
  "#b3659c",
];
function characterColor(characterId = ""): string {
  const index =
    [...characterId].reduce(
      (hash, character) => hash + character.charCodeAt(0),
      0,
    ) % CHARACTER_COLORS.length;
  return CHARACTER_COLORS[index] ?? MAP2D_COLORS.avatar;
}
function drawPlayer(
  ctx: CanvasRenderingContext2D,
  p: Map2dProjection,
  player: Map2dPlayer,
  local: boolean,
  speaking: boolean,
): void {
  const screen = worldToScreen(p, player);
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, MAP2D_AVATAR_RADIUS_PX, 0, FULL_CIRCLE_RAD);
  ctx.fillStyle = characterColor(player.characterId);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(screen.x, screen.y);
  ctx.lineTo(
    screen.x + Math.sin(player.rotation) * AVATAR_NOTCH_LENGTH_PX,
    screen.y + Math.cos(player.rotation) * AVATAR_NOTCH_LENGTH_PX,
  );
  ctx.strokeStyle = MAP2D_COLORS.white;
  ctx.stroke();
  if (local || speaking) {
    ctx.beginPath();
    ctx.arc(
      screen.x,
      screen.y,
      MAP2D_AVATAR_RADIUS_PX + AVATAR_RING_GAP_PX,
      0,
      FULL_CIRCLE_RAD,
    );
    ctx.strokeStyle = speaking ? MAP2D_COLORS.speaking : MAP2D_COLORS.white;
    ctx.stroke();
  }
  ctx.font = `${MAP2D_FONT_PX}px system-ui`;
  ctx.textAlign = "center";
  const name = `${player.displayName}${player.handRaised ? " ✋" : ""}`;
  const pillWidth = ctx.measureText(name).width + NAME_PILL_PADDING_PX * 2;
  ctx.fillStyle = MAP2D_COLORS.white;
  ctx.beginPath();
  ctx.roundRect(
    screen.x - pillWidth / 2,
    screen.y + MAP2D_NAME_OFFSET_PX - MAP2D_FONT_PX,
    pillWidth,
    NAME_PILL_HEIGHT_PX,
    NAME_PILL_RADIUS_PX,
  );
  ctx.fill();
  ctx.fillStyle = MAP2D_COLORS.text;
  ctx.fillText(name, screen.x, screen.y + MAP2D_NAME_OFFSET_PX);
  ctx.beginPath();
  ctx.arc(
    screen.x + MAP2D_AVATAR_RADIUS_PX,
    screen.y + MAP2D_AVATAR_RADIUS_PX,
    STATUS_DOT_RADIUS_PX,
    0,
    FULL_CIRCLE_RAD,
  );
  ctx.fillStyle =
    player.status === "do-not-disturb"
      ? MAP2D_COLORS.door
      : MAP2D_COLORS.speaking;
  ctx.fill();
}
export function drawMap2dDynamic(
  ctx: CanvasRenderingContext2D,
  p: Map2dProjection,
  players: ReadonlyMap<string, Map2dPlayer>,
  localId: string | null,
  speaking: ReadonlySet<string>,
  decorations: readonly Map2dDecoration[],
  nowMs: number,
): void {
  for (const [id, player] of players)
    drawPlayer(
      ctx,
      p,
      player,
      id === localId,
      speaking.has(player.username.toLocaleLowerCase()),
    );
  for (const decoration of decorations) {
    const player = players.get(decoration.sessionId);
    if (!player || decoration.expiresAtMs <= nowMs) continue;
    const screen = worldToScreen(p, player);
    ctx.fillStyle = MAP2D_COLORS.text;
    ctx.fillText(
      decoration.text,
      screen.x,
      screen.y -
        DECORATION_HEIGHT_PX -
        Math.sin(nowMs / DECORATION_ANIMATION_PERIOD_MS) * DECORATION_RISE_PX,
    );
  }
}

export function drawMap2dInteraction(
  ctx: CanvasRenderingContext2D,
  projection: Map2dProjection,
  props: readonly RoomLayoutProp[],
  local: AvatarPose | undefined,
): void {
  if (!local) return;
  const prop = nearestInteractiveProp(props, local);
  if (!prop) return;
  const screen = worldToScreen(projection, prop);
  ctx.strokeStyle = MAP2D_COLORS.local;
  ctx.beginPath();
  ctx.arc(
    screen.x,
    screen.y,
    (Math.max(prop.width, prop.depth) * projection.pxPerM) / 2 +
      AVATAR_RING_GAP_PX,
    0,
    FULL_CIRCLE_RAD,
  );
  ctx.stroke();
  ctx.fillStyle = MAP2D_COLORS.text;
  ctx.fillText("X to open", screen.x, screen.y - MAP2D_NAME_OFFSET_PX);
}

export function drawMap2dDestination(
  ctx: CanvasRenderingContext2D,
  projection: Map2dProjection,
  destination: Map2dPoint,
): void {
  const screen = worldToScreen(projection, destination);
  ctx.strokeStyle = MAP2D_COLORS.local;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, MAP2D_AVATAR_RADIUS_PX, 0, FULL_CIRCLE_RAD);
  ctx.stroke();
  ctx.fillStyle = MAP2D_COLORS.local;
  ctx.fillText("×", screen.x, screen.y);
}
