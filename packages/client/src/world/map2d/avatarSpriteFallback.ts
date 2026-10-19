import { MAP2D_COLORS } from "./constants";
import type { Map2dAvatarVisual, Map2dPlayer } from "./map2dAvatarVisual";

const CHARACTER_PALETTE = ["#159bb4", "#b56e59", "#877caf", "#639975", "#ad944f", "#b3659c"];
const SKIN_COLOR = "#edc7a3";
const HEAD_RADIUS_PX = 8;
const HEAD_TOP_PX = -39;
const FULL_CIRCLE_RAD = Math.PI * 2;
const BODY_RECT_PX = [-8, -30, 16, 19] as const;
const LEFT_ARM_RECT_PX = [-12, -28, 4, 16] as const;
const RIGHT_ARM_RECT_PX = [8, -28, 4, 16] as const;
const LEFT_LEG_X_PX = -7;
const RIGHT_LEG_X_PX = 1;
const LEG_TOP_PX = -12;
const LEG_WIDTH_PX = 6;
const LEG_HEIGHT_PX = 15;
const WALK_SWING_PX = 4;
const CORNER_RADIUS_PX = 3;
const CHAIR_RECT_PX = [-12, -24, 24, 20] as const;
const CHAIR_COLOR = "#556d73";
const CHAIR_LINE_WIDTH_PX = 2;
const EYE_RADIUS_PX = 1;
const EYE_SIDE_OFFSET_PX = 3;
const EYE_TOP_OFFSET_PX = -1;
const FACING_BACK_COS_THRESHOLD = -0.5;
const FACING_EYE_OFFSET_PX = 2;

function characterColor(characterId = ""): string {
  let hash = 0;
  for (let index = 0; index < characterId.length; index += 1) hash += characterId.charCodeAt(index);
  return CHARACTER_PALETTE[hash % CHARACTER_PALETTE.length] ?? MAP2D_COLORS.avatar;
}
function drawFallbackHead(ctx: CanvasRenderingContext2D, rotationRad: number): void {
  ctx.fillStyle = SKIN_COLOR;
  ctx.beginPath(); ctx.arc(0, HEAD_TOP_PX, HEAD_RADIUS_PX, 0, FULL_CIRCLE_RAD); ctx.fill();
  if (Math.cos(rotationRad) < FACING_BACK_COS_THRESHOLD) return;
  const eyeOffsetPx = Math.sin(rotationRad) * FACING_EYE_OFFSET_PX;
  ctx.fillStyle = MAP2D_COLORS.text;
  ctx.beginPath();
  for (const side of [-1, 1]) ctx.arc(eyeOffsetPx + side * EYE_SIDE_OFFSET_PX, HEAD_TOP_PX + EYE_TOP_OFFSET_PX, EYE_RADIUS_PX, 0, FULL_CIRCLE_RAD);
  ctx.fill();
}
/** Visible limbs provide a walking fallback while the selected model atlas loads. */
export function drawAvatarFallback(ctx: CanvasRenderingContext2D, xPx: number, yPx: number,
  player: Map2dPlayer, visual: Map2dAvatarVisual, scale: number): void {
  const swingPx = visual.motion === "walking" ? Math.sin(visual.stridePhaseRad) * WALK_SWING_PX : 0;
  ctx.save(); ctx.translate(xPx, yPx); ctx.scale(scale, scale);
  ctx.fillStyle = MAP2D_COLORS.text;
  ctx.beginPath();
  ctx.roundRect(LEFT_LEG_X_PX, LEG_TOP_PX + swingPx, LEG_WIDTH_PX, LEG_HEIGHT_PX - swingPx, CORNER_RADIUS_PX);
  ctx.roundRect(RIGHT_LEG_X_PX, LEG_TOP_PX - swingPx, LEG_WIDTH_PX, LEG_HEIGHT_PX + swingPx, CORNER_RADIUS_PX);
  ctx.fill();
  ctx.fillStyle = characterColor(player.characterId);
  ctx.beginPath(); ctx.roundRect(...BODY_RECT_PX, CORNER_RADIUS_PX); ctx.fill();
  ctx.fillStyle = SKIN_COLOR;
  ctx.beginPath();
  ctx.roundRect(LEFT_ARM_RECT_PX[0], LEFT_ARM_RECT_PX[1] - swingPx, LEFT_ARM_RECT_PX[2], LEFT_ARM_RECT_PX[3], CORNER_RADIUS_PX);
  ctx.roundRect(RIGHT_ARM_RECT_PX[0], RIGHT_ARM_RECT_PX[1] + swingPx, RIGHT_ARM_RECT_PX[2], RIGHT_ARM_RECT_PX[3], CORNER_RADIUS_PX);
  ctx.fill();
  if (visual.motion === "seated") {
    ctx.strokeStyle = CHAIR_COLOR; ctx.lineWidth = CHAIR_LINE_WIDTH_PX;
    ctx.beginPath(); ctx.roundRect(...CHAIR_RECT_PX, CORNER_RADIUS_PX); ctx.stroke();
  }
  drawFallbackHead(ctx, player.rotation);
  ctx.restore();
}
