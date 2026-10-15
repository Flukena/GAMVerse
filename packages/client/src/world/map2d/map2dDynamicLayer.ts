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
import type { AvatarPortraits } from "./avatarPortraits";
import { playerName } from "../../identity/playerName";
import { map2dHeadRadiusPx, map2dNameFontPx, map2dNamePillTopPx, NAME_PILL_HEIGHT_PADDING_PX } from "./avatarPortraitGeometry";
export type Map2dDecoration = {
  sessionId: string;
  text: string;
  expiresAtMs: number;
};
export type Map2dPlayer = AvatarPose & {
  displayName: string;
  isMaintainer?: boolean;
  username: string;
  status?: string;
  handRaised?: boolean;
  characterId?: string;
};
const FULL_CIRCLE_RAD = Math.PI * 2;
const AVATAR_NOTCH_LENGTH_PX = 7;
const AVATAR_RING_GAP_PX = 4;
const AVATAR_RING_WIDTH_PX = 2;
const STATUS_DOT_RADIUS_PX = 3;
const DECORATION_GAP_PX = 20;
const DECORATION_RISE_PX = 12;
const DECORATION_ANIMATION_PERIOD_MS = 600;
const NAME_PILL_PADDING_PX = 5;
const NAME_PILL_RADIUS_PX = 4;
const NAME_BASELINE_PADDING_PX = 4;
const AVATAR_CHARACTER_PALETTE = [
  "#159bb4", "#b56e59", "#877caf", "#639975", "#ad944f", "#b3659c",
];
function characterColor(characterId = ""): string {
  let hash = 0;
  for (let index = 0; index < characterId.length; index += 1) hash += characterId.charCodeAt(index);
  return AVATAR_CHARACTER_PALETTE[hash % AVATAR_CHARACTER_PALETTE.length] ?? MAP2D_COLORS.avatar;
}
function drawHead(
  ctx: CanvasRenderingContext2D, x: number, y: number, radiusPx: number,
  player: Map2dPlayer, portraits: AvatarPortraits | undefined,
): void {
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, FULL_CIRCLE_RAD);
  ctx.fillStyle = characterColor(player.characterId);
  ctx.fill();
  const portrait = portraits?.get(player.characterId);
  if (portrait) {
    ctx.save();
    ctx.clip();
    ctx.drawImage(portrait, x - radiusPx, y - radiusPx, radiusPx * 2, radiusPx * 2);
    ctx.restore();
  } else {
    ctx.font = `${MAP2D_FONT_PX}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = MAP2D_COLORS.white;
    ctx.fillText(player.displayName.slice(0, 2).toLocaleUpperCase(), x, y);
  }
  ctx.lineWidth = AVATAR_RING_WIDTH_PX;
  ctx.strokeStyle = characterColor(player.characterId);
  ctx.stroke();
}
function drawName(ctx: CanvasRenderingContext2D, x: number, y: number, radiusPx: number,
  fontPx: number, player: Map2dPlayer): void {
  ctx.font = `${fontPx}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const name = `${playerName(player)}${player.handRaised ? " ✋" : ""}`;
  const pillWidthPx = ctx.measureText(name).width + NAME_PILL_PADDING_PX * 2;
  const pillHeightPx = fontPx + NAME_PILL_HEIGHT_PADDING_PX;
  const pillTopPx = map2dNamePillTopPx(y, radiusPx, fontPx);
  ctx.fillStyle = MAP2D_COLORS.white;
  ctx.beginPath();
  ctx.roundRect(x - pillWidthPx / 2, pillTopPx, pillWidthPx, pillHeightPx, NAME_PILL_RADIUS_PX);
  ctx.fill();
  ctx.fillStyle = MAP2D_COLORS.text;
  ctx.fillText(name, x, pillTopPx + pillHeightPx - NAME_BASELINE_PADDING_PX);
}
function outerRingRadiusPx(radiusPx: number, local: boolean, speaking: boolean): number {
  if (speaking) return radiusPx + AVATAR_RING_GAP_PX * 2;
  if (local) return radiusPx + AVATAR_RING_GAP_PX;
  return radiusPx;
}
function drawPlayer(
  ctx: CanvasRenderingContext2D, p: Map2dProjection, player: Map2dPlayer,
  local: boolean, speaking: boolean, portraits: AvatarPortraits | undefined,
): void {
  const screen = worldToScreen(p, player);
  const radiusPx = map2dHeadRadiusPx(p.pxPerM);
  drawHead(ctx, screen.x, screen.y, radiusPx, player, portraits);
  const notchRadiusPx = outerRingRadiusPx(radiusPx, local, speaking);
  ctx.beginPath();
  ctx.moveTo(screen.x + Math.sin(player.rotation) * notchRadiusPx, screen.y + Math.cos(player.rotation) * notchRadiusPx);
  ctx.lineTo(screen.x + Math.sin(player.rotation) * (notchRadiusPx + AVATAR_NOTCH_LENGTH_PX),
    screen.y + Math.cos(player.rotation) * (notchRadiusPx + AVATAR_NOTCH_LENGTH_PX));
  ctx.strokeStyle = MAP2D_COLORS.text;
  ctx.stroke();
  if (local) drawPlayerRing(ctx, screen.x, screen.y, radiusPx + AVATAR_RING_GAP_PX, MAP2D_COLORS.local);
  if (speaking) drawPlayerRing(ctx, screen.x, screen.y, radiusPx + AVATAR_RING_GAP_PX * 2, MAP2D_COLORS.speaking);
  drawName(ctx, screen.x, screen.y, radiusPx, map2dNameFontPx(p.pxPerM), player);
  ctx.beginPath();
  ctx.arc(screen.x + radiusPx, screen.y + radiusPx, STATUS_DOT_RADIUS_PX, 0, FULL_CIRCLE_RAD);
  ctx.fillStyle = player.status === "do-not-disturb" ? MAP2D_COLORS.door : MAP2D_COLORS.speaking;
  ctx.fill();
}
function drawPlayerRing(ctx: CanvasRenderingContext2D, x: number, y: number, radiusPx: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, FULL_CIRCLE_RAD);
  ctx.strokeStyle = color;
  ctx.stroke();
}
export function drawMap2dDynamic(
  ctx: CanvasRenderingContext2D,
  p: Map2dProjection,
  players: ReadonlyMap<string, Map2dPlayer>,
  localId: string | null,
  speaking: ReadonlySet<string>,
  decorations: readonly Map2dDecoration[],
  nowMs: number,
  portraits?: AvatarPortraits,
): void {
  for (const [id, player] of players)
    drawPlayer(
      ctx,
      p,
      player,
      id === localId,
      speaking.has(player.username.toLocaleLowerCase()),
      portraits,
    );
  for (const decoration of decorations) {
    const player = players.get(decoration.sessionId);
    if (!player || decoration.expiresAtMs <= nowMs) continue;
    const screen = worldToScreen(p, player);
    ctx.fillStyle = MAP2D_COLORS.text;
    ctx.font = `${MAP2D_FONT_PX}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(
      decoration.text,
      screen.x,
      map2dNamePillTopPx(screen.y, map2dHeadRadiusPx(p.pxPerM), map2dNameFontPx(p.pxPerM)) -
        DECORATION_GAP_PX -
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
