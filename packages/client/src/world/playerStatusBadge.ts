import type { UserStatus } from "@gammyverse/shared";
import { CanvasTexture, Sprite, SpriteMaterial } from "three";
import { USER_STATUS_PRESENTATIONS } from "../presencePresentation";

const BADGE_EDGE_PX = 96;
const BADGE_CENTER_PX = BADGE_EDGE_PX / 2;
const BADGE_RADIUS_PX = 43;
const BADGE_STROKE_PX = 6;
const BADGE_TEXT_Y_PX = 50;
const BADGE_SCALE_M = 0.43;
const BADGE_HEIGHT_M = 2.35;
const BADGE_RENDER_ORDER = 11;
const BADGE_INK_COLOR = "#fff";
const BADGE_TEXT_FONT_PX = 52;
const BADGE_TOILET_FONT_PX = 29;
const BADGE_COFFEE_FONT_PX = 43;

export function makeUserStatusBadge(status: UserStatus): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = BADGE_EDGE_PX;
  canvas.height = BADGE_EDGE_PX;
  const context = canvas.getContext("2d")!;
  context.fillStyle = USER_STATUS_PRESENTATIONS[status].color;
  context.beginPath();
  context.arc(BADGE_CENTER_PX, BADGE_CENTER_PX, BADGE_RADIUS_PX, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = BADGE_INK_COLOR;
  context.lineWidth = BADGE_STROKE_PX;
  context.stroke();
  context.fillStyle = BADGE_INK_COLOR;
  const fontPx = status === "toilet" ? BADGE_TOILET_FONT_PX : status === "coffee-break" ? BADGE_COFFEE_FONT_PX : BADGE_TEXT_FONT_PX;
  context.font = `800 ${fontPx}px Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(USER_STATUS_PRESENTATIONS[status].badgeIcon, BADGE_CENTER_PX, BADGE_TEXT_Y_PX);
  const sprite = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), transparent: true, depthTest: false }));
  sprite.scale.set(BADGE_SCALE_M, BADGE_SCALE_M, 1);
  sprite.position.set(0, BADGE_HEIGHT_M, 0);
  sprite.renderOrder = BADGE_RENDER_ORDER;
  sprite.userData.playerStatus = status;
  return sprite;
}
