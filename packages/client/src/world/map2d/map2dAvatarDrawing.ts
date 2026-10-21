import { MAP2D_COLORS } from "./constants";
import { worldToScreen, type Map2dProjection } from "./map2dProjection";
import { map2dHeadRadiusPx } from "./avatarPortraitGeometry";
import type { AvatarPortraits } from "./avatarPortraits";
import type { Map2dPlayer, Map2dAvatarVisual } from "./map2dAvatarVisual";
import { avatarSpriteScreenRect, avatarSpriteSourceRect, avatarSpriteScale } from "./avatarSpriteGeometry";
import { drawAvatarFallback } from "./avatarSpriteFallback";

const FULL_CIRCLE_RAD = Math.PI * 2;
const AVATAR_NOTCH_LENGTH_PX = 7;
const AVATAR_NOTCH_HALF_WIDTH_PX = 3;
const AVATAR_RING_GAP_PX = 4;
const AVATAR_RING_WIDTH_PX = 2;
const STATUS_DOT_RADIUS_PX = 3;
const HAND_GLYPH = "✋";
const HAND_OFFSET_PX = 10;
const HAND_FONT_PX = 13;
type DrawablePlayer = Map2dPlayer & { visual?: Map2dAvatarVisual };

function drawRaisedHand(ctx: CanvasRenderingContext2D, xPx: number, yPx: number, radiusPx: number, scale: number): void {
  ctx.save();
  ctx.font = `${HAND_FONT_PX * scale}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(HAND_GLYPH, xPx + radiusPx + HAND_OFFSET_PX * scale, yPx);
  ctx.restore();
}
function outerRingRadiusPx(radiusPx: number, local: boolean, speaking: boolean, scale: number): number {
  if (speaking) return radiusPx + AVATAR_RING_GAP_PX * 2 * scale;
  if (local) return radiusPx + AVATAR_RING_GAP_PX * scale;
  return radiusPx;
}
export function drawMap2dAvatar(
  ctx: CanvasRenderingContext2D, p: Map2dProjection, player: DrawablePlayer,
  local: boolean, speaking: boolean, portraits: Pick<AvatarPortraits, "get"> | undefined, immersive: boolean, lying = false,
): void {
  const screen = worldToScreen(p, player);
  const radiusPx = map2dHeadRadiusPx(p.pxPerM);
  const sprite = portraits?.get(player.characterId);
  const visual: Map2dAvatarVisual = lying ? { motion: "lying", stridePhaseRad: 0 }
    : player.visual ?? { motion: player.sittingPropId ? "seated" : "idle", stridePhaseRad: 0 };
  if (sprite) {
    const source = avatarSpriteSourceRect(player.rotation, visual);
    const target = avatarSpriteScreenRect(screen.x, screen.y, p.pxPerM);
    ctx.drawImage(sprite, source.x, source.y, source.width, source.height, target.x,
      lying ? screen.y - target.height / 2 : target.y, target.width, target.height);
  } else drawAvatarFallback(ctx, screen.x, screen.y, player, visual, avatarSpriteScale(p.pxPerM));
  const notchRadiusPx = outerRingRadiusPx(radiusPx, local, speaking, avatarSpriteScale(p.pxPerM));
  if (immersive) drawFacing(ctx, screen.x, screen.y, notchRadiusPx, player.rotation, avatarSpriteScale(p.pxPerM));
}
/** Indicators form a separate pass so later portraits cannot cover active participants. */
export function drawMap2dAvatarIndicators(ctx: CanvasRenderingContext2D, p: Map2dProjection,
  player: Map2dPlayer, local: boolean, speaking: boolean): void {
  const screen = worldToScreen(p, player);
  const radiusPx = map2dHeadRadiusPx(p.pxPerM);
  const scale = avatarSpriteScale(p.pxPerM);
  if (local) drawPlayerRing(ctx, screen.x, screen.y, radiusPx + AVATAR_RING_GAP_PX * scale, MAP2D_COLORS.local, scale);
  if (speaking) drawPlayerRing(ctx, screen.x, screen.y, radiusPx + AVATAR_RING_GAP_PX * 2 * scale, MAP2D_COLORS.speaking, scale);
  ctx.beginPath();
  ctx.arc(screen.x + radiusPx, screen.y + radiusPx, STATUS_DOT_RADIUS_PX * scale, 0, FULL_CIRCLE_RAD);
  ctx.fillStyle = player.status === "do-not-disturb" ? MAP2D_COLORS.door : MAP2D_COLORS.speaking;
  ctx.fill();
  if (player.handRaised) drawRaisedHand(ctx, screen.x, screen.y, radiusPx, scale);
}
function drawFacing(ctx: CanvasRenderingContext2D, x: number, y: number, radiusPx: number, rotationRad: number, scale: number): void {
  const sin = Math.sin(rotationRad);
  const cos = Math.cos(rotationRad);
  const baseX = x + sin * radiusPx;
  const baseY = y + cos * radiusPx;
  ctx.beginPath();
  ctx.moveTo(baseX + cos * AVATAR_NOTCH_HALF_WIDTH_PX * scale, baseY - sin * AVATAR_NOTCH_HALF_WIDTH_PX * scale);
  ctx.lineTo(x + sin * (radiusPx + AVATAR_NOTCH_LENGTH_PX * scale), y + cos * (radiusPx + AVATAR_NOTCH_LENGTH_PX * scale));
  ctx.lineTo(baseX - cos * AVATAR_NOTCH_HALF_WIDTH_PX * scale, baseY + sin * AVATAR_NOTCH_HALF_WIDTH_PX * scale);
  ctx.closePath();
  ctx.fillStyle = MAP2D_COLORS.text;
  ctx.fill();
}
function drawPlayerRing(ctx: CanvasRenderingContext2D, x: number, y: number, radiusPx: number, color: string, scale: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, FULL_CIRCLE_RAD);
  ctx.lineWidth = AVATAR_RING_WIDTH_PX * scale;
  ctx.strokeStyle = color;
  ctx.stroke();
}
