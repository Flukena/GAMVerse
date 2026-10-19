import { MAP2D_COLORS, MAP2D_FONT_PX } from "./constants";
import { worldToScreen, type Map2dProjection } from "./map2dProjection";
import { map2dHeadRadiusPx } from "./avatarPortraitGeometry";
import type { AvatarPortraits } from "./avatarPortraits";
import type { Map2dPlayer, Map2dAvatarVisual } from "./map2dAvatarVisual";

const FULL_CIRCLE_RAD = Math.PI * 2;
const AVATAR_NOTCH_LENGTH_PX = 7;
const AVATAR_NOTCH_HALF_WIDTH_PX = 3;
const AVATAR_RING_GAP_PX = 4;
const AVATAR_RING_WIDTH_PX = 2;
const STATUS_DOT_RADIUS_PX = 3;
const AVATAR_SHADOW_COLOR = "rgba(32, 48, 45, 0.24)";
const AVATAR_SHADOW_BLUR_PX = 5;
const AVATAR_SHADOW_OFFSET_PX = 2;
const AVATAR_CHARACTER_PALETTE = [
  "#159bb4", "#b56e59", "#877caf", "#639975", "#ad944f", "#b3659c",
];
const SHOULDER_WIDTH_RATIO = 1.3;
const SHOULDER_TOP_RATIO = 0.6;
const SHOULDER_HEIGHT_RATIO = 0.65;
const BODY_CORNER_RADIUS_PX = 3;
const FOOT_SIDE_OFFSET_PX = 5;
const FOOT_WIDTH_PX = 5;
const FOOT_LENGTH_PX = 6;
const FOOT_REST_OFFSET_PX = 2;
const WALK_FOOT_SWING_PX = 3;
const CHAIR_SIDE_PADDING_PX = 3;
const CHAIR_TOP_RATIO = 0.3;
const CHAIR_HEIGHT_RATIO = 0.9;
const CHAIR_COLOR = "#556d73";
const HAND_GLYPH = "✋";
const HAND_OFFSET_PX = 10;
const HAND_FONT_PX = 13;
type DrawablePlayer = Map2dPlayer & { visual?: Map2dAvatarVisual };

function drawAvatarBody(ctx: CanvasRenderingContext2D, xPx: number, yPx: number, radiusPx: number, player: DrawablePlayer): void {
  const motion = player.visual?.motion ?? (player.sittingPropId ? "seated" : "idle");
  const swingPx = motion === "walking" ? Math.sin(player.visual?.stridePhaseRad ?? 0) * WALK_FOOT_SWING_PX : 0;
  ctx.save();
  ctx.translate(xPx, yPx);
  ctx.rotate(-player.rotation);
  ctx.fillStyle = characterColor(player.characterId);
  ctx.beginPath();
  ctx.roundRect(-radiusPx * SHOULDER_WIDTH_RATIO / 2, radiusPx * SHOULDER_TOP_RATIO,
    radiusPx * SHOULDER_WIDTH_RATIO, radiusPx * SHOULDER_HEIGHT_RATIO, BODY_CORNER_RADIUS_PX);
  ctx.fill();
  if (motion === "seated") {
    ctx.strokeStyle = CHAIR_COLOR;
    ctx.lineWidth = AVATAR_RING_WIDTH_PX;
    ctx.beginPath();
    ctx.roundRect(-radiusPx - CHAIR_SIDE_PADDING_PX, radiusPx * CHAIR_TOP_RATIO,
      (radiusPx + CHAIR_SIDE_PADDING_PX) * 2, radiusPx * CHAIR_HEIGHT_RATIO, BODY_CORNER_RADIUS_PX);
    ctx.stroke();
  } else {
    ctx.fillStyle = MAP2D_COLORS.text;
    ctx.beginPath();
    ctx.roundRect(-FOOT_SIDE_OFFSET_PX - FOOT_WIDTH_PX / 2, radiusPx + FOOT_REST_OFFSET_PX + swingPx,
      FOOT_WIDTH_PX, FOOT_LENGTH_PX, BODY_CORNER_RADIUS_PX);
    ctx.roundRect(FOOT_SIDE_OFFSET_PX - FOOT_WIDTH_PX / 2, radiusPx + FOOT_REST_OFFSET_PX - swingPx,
      FOOT_WIDTH_PX, FOOT_LENGTH_PX, BODY_CORNER_RADIUS_PX);
    ctx.fill();
  }
  ctx.restore();
}
function drawRaisedHand(ctx: CanvasRenderingContext2D, xPx: number, yPx: number, radiusPx: number): void {
  ctx.save();
  ctx.font = `${HAND_FONT_PX}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(HAND_GLYPH, xPx + radiusPx + HAND_OFFSET_PX, yPx);
  ctx.restore();
}
function characterColor(characterId = ""): string {
  let hash = 0;
  for (let index = 0; index < characterId.length; index += 1) hash += characterId.charCodeAt(index);
  return AVATAR_CHARACTER_PALETTE[hash % AVATAR_CHARACTER_PALETTE.length] ?? MAP2D_COLORS.avatar;
}
function drawHead(
  ctx: CanvasRenderingContext2D, x: number, y: number, radiusPx: number,
  player: DrawablePlayer, portraits: AvatarPortraits | undefined, immersive: boolean,
): void {
  ctx.save();
  ctx.shadowColor = AVATAR_SHADOW_COLOR;
  ctx.shadowBlur = immersive ? AVATAR_SHADOW_BLUR_PX : 0;
  ctx.shadowOffsetY = AVATAR_SHADOW_OFFSET_PX;
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, FULL_CIRCLE_RAD);
  ctx.fillStyle = characterColor(player.characterId);
  ctx.fill();
  ctx.shadowColor = "transparent";
  const portrait = immersive ? portraits?.get(player.characterId) : undefined;
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
  ctx.restore();
}
function outerRingRadiusPx(radiusPx: number, local: boolean, speaking: boolean): number {
  if (speaking) return radiusPx + AVATAR_RING_GAP_PX * 2;
  if (local) return radiusPx + AVATAR_RING_GAP_PX;
  return radiusPx;
}
export function drawMap2dAvatar(
  ctx: CanvasRenderingContext2D, p: Map2dProjection, player: DrawablePlayer,
  local: boolean, speaking: boolean, portraits: AvatarPortraits | undefined, immersive: boolean,
): void {
  const screen = worldToScreen(p, player);
  const radiusPx = map2dHeadRadiusPx(p.pxPerM);
  drawAvatarBody(ctx, screen.x, screen.y, radiusPx, player);
  drawHead(ctx, screen.x, screen.y, radiusPx, player, portraits, immersive);
  const notchRadiusPx = outerRingRadiusPx(radiusPx, local, speaking);
  if (immersive) drawFacing(ctx, screen.x, screen.y, notchRadiusPx, player.rotation);
}
/** Indicators form a separate pass so later portraits cannot cover active participants. */
export function drawMap2dAvatarIndicators(ctx: CanvasRenderingContext2D, p: Map2dProjection,
  player: Map2dPlayer, local: boolean, speaking: boolean): void {
  const screen = worldToScreen(p, player);
  const radiusPx = map2dHeadRadiusPx(p.pxPerM);
  if (local) drawPlayerRing(ctx, screen.x, screen.y, radiusPx + AVATAR_RING_GAP_PX, MAP2D_COLORS.local);
  if (speaking) drawPlayerRing(ctx, screen.x, screen.y, radiusPx + AVATAR_RING_GAP_PX * 2, MAP2D_COLORS.speaking);
  ctx.beginPath();
  ctx.arc(screen.x + radiusPx, screen.y + radiusPx, STATUS_DOT_RADIUS_PX, 0, FULL_CIRCLE_RAD);
  ctx.fillStyle = player.status === "do-not-disturb" ? MAP2D_COLORS.door : MAP2D_COLORS.speaking;
  ctx.fill();
  if (player.handRaised) drawRaisedHand(ctx, screen.x, screen.y, radiusPx);
}
function drawFacing(ctx: CanvasRenderingContext2D, x: number, y: number, radiusPx: number, rotationRad: number): void {
  const sin = Math.sin(rotationRad);
  const cos = Math.cos(rotationRad);
  const baseX = x + sin * radiusPx;
  const baseY = y + cos * radiusPx;
  ctx.beginPath();
  ctx.moveTo(baseX + cos * AVATAR_NOTCH_HALF_WIDTH_PX, baseY - sin * AVATAR_NOTCH_HALF_WIDTH_PX);
  ctx.lineTo(x + sin * (radiusPx + AVATAR_NOTCH_LENGTH_PX), y + cos * (radiusPx + AVATAR_NOTCH_LENGTH_PX));
  ctx.lineTo(baseX - cos * AVATAR_NOTCH_HALF_WIDTH_PX, baseY + sin * AVATAR_NOTCH_HALF_WIDTH_PX);
  ctx.closePath();
  ctx.fillStyle = MAP2D_COLORS.text;
  ctx.fill();
}
function drawPlayerRing(ctx: CanvasRenderingContext2D, x: number, y: number, radiusPx: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, FULL_CIRCLE_RAD);
  ctx.strokeStyle = color;
  ctx.stroke();
}
